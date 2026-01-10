const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all users (Admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await User.find().populate('team', 'name').sort({ createdAt: -1 });
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users'
    });
  }
});

// Get single user by ID (Admin only)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('team', 'name');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user'
    });
  }
});

// Create new user (Admin only)
router.post('/', [
  requireAdmin,
  body('user')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3-50 characters'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 4 })
    .withMessage('Password must be at least 4 characters long'),
  body('role')
    .notEmpty()
    .withMessage('Role is required')
    .isIn(['Admin', 'User'])
    .withMessage('Role must be either Admin or User'),
  body('team')
    .optional()
    .isMongoId()
    .withMessage('Team must be a valid MongoDB ObjectId')
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

    const { user, password, role, team } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ user });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Validate team if provided
    if (team) {
      const Team = require('../models/Team');
      const teamExists = await Team.findById(team);
      if (!teamExists) {
        return res.status(400).json({
          success: false,
          message: 'Team not found'
        });
      }
    }

    // Create new user
    const newUser = new User({
      user,
      password,
      role,
      team: team || null
    });

    await newUser.save();
    
    // Populate team for response
    await newUser.populate('team', 'name');

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: newUser
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating user'
    });
  }
});

// Update user (Admin only)
router.put('/:id', [
  requireAdmin,
  body('password')
    .optional()
    .isLength({ min: 4 })
    .withMessage('Password must be at least 4 characters long'),
  body('role')
    .optional()
    .isIn(['Admin', 'User'])
    .withMessage('Role must be either Admin or User'),
  body('team')
    .optional()
    .custom((value) => {
      if (value === null || value === '') return true; // Allow null/empty to remove team
      return require('mongoose').Types.ObjectId.isValid(value);
    })
    .withMessage('Team must be a valid MongoDB ObjectId or empty')
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

    const { password, role, team } = req.body;
    const updateData = {};

    if (password) {
      updateData.password = password;
    }
    if (role) {
      updateData.role = role;
    }
    if (team !== undefined) {
      // Allow null to remove team assignment
      if (team === null || team === '') {
        updateData.team = null;
      } else {
        // Validate team exists
        const Team = require('../models/Team');
        const teamExists = await Team.findById(team);
        if (!teamExists) {
          return res.status(400).json({
            success: false,
            message: 'Team not found'
          });
        }
        updateData.team = team;
      }
    }

    // Find user and update
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update fields
    Object.assign(user, updateData);
    await user.save();
    
    // Populate team for response
    await user.populate('team', 'name');

    res.json({
      success: true,
      message: 'User updated successfully',
      user
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user'
    });
  }
});

// Delete user (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting the last admin
    if (user.role === 'Admin') {
      const adminCount = await User.countDocuments({ role: 'Admin' });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the last admin user'
        });
      }
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    });
  }
});

module.exports = router;
