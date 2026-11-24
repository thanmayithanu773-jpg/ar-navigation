/**
 * Admin Routes
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const navigationController = require('../controllers/navigationController');
const { verifyAdminToken } = require('../middleware/auth');

// Authentication
router.post('/login', adminController.adminLogin);

// Protected profile
router.get('/profile', verifyAdminToken, adminController.getAdminProfile);

// Protected destination selection history (persisted NavigationLog entries)
router.get('/destination-history', verifyAdminToken, navigationController.getDestinationHistory);

module.exports = router;
