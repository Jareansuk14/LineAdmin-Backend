const express = require('express');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// SSE endpoint สำหรับดึงสถานะออนไลน์
// Note: SSE doesn't support custom headers well, so we authenticate via query param
router.get('/online-status', async (req, res) => {
  // Set headers for SSE first
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx

  try {
    // Authenticate via query parameter (for SSE compatibility)
    const token = req.query.token;
    if (!token) {
      res.write('event: error\ndata: {"error":"Access token is required"}\n\n');
      return res.end();
    }

    // Verify token manually
    const jwt = require('jsonwebtoken');
    const User = require('../models/User');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || user.role !== 'Admin') {
      res.write('event: error\ndata: {"error":"Admin access required"}\n\n');
      return res.end();
    }
  } catch (error) {
    res.write('event: error\ndata: {"error":"Invalid or expired token"}\n\n');
    return res.end();
  }

  const sendStatus = async () => {
    try {
      const users = await User.find().populate('team', 'name');
      const onlineThreshold = 90; // วินาที (60 + buffer 30)
      const now = new Date();
      
      const statuses = users.map(user => {
        const isOnline = user.lastHeartbeatAt && 
          (now - new Date(user.lastHeartbeatAt)) / 1000 < onlineThreshold;
        
        // ถ้าออฟไลน์และมี onlineSince ให้ clear onlineSince
        if (!isOnline && user.onlineSince) {
          // Update database to clear onlineSince (async, don't wait)
          User.findByIdAndUpdate(user._id, { onlineSince: null }).catch(err => 
            console.error('Error clearing onlineSince:', err)
          );
        }
        
        // คำนวณระยะเวลาออนไลน์
        let onlineDuration = 0;
        if (isOnline && user.onlineSince) {
          onlineDuration = Math.floor((now - new Date(user.onlineSince)) / 1000);
        } else if (!isOnline && user.onlineSince && user.lastHeartbeatAt) {
          // ถ้าออฟไลน์ ให้ใช้เวลาจาก lastHeartbeatAt ถึง onlineSince
          onlineDuration = Math.floor((new Date(user.lastHeartbeatAt) - new Date(user.onlineSince)) / 1000);
        }
        
        return {
          userId: user._id.toString(),
          username: user.user,
          isOnline,
          lastHeartbeatAt: user.lastHeartbeatAt,
          onlineSince: isOnline ? user.onlineSince : null, // ส่ง null ถ้าออฟไลน์
          onlineDuration: onlineDuration
        };
      });
      
      res.write(`data: ${JSON.stringify(statuses)}\n\n`);
    } catch (error) {
      console.error('Status error:', error);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to fetch status' })}\n\n`);
    }
  };

  // Send initial status
  await sendStatus();

  // Send updates every 60 seconds
  const interval = setInterval(sendStatus, 60000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

module.exports = router;
