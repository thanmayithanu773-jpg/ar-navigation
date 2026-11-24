/**
 * Location Routes
 */

const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { verifyAdminToken } = require('../middleware/auth');

// Public access routes
router.get('/', locationController.getAllLocations);
router.get('/:id', locationController.getLocationById);

// Protected admin routes
router.post('/', verifyAdminToken, locationController.createLocation);
router.put('/:id', verifyAdminToken, locationController.updateLocation);
router.delete('/:id', verifyAdminToken, locationController.deleteLocation);

module.exports = router;
