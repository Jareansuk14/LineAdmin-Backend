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
    
    // Create list of dates to check (7 days: 6 days ago + today)
    const datesToCheck = [];
    for (let i = 6; i >= 0; i--) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      datesToCheck.push(checkDate);
    }
    
    const lockedDates = [];
    const latestDate = datesToCheck[datesToCheck.length - 1];
    
    // Check each date
    for (const checkDate of datesToCheck) {
      // End time = next day 12:00 PM (Bangkok time)
      const endTime = new Date(checkDate);
      endTime.setDate(endTime.getDate() + 1);
      endTime.setHours(12, 0, 0, 0);
      
      const isPastDeadline = bangkokNow >= endTime;
      
      // Get stats for this date
      const stats = await DailyStats.findOne({
        user: userId,
        date: checkDate
      });
      
      if (!stats) {
        continue;
      }
      
      const hasAct = hasActivity(stats);
      const hasDeposit = hasDepositData(stats);
      
      // Lock condition: past deadline + has activity + no deposit
      if (isPastDeadline && hasAct && !hasDeposit) {
        lockedDates.push(checkDate);
      }
    }
    
    // Exclude latest date (today) from locked dates
    const pastDatesLocked = lockedDates.filter(d => {
      const dTime = d.getTime();
      const latestTime = latestDate.getTime();
      return dTime !== latestTime;
    });
    
    return pastDatesLocked;
  } catch (error) {
    console.error(`Error checking lock status for user ${userId}:`, error);
    return [];
  }
}

/**
 * Update locked dates for a user
 */
async function updateUserLockedDates(userId, newLockedDates) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return;
    }
    
    if (!user.lockedDates || !Array.isArray(user.lockedDates)) {
      user.lockedDates = [];
    }
    
    // Convert dates to Date objects and normalize to midnight
    const normalizedNewDates = newLockedDates.map(d => {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      return date;
    });
    
    // Normalize existing locked dates
    const normalizedExistingDates = user.lockedDates.map(d => {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      return date;
    });
    
    // Find dates that need to be added
    const datesToAdd = normalizedNewDates.filter(newDate => {
      return !normalizedExistingDates.some(existingDate => 
        existingDate.getTime() === newDate.getTime()
      );
    });
    
    // Find dates that should be removed (if they have deposit data now)
    const datesToRemove = [];
    for (const existingDate of normalizedExistingDates) {
      const shouldBeLocked = normalizedNewDates.some(newDate =>
        newDate.getTime() === existingDate.getTime()
      );
      
      if (!shouldBeLocked) {
        // Check if this date now has deposit data
        const stats = await DailyStats.findOne({
          user: userId,
          date: existingDate
        });
        
        if (stats && hasDepositData(stats)) {
          datesToRemove.push(existingDate);
        }
      }
    }
    
    // Update locked dates
    if (datesToAdd.length > 0 || datesToRemove.length > 0) {
      // Remove dates that should be removed
      user.lockedDates = user.lockedDates.filter(d => {
        const normalized = new Date(d);
        normalized.setHours(0, 0, 0, 0);
        return !datesToRemove.some(removeDate =>
          removeDate.getTime() === normalized.getTime()
        );
      });
      
      // Add new dates
      datesToAdd.forEach(date => {
        user.lockedDates.push(date);
      });
      
      await user.save();
      
      if (datesToAdd.length > 0) {
        console.log(`User ${user.user} (${userId}): Added ${datesToAdd.length} locked date(s)`);
      }
      if (datesToRemove.length > 0) {
        console.log(`User ${user.user} (${userId}): Removed ${datesToRemove.length} locked date(s) (has deposit now)`);
      }
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
      const lockedDates = await checkUserLockStatus(user._id);
      await updateUserLockedDates(user._id, lockedDates);
      
      totalChecked++;
      if (lockedDates.length > 0) {
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
  updateUserLockedDates
};
