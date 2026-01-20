const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', [
  body('user').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { user, password, hwid, clientVersion } = req.body;
    const clientType = req.headers['x-client-type'];

    const foundUser = await User.findOne({ user });
    if (!foundUser) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    const isPasswordValid = await foundUser.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    if (clientType === 'LineAPIBot') {
      if (hwid) {
        if (foundUser.hwid && foundUser.hwid !== hwid) {
          return res.status(403).json({
            success: false,
            message: 'บัญชีนี้ถูกผูกกับเครื่องอื่นแล้ว ไม่สามารถใช้งานได้'
          });
        }
        
        if (!foundUser.hwid) {
          foundUser.hwid = hwid;
        }
      } else {
        if (foundUser.hwid) {
          return res.status(400).json({
            success: false,
            message: 'HWID is required for this account'
          });
        }
      }
      
      if (clientVersion) {
        foundUser.clientVersion = clientVersion;
      }
    }
    // For LineAdmin Frontend and LineDaily, skip HWID check

    const userIP = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   req.ip;

    foundUser.lastLoginAt = new Date();
    foundUser.lastLoginIP = userIP;
    await foundUser.save();

    // Populate team before sending response
    await foundUser.populate('team', 'name');

    const token = generateToken(foundUser._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: foundUser._id,
        user: foundUser.user,
        role: foundUser.role,
        team: foundUser.team ? {
          id: foundUser.team._id,
          name: foundUser.team.name
        } : null,
        hwid: foundUser.hwid
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('team', 'name');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        user: user.user,
        role: user.role,
        team: user.team ? {
          id: user.team._id,
          name: user.team.name
        } : null
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user'
    });
  }
});

module.exports = router;
