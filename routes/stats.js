const express = require('express');
const DailyStats = require('../models/DailyStats');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getBangkokTime } = require('../utils/dateHelper');

const router = express.Router();

router.use(authenticateToken);

router.get('/reqtime', (req, res) => {
  try {
    const bangkokTime = getBangkokTime();
    const year = bangkokTime.getFullYear();
    const month = String(bangkokTime.getMonth() + 1).padStart(2, '0');
    const day = String(bangkokTime.getDate()).padStart(2, '0');
    const hours = String(bangkokTime.getHours()).padStart(2, '0');
    const minutes = String(bangkokTime.getMinutes()).padStart(2, '0');
    const seconds = String(bangkokTime.getSeconds()).padStart(2, '0');
    
    const bangkokTimeString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
    
    res.json({
      success: true,
      serverTime: bangkokTimeString,
      timestamp: bangkokTime.getTime(),
      dateTime: bangkokTimeString,
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}:${seconds}`
    });
  } catch (error) {
    console.error('Request time error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while getting time'
    });
  }
});

router.post('/increment', async (req, res) => {
  try {
    const { username, hwid, type, count } = req.body;

    if (!username || !hwid || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: username, hwid, type'
      });
    }

    if (!['registration', 'friend', 'group', 'message'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid type. Must be: registration, friend, group, or message'
      });
    }

    const user = await User.findOne({ user: username });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.hwid && user.hwid !== hwid) {
      return res.status(403).json({
        success: false,
        message: 'HWID mismatch'
      });
    }

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

router.get('/daily', requireAdmin, async (req, res) => {
  try {
    const { date } = req.query;
    const bangkokNow = getBangkokTime();
    
    let queryDate;
    if (date) {
      const parts = date.split('-');
      queryDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0);
    } else {
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

router.get('/history', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

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

router.get('/my-stats', async (req, res) => {
  try {
    const { date } = req.query;
    const userId = req.user.id;
    const bangkokNow = getBangkokTime();
    
    let queryDate;
    if (date) {
      const parts = date.split('-');
      queryDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0);
    } else {
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
          messagesSentCount: stats.messagesSentCount,
          updatedAt: stats.updatedAt
        }
      });
    } else {
      res.json({
        success: true,
        stats: {
          registrationsCount: 0,
          friendsAddedCount: 0,
          groupsCreatedCount: 0,
          messagesSentCount: 0,
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

router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;


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


router.get('/team-summary', requireAdmin, async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }


    const parts = date.split('-');
    const targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0, 0);
    const previousDate = new Date(targetDate);
    previousDate.setDate(previousDate.getDate() - 1);


    const [todayStats, yesterdayStats] = await Promise.all([
      DailyStats.find({ date: targetDate })
        .populate('user', 'user role team')
        .populate({ path: 'user', populate: { path: 'team', select: 'name' } }),
      DailyStats.find({ date: previousDate })
        .populate('user', 'user role team')
        .populate({ path: 'user', populate: { path: 'team', select: 'name' } })
    ]);


    const teamMap = new Map();


    todayStats.forEach(stat => {
      const teamName = stat.user?.team?.name || 'ไม่มีทีม';
      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, {
          teamName,
          today: {
            registrations: 0,
            friends: 0,
            groups: 0,
            messages: 0
          },
          yesterday: {
            registrations: 0,
            friends: 0,
            groups: 0,
            messages: 0
          }
        });
      }
      const team = teamMap.get(teamName);
      team.today.registrations += stat.registrationsCount || 0;
      team.today.friends += stat.friendsAddedCount || 0;
      team.today.groups += stat.groupsCreatedCount || 0;
      team.today.messages += stat.messagesSentCount || 0;
    });


    yesterdayStats.forEach(stat => {
      const teamName = stat.user?.team?.name || 'ไม่มีทีม';
      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, {
          teamName,
          today: {
            registrations: 0,
            friends: 0,
            groups: 0,
            messages: 0
          },
          yesterday: {
            registrations: 0,
            friends: 0,
            groups: 0,
            messages: 0
          }
        });
      }
      const team = teamMap.get(teamName);
      team.yesterday.registrations += stat.registrationsCount || 0;
      team.yesterday.friends += stat.friendsAddedCount || 0;
      team.yesterday.groups += stat.groupsCreatedCount || 0;
      team.yesterday.messages += stat.messagesSentCount || 0;
    });


    const teams = Array.from(teamMap.values()).sort((a, b) => {
      if (a.teamName === 'ไม่มีทีม') return 1;
      if (b.teamName === 'ไม่มีทีม') return -1;
      return a.teamName.localeCompare(b.teamName);
    });


    const totals = teams.reduce((acc, team) => ({
      registrations: acc.registrations + team.today.registrations,
      friends: acc.friends + team.today.friends,
      groups: acc.groups + team.today.groups,
      messages: acc.messages + team.today.messages
    }), {
      registrations: 0,
      friends: 0,
      groups: 0,
      messages: 0
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
