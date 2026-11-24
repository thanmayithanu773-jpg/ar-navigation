/**
 * Route Controller
 * Handles CRUD operations for indoor & outdoor campus pathways.
 */

const Route = require('../models/Route');
const Location = require('../models/Location');
const { isDbConnected, memoryStore, saveLocalStore } = require('../config/database');

// Helper to populate location details in memory store
function populateMemoryRoute(route) {
  const start = memoryStore.locations.find(l => String(l._id) === String(route.startLocation)) || { name: 'Unknown' };
  const end = memoryStore.locations.find(l => String(l._id) === String(route.endLocation)) || { name: 'Unknown' };
  return {
    ...route,
    startLocation: start,
    endLocation: end
  };
}

// GET /api/routes
exports.getAllRoutes = async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const routes = await Route.find()
        .populate('startLocation', 'name latitude longitude floor building category')
        .populate('endLocation', 'name latitude longitude floor building category');

      return res.status(200).json({
        success: true,
        count: routes.length,
        data: routes
      });
    }

    const populated = memoryStore.routes.map(populateMemoryRoute);
    return res.status(200).json({
      success: true,
      count: populated.length,
      data: populated
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/routes (Admin protected)
exports.createRoute = async (req, res, next) => {
  try {
    const { startLocation, endLocation, distance, direction, connectedPathways, isIndoor, accessible } = req.body;

    if (!startLocation || !endLocation || distance === undefined || !direction) {
      return res.status(400).json({
        success: false,
        message: 'startLocation, endLocation, distance, and direction are required.'
      });
    }

    if (startLocation === endLocation) {
      return res.status(400).json({
        success: false,
        message: 'Start and end locations must be different.'
      });
    }

    if (isDbConnected()) {
      const startExists = await Location.findById(startLocation);
      const endExists = await Location.findById(endLocation);

      if (!startExists || !endExists) {
        return res.status(404).json({
          success: false,
          message: 'One or both specified locations could not be found.'
        });
      }

      const newRoute = await Route.create({
        startLocation,
        endLocation,
        distance: Number(distance),
        direction: direction.trim(),
        connectedPathways: Array.isArray(connectedPathways) ? connectedPathways : [],
        isIndoor: isIndoor !== undefined ? isIndoor : true,
        accessible: accessible !== undefined ? accessible : true
      });

      const populated = await Route.findById(newRoute._id)
        .populate('startLocation', 'name latitude longitude floor building category')
        .populate('endLocation', 'name latitude longitude floor building category');

      return res.status(201).json({ success: true, data: populated });
    }

    // Memory fallback
    const startLoc = memoryStore.locations.find(l => String(l._id) === String(startLocation));
    const endLoc = memoryStore.locations.find(l => String(l._id) === String(endLocation));

    if (!startLoc || !endLoc) {
      return res.status(404).json({
        success: false,
        message: 'One or both specified locations could not be found.'
      });
    }

    const newRoute = {
      _id: `route_${Date.now()}`,
      startLocation: startLoc._id,
      endLocation: endLoc._id,
      distance: Number(distance),
      direction: direction.trim(),
      connectedPathways: Array.isArray(connectedPathways) ? connectedPathways : [],
      isIndoor: isIndoor !== undefined ? isIndoor : true,
      accessible: accessible !== undefined ? accessible : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    memoryStore.routes.push(newRoute);
    saveLocalStore();

    return res.status(201).json({ success: true, data: populateMemoryRoute(newRoute) });
  } catch (err) {
    next(err);
  }
};

// PUT /api/routes/:id (Admin protected)
exports.updateRoute = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (isDbConnected()) {
      const updated = await Route.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
        .populate('startLocation', 'name latitude longitude floor building category')
        .populate('endLocation', 'name latitude longitude floor building category');

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Campus pathway not found' });
      }
      return res.status(200).json({ success: true, data: updated });
    }

    const index = memoryStore.routes.findIndex(r => String(r._id) === String(id));
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Campus pathway not found' });
    }

    memoryStore.routes[index] = {
      ...memoryStore.routes[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    saveLocalStore();

    return res.status(200).json({ success: true, data: populateMemoryRoute(memoryStore.routes[index]) });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/routes/:id (Admin protected)
exports.deleteRoute = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      const deleted = await Route.findByIdAndDelete(id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Campus pathway not found' });
      }
      return res.status(200).json({ success: true, message: 'Campus pathway removed successfully' });
    }

    const index = memoryStore.routes.findIndex(r => String(r._id) === String(id));
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Campus pathway not found' });
    }

    memoryStore.routes.splice(index, 1);
    saveLocalStore();

    return res.status(200).json({ success: true, message: 'Campus pathway removed successfully' });
  } catch (err) {
    next(err);
  }
};
