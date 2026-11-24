/**
 * Navigation Routes
 */

const express = require('express');
const router = express.Router();
const navigationController = require('../controllers/navigationController');

// Calculate shortest pathway using Dijkstra's algorithm
router.post('/calculate', navigationController.calculateRoute);

// Log navigation start/arrival status
router.post('/log', navigationController.logNavigation);

// Dashboard statistics
router.get('/dashboard', navigationController.getDashboardStats);

module.exports = router;
