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
    
    // Parse date or use today
    let queryDate = new Date();
    if (date) {
      queryDate = new Date(date + 'T00:00:00.000Z'); // Force UTC
    } else {
      queryDate.setUTCHours(0, 0, 0, 0);
    }
    
    // Create date range for the entire day
    const startOfDay = new Date(queryDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    
    const endOfDay = new Date(queryDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const stats = await DailyStats.find({ 
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    })
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
        const start = new Date(startDate + 'T00:00:00.000Z');
        query.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate + 'T23:59:59.999Z');
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

// Get summary stats (Admin only)
router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build match query
    const matchQuery = {};
    if (startDate || endDate) {
      matchQuery.date = {};
      if (startDate) {
        const start = new Date(startDate + 'T00:00:00.000Z');
        matchQuery.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate + 'T23:59:59.999Z');
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

module.exports = router;
