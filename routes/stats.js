const express = require('express');
const DailyStats = require('../models/DailyStats');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Increment stats (called from C# app)
router.post('/increment', async (req, res) => {
  try {
    const { username, hwid, type, count } = req.body;

    // Validate input
    if (!username || !hwid || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: username, hwid, type'
      });
    }

    if (!['registration', 'friend', 'group'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid type. Must be: registration, friend, or group'
      });
    }

    // Find user by username
    const user = await User.findOne({ user: username });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify HWID matches
    if (user.hwid && user.hwid !== hwid) {
      return res.status(403).json({
        success: false,
        message: 'HWID mismatch'
      });
    }

    // Increment stats
    const stats = await DailyStats.incrementStats(
      user._id,
      type,
      count || 1
    );

    res.json({
      success: true,
      message: 'Stats updated successfully',
      stats
    });

  } catch (error) {
    console.error('Increment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating stats'
    });
  }
});

// Get daily stats for all users (Admin only)
router.get('/daily', requireAdmin, async (req, res) => {
  try {
    const { date } = req.query;
    
    // Convert to Bangkok time (UTC+7)
    const now = new Date();
    const bangkokOffset = 7 * 60;
    const localOffset = now.getTimezoneOffset();
    const bangkokNow = new Date(now.getTime() + (bangkokOffset + localOffset) * 60000);
    
    let queryDate;
    if (date) {
      // Parse provided date as Bangkok date
      const parts = date.split('-');
      queryDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0);
    } else {
      // Use today in Bangkok timezone
      queryDate = new Date(bangkokNow.getFullYear(), bangkokNow.getMonth(), bangkokNow.getDate(), 0, 0, 0, 0);
    }

    const stats = await DailyStats.find({ date: queryDate })
      .populate('user', 'user role')
      .populate({
        path: 'user',
        populate: {
          path: 'team',
          select: 'name'
        }
      })
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      date: queryDate,
      stats
    });

  } catch (error) {
    console.error('Get daily stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching stats'
    });
  }
});

// Get stats history (Admin only)
router.get('/history', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    // Build query
    const query = {};
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const parts = startDate.split('-');
        const start = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (endDate) {
        const parts = endDate.split('-');
        const end = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    if (userId) {
      query.user = userId;
    }

    const stats = await DailyStats.find(query)
      .populate('user', 'user role')
      .populate({
        path: 'user',
        populate: {
          path: 'team',
          select: 'name'
        }
      })
      .sort({ date: -1, updatedAt: -1 });

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Get stats history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching history'
    });
  }
});

// Get my stats (User only - their own stats)
router.get('/my-stats', async (req, res) => {
  try {
    const { date } = req.query;
    
    // Get user ID from authenticated request
    const userId = req.user.id;
    
    // Convert to Bangkok time (UTC+7)
    const now = new Date();
    const bangkokOffset = 7 * 60;
    const localOffset = now.getTimezoneOffset();
    const bangkokNow = new Date(now.getTime() + (bangkokOffset + localOffset) * 60000);
    
    let queryDate;
    if (date) {
      // Parse provided date as Bangkok date
      const parts = date.split('-');
      queryDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0);
    } else {
      // Use today in Bangkok timezone
      queryDate = new Date(bangkokNow.getFullYear(), bangkokNow.getMonth(), bangkokNow.getDate(), 0, 0, 0, 0);
    }

    const stats = await DailyStats.findOne({ 
      user: userId, 
      date: queryDate 
    });

    if (stats) {
      res.json({
        success: true,
        stats: {
          registrationsCount: stats.registrationsCount,
          friendsAddedCount: stats.friendsAddedCount,
          groupsCreatedCount: stats.groupsCreatedCount,
          depositCount: stats.depositCount,
          depositAmount: stats.depositAmount,
          updatedAt: stats.updatedAt
        }
      });
    } else {
      // No stats for this date
      res.json({
        success: true,
        stats: {
          registrationsCount: 0,
          friendsAddedCount: 0,
          groupsCreatedCount: 0,
          depositCount: null,
          depositAmount: null,
          updatedAt: null
        }
      });
    }

  } catch (error) {
    console.error('Get my stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching stats'
    });
  }
});

// Update deposit stats (User only - called from LineDaily)
router.put('/update-deposit', async (req, res) => {
  try {
    const { username, hwid, date, depositCount, depositAmount } = req.body;
    const clientType = req.headers['x-client-type'];

    if (!username || !date || depositCount === undefined || depositAmount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: username, date, depositCount, depositAmount'
      });
    }

    // HWID is only required for LineAPIBot
    if (clientType === 'LineAPIBot' && !hwid) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: hwid'
      });
    }

    if (!Number.isInteger(depositCount) || depositCount < 0) {
      return res.status(400).json({
        success: false,
        message: 'depositCount must be a non-negative integer'
      });
    }

    if (typeof depositAmount !== 'number' || depositAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'depositAmount must be a non-negative number'
      });
    }

    const user = await User.findOne({ user: username });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Only verify HWID for LineAPIBot
    if (clientType === 'LineAPIBot') {
      if (user.hwid && user.hwid !== hwid) {
        return res.status(403).json({
          success: false,
          message: 'HWID mismatch'
        });
      }
    }
    // For LineAdmin Frontend and LineDaily, skip HWID check

    const parts = date.split('-');
    const targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0);

    const existingStats = await DailyStats.findOne({ user: user._id, date: targetDate });
    if (!existingStats) {
      return res.status(400).json({
        success: false,
        message: 'No stats found for this date. Cannot add deposit to a day with no activity.'
      });
    }

    const hasActivity = existingStats.registrationsCount > 0 || 
                       existingStats.friendsAddedCount > 0 || 
                       existingStats.groupsCreatedCount > 0;

    if (!hasActivity) {
      return res.status(400).json({
        success: false,
        message: 'Cannot add deposit to a day with no activity'
      });
    }

    if (existingStats.depositCount !== null || existingStats.depositAmount !== null) {
      return res.status(400).json({
        success: false,
        message: 'Deposit already recorded for this date. Cannot modify.'
      });
    }

    existingStats.depositCount = depositCount;
    existingStats.depositAmount = depositAmount;
    await existingStats.save();

    res.json({
      success: true,
      message: 'Deposit stats updated successfully',
      stats: existingStats
    });

  } catch (error) {
    console.error('Update deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating deposit'
    });
  }
});

// Get summary stats (Admin only)
router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build match query
    const matchQuery = {};
    if (startDate || endDate) {
      matchQuery.date = {};
      if (startDate) {
        const parts = startDate.split('-');
        const start = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0);
        matchQuery.date.$gte = start;
      }
      if (endDate) {
        const parts = endDate.split('-');
        const end = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59, 999);
        matchQuery.date.$lte = end;
      }
    }

    const summary = await DailyStats.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalRegistrations: { $sum: '$registrationsCount' },
          totalFriends: { $sum: '$friendsAddedCount' },
          totalGroups: { $sum: '$groupsCreatedCount' }
        }
      }
    ]);

    res.json({
      success: true,
      summary: summary.length > 0 ? summary[0] : {
        totalRegistrations: 0,
        totalFriends: 0,
        totalGroups: 0
      }
    });

  } catch (error) {
    console.error('Get summary stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching summary'
    });
  }
});

// Get team summary stats (Admin only - for image generation)
router.get('/team-summary', requireAdmin, async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }

    // Parse dates
    const parts = date.split('-');
    const targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0);
    const previousDate = new Date(targetDate);
    previousDate.setDate(previousDate.getDate() - 1);

    // Get stats for both dates
    const [todayStats, yesterdayStats] = await Promise.all([
      DailyStats.find({ date: targetDate })
        .populate('user', 'user role team')
        .populate({ path: 'user', populate: { path: 'team', select: 'name' } }),
      DailyStats.find({ date: previousDate })
        .populate('user', 'user role team')
        .populate({ path: 'user', populate: { path: 'team', select: 'name' } })
    ]);

    // Group by team
    const teamMap = new Map();

    // Process today's stats
    todayStats.forEach(stat => {
      const teamName = stat.user?.team?.name || 'ไม่มีทีม';
      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, {
          teamName,
          today: {
            registrations: 0,
            friends: 0,
            groups: 0,
            depositCount: 0,
            depositAmount: 0
          },
          yesterday: {
            registrations: 0,
            friends: 0,
            groups: 0,
            depositCount: 0,
            depositAmount: 0
          }
        });
      }
      const team = teamMap.get(teamName);
      team.today.registrations += stat.registrationsCount || 0;
      team.today.friends += stat.friendsAddedCount || 0;
      team.today.groups += stat.groupsCreatedCount || 0;
      if (stat.depositCount !== null) team.today.depositCount += stat.depositCount;
      if (stat.depositAmount !== null) team.today.depositAmount += stat.depositAmount;
    });

    // Process yesterday's stats
    yesterdayStats.forEach(stat => {
      const teamName = stat.user?.team?.name || 'ไม่มีทีม';
      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, {
          teamName,
          today: {
            registrations: 0,
            friends: 0,
            groups: 0,
            depositCount: 0,
            depositAmount: 0
          },
          yesterday: {
            registrations: 0,
            friends: 0,
            groups: 0,
            depositCount: 0,
            depositAmount: 0
          }
        });
      }
      const team = teamMap.get(teamName);
      team.yesterday.registrations += stat.registrationsCount || 0;
      team.yesterday.friends += stat.friendsAddedCount || 0;
      team.yesterday.groups += stat.groupsCreatedCount || 0;
      if (stat.depositCount !== null) team.yesterday.depositCount += stat.depositCount;
      if (stat.depositAmount !== null) team.yesterday.depositAmount += stat.depositAmount;
    });

    // Convert to array and calculate totals
    const teams = Array.from(teamMap.values()).sort((a, b) => {
      if (a.teamName === 'ไม่มีทีม') return 1;
      if (b.teamName === 'ไม่มีทีม') return -1;
      return a.teamName.localeCompare(b.teamName);
    });

    // Calculate grand totals
    const totals = teams.reduce((acc, team) => ({
      registrations: acc.registrations + team.today.registrations,
      friends: acc.friends + team.today.friends,
      groups: acc.groups + team.today.groups,
      depositCount: acc.depositCount + team.today.depositCount,
      depositAmount: acc.depositAmount + team.today.depositAmount,
      yesterdayDepositCount: acc.yesterdayDepositCount + team.yesterday.depositCount,
      yesterdayDepositAmount: acc.yesterdayDepositAmount + team.yesterday.depositAmount
    }), {
      registrations: 0,
      friends: 0,
      groups: 0,
      depositCount: 0,
      depositAmount: 0,
      yesterdayDepositCount: 0,
      yesterdayDepositAmount: 0
    });

    res.json({
      success: true,
      date: targetDate,
      previousDate: previousDate,
      teams,
      totals
    });

  } catch (error) {
    console.error('Get team summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching team summary'
    });
  }
});

module.exports = router;
