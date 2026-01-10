const express = require('express');
const { body, validationResult } = require('express-validator');
const Team = require('../models/Team');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all teams
router.get('/', async (req, res) => {
  try {
    const teams = await Team.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      teams
    });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching teams'
    });
  }
});

// Get single team by ID
router.get('/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    res.json({
      success: true,
      team
    });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching team'
    });
  }
});

// Create new team (Admin only)
router.post('/', [
  requireAdmin,
  body('name')
    .notEmpty()
    .withMessage('Team name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Team name must be between 1-100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
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

    const { name, description } = req.body;

    // Check if team name already exists
    const existingTeam = await Team.findOne({ name });
    if (existingTeam) {
      return res.status(400).json({
        success: false,
        message: 'Team name already exists'
      });
    }

    // Create new team
    const newTeam = new Team({
      name,
      description: description || ''
    });

    await newTeam.save();

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      team: newTeam
    });

  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating team'
    });
  }
});

// Update team (Admin only)
router.put('/:id', [
  requireAdmin,
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Team name must be between 1-100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
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

    const { name, description } = req.body;
    const updateData = {};

    if (name) {
      // Check if new name already exists
      const existingTeam = await Team.findOne({ name, _id: { $ne: req.params.id } });
      if (existingTeam) {
        return res.status(400).json({
          success: false,
          message: 'Team name already exists'
        });
      }
      updateData.name = name;
    }
    if (description !== undefined) {
      updateData.description = description;
    }

    // Find team and update
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Update fields
    Object.assign(team, updateData);
    await team.save();

    res.json({
      success: true,
      message: 'Team updated successfully',
      team
    });

  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating team'
    });
  }
});

// Delete team (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Check if team has users
    const User = require('../models/User');
    const userCount = await User.countDocuments({ team: req.params.id });
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete team with existing users. Please reassign users first.'
      });
    }

    await Team.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Team deleted successfully'
    });

  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting team'
    });
  }
});

module.exports = router;

