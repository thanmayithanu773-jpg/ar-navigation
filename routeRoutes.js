/**
 * Route / Pathway Routes
 */

const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const { verifyAdminToken } = require('../middleware/auth');

// Public route listing
router.get('/', routeController.getAllRoutes);

// Protected admin routes
router.post('/', verifyAdminToken, routeController.createRoute);
router.put('/:id', verifyAdminToken, routeController.updateRoute);
router.delete('/:id', verifyAdminToken, routeController.deleteRoute);

module.exports = router;
