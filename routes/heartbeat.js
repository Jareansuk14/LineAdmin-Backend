const express = require('express');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Heartbeat endpoint สำหรับ LineAPIBot
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    
    // หา user ปัจจุบันเพื่อเช็คสถานะ
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const onlineThreshold = 90; // วินาที
    const wasOnline = user.lastHeartbeatAt && 
      (now - new Date(user.lastHeartbeatAt)) / 1000 < onlineThreshold;
    
    const updateData = {
      lastHeartbeatAt: now
    };
    
    // ถ้าเปลี่ยนจากออฟไลน์เป็นออนไลน์ หรือยังไม่มี onlineSince ให้ตั้งค่า onlineSince
    if (!wasOnline || !user.onlineSince) {
      updateData.onlineSince = now;
    }
    
    await User.findByIdAndUpdate(userId, updateData);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
