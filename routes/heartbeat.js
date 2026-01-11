const express = require('express');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Heartbeat endpoint สำหรับ LineAPIBot
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await User.findByIdAndUpdate(userId, {
      lastHeartbeatAt: new Date()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
