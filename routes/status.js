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
        
        // ถ้าออฟไลน์ ให้บันทึก heartbeatCount ล่าสุด
        if (!isOnline && user.heartbeatCount > 0) {
          // Update database to save last heartbeat count (async, don't wait)
          User.findByIdAndUpdate(user._id, { 
            lastHeartbeatCount: user.heartbeatCount,
            heartbeatCount: 0,
            onlineSince: null 
          }).catch(err => 
            console.error('Error saving last heartbeat count:', err)
          );
        }
        
        // คำนวณชั่วโมงการทำงาน
        let heartbeatCount = 0;
        let secondsSinceLastHeartbeat = 0;
        
        if (isOnline) {
          heartbeatCount = user.heartbeatCount || 0;
          // คำนวณวินาทีที่ผ่านไปตั้งแต่ heartbeat ล่าสุด (สูงสุด 60 วินาที)
          if (user.lastHeartbeatAt) {
            secondsSinceLastHeartbeat = Math.min(
              Math.floor((now - new Date(user.lastHeartbeatAt)) / 1000),
              60
            );
          }
        } else {
          // ใช้ lastHeartbeatCount เมื่อออฟไลน์ (ใช้ค่าที่บันทึกไว้แล้ว)
          heartbeatCount = user.lastHeartbeatCount || 0;
          secondsSinceLastHeartbeat = 0; // ไม่นับต่อเมื่อออฟไลน์
        }
        
        // คำนวณชั่วโมง: 60 ครั้ง = 1 ชั่วโมง
        // heartbeatCount เป็นจำนวนครั้งที่ส่งมา (แต่ละครั้ง = 60 วินาที)
        // รวมกับวินาทีที่ผ่านไปตั้งแต่ heartbeat ล่าสุด
        const totalSeconds = (heartbeatCount * 60) + secondsSinceLastHeartbeat;
        
        return {
          userId: user._id.toString(),
          username: user.user,
          isOnline,
          lastHeartbeatAt: user.lastHeartbeatAt,
          heartbeatCount: heartbeatCount,
          secondsSinceLastHeartbeat: isOnline ? secondsSinceLastHeartbeat : 0,
          totalSeconds: totalSeconds
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
