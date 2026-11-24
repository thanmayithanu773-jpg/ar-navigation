/**
 * Navigation Controller
 * Handles Dijkstra shortest-path calculations, turn-by-turn guidance,
 * navigation logging, and dashboard statistics.
 */

const mongoose = require('mongoose');
const Location = require('../models/Location');
const Route = require('../models/Route');
const NavigationLog = require('../models/NavigationLog');
const { CampusGraph } = require('../utils/dijkstra');
const { calculateHaversineDistance, calculateBearing, estimateWalkingTime } = require('../utils/geoUtils');
const { isDbConnected, memoryStore, saveLocalStore } = require('../config/database');

/**
 * Builds the in-memory CampusGraph from database or memoryStore
 */
async function buildGraph() {
  const graph = new CampusGraph();

  let locations = [];
  let routes = [];

  if (isDbConnected()) {
    locations = await Location.find({ status: 'active' });
    routes = await Route.find();
  } else {
    locations = memoryStore.locations.filter(l => l.status === 'active');
    routes = memoryStore.routes;
  }

  // Add nodes
  for (const loc of locations) {
    graph.addNode(loc);
  }

  // Add edges
  for (const route of routes) {
    const sId = route.startLocation._id ? String(route.startLocation._id) : String(route.startLocation);
    const eId = route.endLocation._id ? String(route.endLocation._id) : String(route.endLocation);
    graph.addEdge(
      sId,
      eId,
      route.distance,
      route.direction,
      route.isIndoor,
      route.connectedPathways
    );
  }

  return { graph, locations, routes };
}

// POST /api/navigation/calculate
exports.calculateRoute = async (req, res, next) => {
  try {
    const { startLocationId, destinationId, userLatitude, userLongitude, navigationMode } = req.body;

    if (!destinationId) {
      return res.status(400).json({
        success: false,
        message: 'Destination ID is required.'
      });
    }

    const { graph, locations } = await buildGraph();

    // Verify destination exists
    const destLoc = locations.find(l => String(l._id) === String(destinationId) || l.name === destinationId);
    if (!destLoc) {
      return res.status(404).json({
        success: false,
        message: 'Destination location not found in campus database.'
      });
    }

    let actualStartNodeId = startLocationId;
    let initialConnector = null;

    // If user provided raw GPS coordinates, snap to closest campus node
    if (userLatitude !== undefined && userLongitude !== undefined && (!startLocationId || startLocationId === 'gps_current')) {
      const uLat = Number(userLatitude);
      const uLon = Number(userLongitude);
      const nearest = graph.findNearestNode(uLat, uLon);

      if (nearest) {
        actualStartNodeId = nearest.node.id;
        const distToStart = calculateHaversineDistance(uLat, uLon, nearest.node.latitude, nearest.node.longitude);
        const bearingToStart = calculateBearing(uLat, uLon, nearest.node.latitude, nearest.node.longitude);

        initialConnector = {
          fromUserGps: true,
          userCoordinates: { latitude: uLat, longitude: uLon },
          targetNode: nearest.node.name,
          distanceMeters: distToStart,
          bearingDegrees: Math.round(bearingToStart),
          instruction: `Walk ${distToStart}m towards ${nearest.node.name} entrance to enter the campus indoor pathway network.`
        };
      }
    }

    // Default to the campus core when no GPS fix is available yet
    if (!actualStartNodeId && locations.length > 0) {
      const fallbackNearest = graph.findNearestNode(13.337000, 77.130200);
      actualStartNodeId = fallbackNearest ? fallbackNearest.node.id : locations[0]._id;
    }

    // If start is the destination itself
    if (String(actualStartNodeId) === String(destLoc._id)) {
      return res.status(200).json({
        success: true,
        data: {
          destination: destLoc,
          totalDistance: 0,
          walkingTime: { seconds: 0, formatted: '0 min' },
          path: [String(destLoc._id)],
          waypoints: [destLoc],
          instructions: [
            {
              step: 1,
              from: destLoc.name,
              to: destLoc.name,
              maneuver: 'Arrive',
              instruction: `You are already at ${destLoc.name}.`,
              distance: 0,
              bearing: 0,
              isIndoor: true
            }
          ]
        }
      });
    }

    // Calculate Dijkstra path
    let calculation = graph.findShortestPath(actualStartNodeId, destLoc._id);

    // If no direct pathway route exists, generate direct topological link
    if (!calculation || calculation.waypoints.length === 0) {
      const startLoc = locations.find(l => String(l._id) === String(actualStartNodeId));
      if (startLoc) {
        const directDist = calculateHaversineDistance(startLoc.latitude, startLoc.longitude, destLoc.latitude, destLoc.longitude);
        const directBearing = calculateBearing(startLoc.latitude, startLoc.longitude, destLoc.latitude, destLoc.longitude);
        calculation = {
          path: [String(startLoc._id), String(destLoc._id)],
          waypoints: [startLoc, destLoc],
          totalDistance: directDist,
          walkingTime: estimateWalkingTime(directDist),
          instructions: [
            {
              step: 1,
              from: startLoc.name,
              to: destLoc.name,
              maneuver: 'Head towards',
              instruction: `Proceed from ${startLoc.name} along corridor towards ${destLoc.name}`,
              distance: directDist,
              bearing: Math.round(directBearing),
              isIndoor: true
            },
            {
              step: 2,
              from: destLoc.name,
              to: destLoc.name,
              maneuver: 'Arrive',
              instruction: `You have arrived at ${destLoc.name}`,
              distance: 0,
              bearing: 0,
              isIndoor: true
            }
          ]
        };
      }
    }

    // Prepend user GPS connector if applicable
    if (!calculation) {
      return res.status(404).json({
        success: false,
        message: 'No navigable pathway connects the selected start and destination.'
      });
    }

    if (initialConnector && calculation) {
      calculation.initialConnector = initialConnector;
      calculation.totalDistance = Math.round((calculation.totalDistance + initialConnector.distanceMeters) * 10) / 10;
      calculation.walkingTime = estimateWalkingTime(calculation.totalDistance);
    }

    // Persist the selection before responding so a fast arrival cannot
    // update an older row for the same destination.
    await logNavigationSession(destLoc.name, destLoc._id, navigationMode || 'gps', userLatitude, userLongitude);

    return res.status(200).json({
      success: true,
      data: {
        destination: destLoc,
        ...calculation
      }
    });
  } catch (err) {
    next(err);
  }
};

// Internal logger
async function logNavigationSession(destName, destId, mode, lat, lon) {
  try {
    const logData = {
      destination: destName,
      // Predefined fallback locations use string ids (loc_1..) that cannot be cast to ObjectId
      destinationId: (isDbConnected() && !mongoose.Types.ObjectId.isValid(String(destId || ''))) ? undefined : destId,
      navigationMode: mode || 'gps',
      status: 'started',
      userCoordinates: (lat && lon) ? { latitude: Number(lat), longitude: Number(lon) } : undefined,
      date: new Date()
    };

    if (isDbConnected()) {
      await NavigationLog.create(logData);
    } else {
      memoryStore.navigationLogs.push({
        _id: `log_${Date.now()}`,
        ...logData,
        date: new Date().toISOString()
      });
      saveLocalStore();
    }
  } catch (e) {
    console.warn('Navigation log non-fatal error:', e.message);
  }
}

// POST /api/navigation/log
exports.logNavigation = async (req, res, next) => {
  try {
    const { destination, destinationId, navigationMode, status, userCoordinates } = req.body;
    const resolvedStatus = status || 'started';
    const destName = destination || 'Campus Point';
    const validDestId = mongoose.Types.ObjectId.isValid(String(destinationId || '')) ? destinationId : undefined;

    // Arrival closes out the most recent 'started' row for this destination
    // instead of creating a duplicate entry in the admin history.
    if (resolvedStatus === 'reached') {
      if (isDbConnected()) {
        const filter = { destination: destName, status: 'started' };
        if (validDestId) filter.destinationId = validDestId;
        const updated = await NavigationLog.findOneAndUpdate(
          filter,
          { status: 'reached', ...(userCoordinates ? { userCoordinates } : {}) },
          { sort: { date: -1, createdAt: -1 }, new: true }
        );
        if (updated) return res.status(200).json({ success: true, data: updated });
      } else {
        const existing = [...memoryStore.navigationLogs]
          .reverse()
          .find(l => l.destination === destName && l.status === 'started');
        if (existing) {
          existing.status = 'reached';
          if (userCoordinates) existing.userCoordinates = userCoordinates;
          saveLocalStore();
          return res.status(200).json({ success: true, data: existing });
        }
      }
    }

    const logEntry = {
      destination: destName,
      destinationId: (isDbConnected() && !validDestId) ? undefined : (validDestId || null),
      navigationMode: navigationMode || 'gps',
      status: resolvedStatus,
      userCoordinates: userCoordinates || null,
      date: new Date()
    };

    if (isDbConnected()) {
      const created = await NavigationLog.create(logEntry);
      return res.status(201).json({ success: true, data: created });
    }

    const memoryEntry = {
      _id: `log_${Date.now()}`,
      ...logEntry,
      date: new Date().toISOString()
    };
    memoryStore.navigationLogs.push(memoryEntry);
    saveLocalStore();

    return res.status(201).json({ success: true, data: memoryEntry });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/destination-history
exports.getDestinationHistory = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 100;

    let logs = [];
    if (isDbConnected()) {
      logs = await NavigationLog.find()
        .sort({ date: -1, createdAt: -1 })
        .limit(limit)
        .lean();
    } else {
      logs = [...memoryStore.navigationLogs].reverse().slice(0, limit);
    }

    return res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/dashboard
exports.getDashboardStats = async (req, res, next) => {
  try {
    let totalLocations = 0;
    let totalPathways = 0;
    let totalNavigations = 0;
    let totalArrivals = 0;
    let activeDestinations = 0;
    let recentLogs = [];

    if (isDbConnected()) {
      totalLocations = await Location.countDocuments();
      activeDestinations = await Location.countDocuments({ status: 'active' });
      totalPathways = await Route.countDocuments();
      totalNavigations = await NavigationLog.countDocuments();
      totalArrivals = await NavigationLog.countDocuments({ status: 'reached' });
      recentLogs = await NavigationLog.find().sort({ createdAt: -1 }).limit(10);
    } else {
      totalLocations = memoryStore.locations.length;
      activeDestinations = memoryStore.locations.filter(l => l.status === 'active').length;
      totalPathways = memoryStore.routes.length;
      totalNavigations = memoryStore.navigationLogs.length;
      totalArrivals = memoryStore.navigationLogs.filter(l => l.status === 'reached').length;
      recentLogs = [...memoryStore.navigationLogs].reverse().slice(0, 10);
    }

    return res.status(200).json({
      success: true,
      data: {
        totalLocations,
        totalPathways,
        totalNavigations,
        totalArrivals,
        activeDestinations,
        recentLogs
      }
    });
  } catch (err) {
    next(err);
  }
};
