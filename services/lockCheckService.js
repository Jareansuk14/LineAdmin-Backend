const User = require('../models/User');
const DailyStats = require('../models/DailyStats');

/**
 * Get Bangkok time (UTC+7)
 */
function getBangkokTime() {
  const now = new Date();
  const bangkokOffset = 7 * 60; // Bangkok is UTC+7 in minutes
  const localOffset = now.getTimezoneOffset(); // Get local timezone offset
  return new Date(now.getTime() + (bangkokOffset + localOffset) * 60000);
}

/**
 * Check if stats has activity
 */
function hasActivity(stats) {
  return (stats.registrationsCount > 0 ||
          stats.friendsAddedCount > 0 ||
          stats.groupsCreatedCount > 0 ||
          stats.messagesSentCount > 0);
}

/**
 * Check if stats has deposit data
 */
function hasDepositData(stats) {
  return stats && 
         stats.depositCount !== null && 
         stats.depositAmount !== null;
}

/**
 * Check lock status for a single user
 * Returns array of dates that should be locked
 */
async function checkUserLockStatus(userId) {
  try {
    const bangkokNow = getBangkokTime();
    const today = new Date(bangkokNow.getFullYear(), bangkokNow.getMonth(), bangkokNow.getDate(), 0, 0, 0, 0);
    
    const datesToCheck = [];
    for (let i = 6; i >= 0; i--) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      datesToCheck.push(checkDate);
    }
    
    const lockedDates = [];
    const activeDates = [];
    const latestDate = datesToCheck[datesToCheck.length - 1];
    
    for (const checkDate of datesToCheck) {
      const stats = await DailyStats.findOne({
        user: userId,
        date: checkDate
      });
      
      if (!stats) {
        continue;
      }
      
      const hasAct = hasActivity(stats);
      const hasDeposit = hasDepositData(stats);
      
      if (!hasAct || hasDeposit) {
        continue;
      }
      
      const isToday = checkDate.getTime() === latestDate.getTime();
      
      if (isToday) {
        const submitTime = new Date(checkDate);
        submitTime.setHours(23, 0, 0, 0);
        
        activeDates.push({
          date: checkDate.toISOString().split('T')[0],
          hasActivity: true,
          hasDeposit: false,
          canSubmitAt: submitTime.toISOString(),
          isSubmittable: bangkokNow >= submitTime
        });
      } else {
        const deadline = new Date(checkDate);
        deadline.setDate(deadline.getDate() + 1);
        deadline.setHours(12, 0, 0, 0);
        
        const isPastDeadline = bangkokNow >= deadline;
        
        if (isPastDeadline) {
          lockedDates.push(checkDate);
        }
      }
    }
    
    return { lockedDates, activeDates };
  } catch (error) {
    console.error(`Error checking lock status for user ${userId}:`, error);
    return { lockedDates: [], activeDates: [] };
  }
}

/**
 * Update locked dates for a user
 */
async function updateUserLockedDates(userId, lockResult) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return;
    }
    
    if (!user.lockedDates || !Array.isArray(user.lockedDates)) {
      user.lockedDates = [];
    }
    
    if (!user.activeDates || !Array.isArray(user.activeDates)) {
      user.activeDates = [];
    }
    
    const newLockedDates = lockResult.lockedDates || [];
    const newActiveDates = lockResult.activeDates || [];
    
    const normalizedNewDates = newLockedDates.map(d => {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      return date;
    });
    
    const normalizedExistingDates = user.lockedDates.map(d => {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      return date;
    });
    
    const datesToAdd = normalizedNewDates.filter(newDate => {
      return !normalizedExistingDates.some(existingDate => 
        existingDate.getTime() === newDate.getTime()
      );
    });
    
    const datesToRemove = [];
    for (const existingDate of normalizedExistingDates) {
      const shouldBeLocked = normalizedNewDates.some(newDate =>
        newDate.getTime() === existingDate.getTime()
      );
      
      if (!shouldBeLocked) {
        const stats = await DailyStats.findOne({
          user: userId,
          date: existingDate
        });
        
        if (stats && hasDepositData(stats)) {
          datesToRemove.push(existingDate);
        }
      }
    }
    
    let hasChanges = false;
    
    if (datesToAdd.length > 0 || datesToRemove.length > 0) {
      user.lockedDates = user.lockedDates.filter(d => {
        const normalized = new Date(d);
        normalized.setHours(0, 0, 0, 0);
        return !datesToRemove.some(removeDate =>
          removeDate.getTime() === normalized.getTime()
        );
      });
      
      datesToAdd.forEach(date => {
        user.lockedDates.push(date);
      });
      
      hasChanges = true;
      
      if (datesToAdd.length > 0) {
        console.log(`User ${user.user} (${userId}): Added ${datesToAdd.length} locked date(s)`);
      }
      if (datesToRemove.length > 0) {
        console.log(`User ${user.user} (${userId}): Removed ${datesToRemove.length} locked date(s) (has deposit now)`);
      }
    }
    
    const activeDatesChanged = JSON.stringify(user.activeDates) !== JSON.stringify(newActiveDates);
    
    if (activeDatesChanged) {
      user.activeDates = newActiveDates;
      hasChanges = true;
      console.log(`User ${user.user} (${userId}): Updated ${newActiveDates.length} active date(s)`);
    }
    
    if (hasChanges) {
      await user.save();
    }
  } catch (error) {
    console.error(`Error updating locked dates for user ${userId}:`, error);
  }
}

/**
 * Check and update lock status for all users
 */
async function checkAllUsersLockStatus() {
  try {
    console.log(`[Lock Check] Starting lock status check at ${getBangkokTime().toISOString()}`);
    
    const users = await User.find({});
    let totalChecked = 0;
    let totalLocked = 0;
    
    for (const user of users) {
      const lockResult = await checkUserLockStatus(user._id);
      await updateUserLockedDates(user._id, lockResult);
      
      totalChecked++;
      if (lockResult.lockedDates.length > 0) {
        totalLocked++;
      }
    }
    
    console.log(`[Lock Check] Completed: Checked ${totalChecked} users, ${totalLocked} users have locked dates`);
  } catch (error) {
    console.error('[Lock Check] Error checking all users:', error);
  }
}

module.exports = {
  checkAllUsersLockStatus,
  checkUserLockStatus,
  updateUserLockedDates,
  getBangkokTime
};
