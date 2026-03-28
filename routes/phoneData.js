const express = require('express');
const { body, validationResult } = require('express-validator');
const PhoneData = require('../models/PhoneData');
const UploadHistory = require('../models/UploadHistory');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const normalizeThaiMobile10 = (input) => {
  if (!input || typeof input !== 'string') return null;
  
  const trimmed = input.trim();
  let digitsOnly = trimmed.replace(/\D/g, '');
  
  if (trimmed.startsWith('+')) {
    if (!trimmed.startsWith('+66')) return null;
    if (!digitsOnly.startsWith('66')) return null;
    const national = digitsOnly.length > 2 ? digitsOnly.substring(2) : '';
    digitsOnly = '0' + national;
  }
  
  if (digitsOnly.length !== 10) return null;
  
  const prefix2 = digitsOnly.substring(0, 2);
  if (prefix2 !== '06' && prefix2 !== '08' && prefix2 !== '09') return null;
  
  return digitsOnly;
};

const normalizePhoneNumbers = (lines) => {
  const result = [];
  const seen = new Set();
  
  for (const line of lines) {
    const normalized = normalizeThaiMobile10(line);
    if (normalized === null) continue;
    
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  
  return result;
};

router.get('/team-members', authenticateToken, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id).populate('team');
    
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const allowedRoles = ['Head', 'Admin', 'Audit'];
    if (!allowedRoles.includes(currentUser.role)) {
      return res.status(403).json({ success: false, message: 'Access denied. Head, Admin, or Audit role required.' });
    }
    
    let query = {};
    const { teamId } = req.query;
    
    if (currentUser.role === 'Audit' && teamId) {
      query = { team: teamId };
    }
    
    const members = await User.find(query)
      .select('user role lastLoginAt team')
      .populate('team', 'name')
      .sort({ lastLoginAt: -1 });
    
    res.json({ success: true, members, canUpload: currentUser.role !== 'Audit' });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/upload',
  authenticateToken,
  [
    body('targetUserId').notEmpty().withMessage('Target user ID is required'),
    body('phoneNumbers').isArray({ min: 1 }).withMessage('Phone numbers array is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      
      const currentUser = await User.findById(req.user.id);
      if (!currentUser || (currentUser.role !== 'Head' && currentUser.role !== 'Admin')) {
        return res.status(403).json({ success: false, message: 'Access denied. Head or Admin role required.' });
      }
      
      const { targetUserId, phoneNumbers, fileName } = req.body;
      
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'Target user not found' });
      }
      
      const normalizedNumbers = normalizePhoneNumbers(phoneNumbers);
      
      if (normalizedNumbers.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid phone numbers found' });
      }
      
      const phoneData = new PhoneData({
        targetUser: targetUserId,
        uploadedBy: req.user.id,
        phoneNumbers: normalizedNumbers,
        totalCount: normalizedNumbers.length,
        fileName: fileName
      });
      
      await phoneData.save();
      
      const uploadHistory = new UploadHistory({
        targetUser: targetUserId,
        uploadedBy: req.user.id,
        totalCount: normalizedNumbers.length,
        uploadedAt: phoneData.uploadedAt,
        phoneDataId: phoneData._id,
        fileName: fileName
      });
      
      await uploadHistory.save();
      
      res.json({
        success: true,
        message: 'Phone data uploaded successfully',
        data: {
          id: phoneData._id,
          totalCount: normalizedNumbers.length,
          uploadedAt: phoneData.uploadedAt,
          fileName: fileName
        }
      });
    } catch (error) {
      console.error('Upload phone data error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

router.post('/validate',
  authenticateToken,
  [
    body('phoneNumbers').isArray({ min: 1 }).withMessage('Phone numbers array is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      
      const { phoneNumbers } = req.body;
      const normalizedNumbers = normalizePhoneNumbers(phoneNumbers);
      
      res.json({
        success: true,
        originalCount: phoneNumbers.length,
        validCount: normalizedNumbers.length,
        invalidCount: phoneNumbers.length - normalizedNumbers.length,
        phoneNumbers: normalizedNumbers
      });
    } catch (error) {
      console.error('Validate phone numbers error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

router.get('/history/:userId', authenticateToken, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const allowedRoles = ['Head', 'Admin', 'Audit'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const { userId } = req.params;
    
    const history = await UploadHistory.find({ 
      targetUser: userId
    })
      .select('totalCount uploadedAt isDownloaded downloadedAt uploadedBy isDeleted deletedAt fileName')
      .populate('uploadedBy', 'user')
      .sort({ uploadedAt: -1 });
    
    res.json({ success: true, history });
  } catch (error) {
    console.error('Get upload history error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const pendingData = await PhoneData.find({
      targetUser: userId,
      isDownloaded: false
    })
      .select('phoneNumbers totalCount uploadedAt uploadedBy fileName')
      .populate('uploadedBy', 'user')
      .sort({ uploadedAt: 1 });
    
    res.json({ 
      success: true, 
      hasPending: pendingData.length > 0,
      pendingCount: pendingData.length,
      data: pendingData
    });
  } catch (error) {
    console.error('Get pending data error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/mark-downloaded/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const phoneData = await PhoneData.findOne({
      _id: id,
      targetUser: userId
    });
    
    if (!phoneData) {
      return res.status(404).json({ success: false, message: 'Phone data not found' });
    }
    
    const now = new Date();
    phoneData.isDownloaded = true;
    phoneData.downloadedAt = now;
    await phoneData.save();
    
    // Update upload history
    await UploadHistory.findOneAndUpdate(
      { phoneDataId: id },
      { isDownloaded: true, downloadedAt: now }
    );
    
    res.json({ success: true, message: 'Marked as downloaded' });
  } catch (error) {
    console.error('Mark downloaded error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const phoneData = await PhoneData.findOne({
      _id: id,
      targetUser: userId
    });
    
    if (!phoneData) {
      return res.status(404).json({ success: false, message: 'Phone data not found' });
    }
    
    // Update upload history to mark as deleted
    await UploadHistory.findOneAndUpdate(
      { phoneDataId: id },
      { isDeleted: true, deletedAt: new Date(), phoneDataId: null }
    );
    
    // Hard delete phone data to save space
    await PhoneData.findByIdAndDelete(id);
    
    res.json({ success: true, message: 'Phone data deleted' });
  } catch (error) {
    console.error('Delete phone data error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
