/**
 * Location Controller
 * Handles CRUD operations for campus locations.
 */

const mongoose = require('mongoose');
const Location = require('../models/Location');
const Route = require('../models/Route');
const { isDbConnected, memoryStore, saveLocalStore } = require('../config/database');

// GET /api/locations
exports.getAllLocations = async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const locations = await Location.find().sort({ name: 1 });
      return res.status(200).json({
        success: true,
        count: locations.length,
        data: locations
      });
    }

    // Fallback: memory store
    const sorted = [...memoryStore.locations].sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({
      success: true,
      count: sorted.length,
      data: sorted
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/locations/:id
exports.getLocationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: 'Campus location not found' });
      }
      const location = await Location.findById(id);
      if (!location) {
        return res.status(404).json({ success: false, message: 'Campus location not found' });
      }
      return res.status(200).json({ success: true, data: location });
    }

    const loc = memoryStore.locations.find(l => String(l._id) === String(id) || l.name === id);
    if (!loc) {
      return res.status(404).json({ success: false, message: 'Campus location not found' });
    }
    return res.status(200).json({ success: true, data: loc });
  } catch (err) {
    next(err);
  }
};

// POST /api/locations (Admin protected)
exports.createLocation = async (req, res, next) => {
  try {
    const { name, latitude, longitude, category, description, building, floor, status, landmarkFeatures } = req.body;

    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, latitude, and longitude are required fields.'
      });
    }

    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      return res.status(400).json({
        success: false,
        message: 'Latitude must be between -90 and 90, and longitude between -180 and 180.'
      });
    }

    if (isDbConnected()) {
      const existing = await Location.findOne({ name: name.trim() });
      if (existing) {
        return res.status(409).json({ success: false, message: `Location '${name}' already exists.` });
      }

      const newLoc = await Location.create({
        name: name.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        category: category || 'Academic',
        description: description || '',
        building: building || 'Main Academic Block',
        floor: floor || 'Ground Floor',
        status: status || 'active',
        landmarkFeatures: Array.isArray(landmarkFeatures) ? landmarkFeatures : []
      });

      return res.status(201).json({ success: true, data: newLoc });
    }

    // Fallback: memory store
    const duplicate = memoryStore.locations.find(l => l.name.toLowerCase() === name.trim().toLowerCase());
    if (duplicate) {
      return res.status(409).json({ success: false, message: `Location '${name}' already exists.` });
    }

    const newLoc = {
      _id: `loc_${Date.now()}`,
      name: name.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      category: category || 'Academic',
      description: description || '',
      building: building || 'Main Academic Block',
      floor: floor || 'Ground Floor',
      status: status || 'active',
      landmarkFeatures: Array.isArray(landmarkFeatures) ? landmarkFeatures : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    memoryStore.locations.push(newLoc);
    saveLocalStore();

    return res.status(201).json({ success: true, data: newLoc });
  } catch (err) {
    next(err);
  }
};

// PUT /api/locations/:id (Admin protected)
exports.updateLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (updates.name !== undefined) {
      updates.name = String(updates.name).trim();
      if (!updates.name) {
        return res.status(400).json({ success: false, message: 'Location name cannot be empty.' });
      }
    }

    if (isDbConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: 'Campus location not found' });
      }

      if (updates.name) {
        const duplicate = await Location.findOne({ name: updates.name, _id: { $ne: id } });
        if (duplicate) {
          return res.status(409).json({ success: false, message: `Location '${updates.name}' already exists.` });
        }
      }

      const updated = await Location.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Campus location not found' });
      }
      return res.status(200).json({ success: true, data: updated });
    }

    const index = memoryStore.locations.findIndex(l => String(l._id) === String(id));
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Campus location not found' });
    }

    if (updates.name) {
      const duplicate = memoryStore.locations.find(l =>
        String(l._id) !== String(id) && l.name.toLowerCase() === updates.name.toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({ success: false, message: `Location '${updates.name}' already exists.` });
      }
    }

    memoryStore.locations[index] = {
      ...memoryStore.locations[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    saveLocalStore();

    return res.status(200).json({ success: true, data: memoryStore.locations[index] });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/locations/:id (Admin protected)
exports.deleteLocation = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: 'Campus location not found' });
      }

      const deleted = await Location.findByIdAndDelete(id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Campus location not found' });
      }

      // Remove every pathway edge that referenced the deleted node
      const pathways = await Route.deleteMany({
        $or: [{ startLocation: deleted._id }, { endLocation: deleted._id }]
      });

      return res.status(200).json({
        success: true,
        message: `Location '${deleted.name}' deleted successfully`,
        removedPathways: pathways.deletedCount
      });
    }

    const index = memoryStore.locations.findIndex(l => String(l._id) === String(id));
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Campus location not found' });
    }

    const removed = memoryStore.locations.splice(index, 1)[0];
    const beforeCount = memoryStore.routes.length;
    memoryStore.routes = memoryStore.routes.filter(
      r => String(r.startLocation) !== String(id) && String(r.endLocation) !== String(id)
    );
    saveLocalStore();

    return res.status(200).json({
      success: true,
      message: `Location '${removed.name}' deleted successfully`,
      removedPathways: beforeCount - memoryStore.routes.length
    });
  } catch (err) {
    next(err);
  }
};
