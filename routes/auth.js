const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Login route
router.post('/login', [
  body('user').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { user, password } = req.body;

    // Find user by username
    const foundUser = await User.findOne({ user });
    if (!foundUser) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Check password
    const isPasswordValid = await foundUser.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Get user IP address
    const userIP = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   req.ip;

    // Update last login time and IP
    foundUser.lastLoginAt = new Date();
    foundUser.lastLoginIP = userIP;
    await foundUser.save();

    // Generate token
    const token = generateToken(foundUser._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: foundUser._id,
        user: foundUser.user,
        role: foundUser.role
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

module.exports = router;
