/**
 * Graph Navigation & Shortest Path Engine using Dijkstra's Algorithm
 * Computes shortest turn-by-turn indoor & outdoor pathway routes.
 */

const { calculateHaversineDistance, calculateBearing, calculateRelativeTurn, estimateWalkingTime } = require('./geoUtils');

class CampusGraph {
  constructor() {
    this.nodes = new Map(); // id -> { id, name, latitude, longitude, category, floor, building }
    this.adjacencyList = new Map(); // id -> Array<{ neighborId, distance, direction, isIndoor, connectedPathways }>
  }

  addNode(node) {
    const id = String(node._id || node.id);
    this.nodes.set(id, {
      id,
      name: node.name,
      latitude: Number(node.latitude),
      longitude: Number(node.longitude),
      category: node.category,
      floor: node.floor || 'Ground Floor',
      building: node.building || 'Main Academic Block'
    });
    if (!this.adjacencyList.has(id)) {
      this.adjacencyList.set(id, []);
    }
  }

  addEdge(startId, endId, distance, direction, isIndoor = true, connectedPathways = []) {
    const sId = String(startId);
    const eId = String(endId);

    if (!this.adjacencyList.has(sId)) this.adjacencyList.set(sId, []);
    if (!this.adjacencyList.has(eId)) this.adjacencyList.set(eId, []);

    // Bi-directional pathway traversal for corridors
    this.adjacencyList.get(sId).push({
      targetId: eId,
      distance: Number(distance),
      direction: direction || 'Proceed along pathway',
      isIndoor,
      connectedPathways
    });

    this.adjacencyList.get(eId).push({
      targetId: sId,
      distance: Number(distance),
      direction: `Head back along the corridor towards ${this.nodes.get(sId)?.name || 'previous location'}`,
      isIndoor,
      connectedPathways
    });
  }

  /**
   * Find closest graph node to given coordinates
   */
  findNearestNode(lat, lon) {
    let nearest = null;
    let minDistance = Infinity;

    for (const [id, node] of this.nodes.entries()) {
      const dist = calculateHaversineDistance(lat, lon, node.latitude, node.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = { node, distance: dist };
      }
    }
    return nearest;
  }

  /**
   * Calculate shortest path using Dijkstra's algorithm
   * @param {string} startNodeId
   * @param {string} targetNodeId
   * @returns {{ path: Array, totalDistance: number, instructions: Array, waypoints: Array }}
   */
  findShortestPath(startNodeId, targetNodeId) {
    const start = String(startNodeId);
    const target = String(targetNodeId);

    if (!this.nodes.has(start) || !this.nodes.has(target)) {
      return null;
    }

    const distances = new Map();
    const previous = new Map();
    const edgeMetadata = new Map(); // to store direction & edge properties
    const unvisited = new Set();

    for (const id of this.nodes.keys()) {
      distances.set(id, Infinity);
      previous.set(id, null);
      unvisited.add(id);
    }

    distances.set(start, 0);

    while (unvisited.size > 0) {
      // Find unvisited node with smallest distance
      let current = null;
      let lowestDist = Infinity;
      for (const id of unvisited) {
        const d = distances.get(id);
        if (d < lowestDist) {
          lowestDist = d;
          current = id;
        }
      }

      if (current === null || lowestDist === Infinity) {
        break; // remaining nodes are unreachable
      }

      if (current === target) {
        break; // Reached target
      }

      unvisited.delete(current);

      const neighbors = this.adjacencyList.get(current) || [];
      for (const edge of neighbors) {
        if (!unvisited.has(edge.targetId)) continue;

        const alt = distances.get(current) + edge.distance;
        if (alt < distances.get(edge.targetId)) {
          distances.set(edge.targetId, alt);
          previous.set(edge.targetId, current);
          edgeMetadata.set(`${current}->${edge.targetId}`, edge);
        }
      }
    }

    // Reconstruct path
    const path = [];
    let curr = target;
    if (distances.get(target) === Infinity && start !== target) {
      return null; // No route exists
    }

    while (curr) {
      path.unshift(curr);
      curr = previous.get(curr);
    }

    // Generate detailed turn-by-turn guidance and coordinates
    const waypoints = [];
    const instructions = [];
    let prevBearing = null;

    for (let i = 0; i < path.length; i++) {
      const nodeId = path[i];
      const node = this.nodes.get(nodeId);
      waypoints.push({
        id: node.id,
        name: node.name,
        latitude: node.latitude,
        longitude: node.longitude,
        floor: node.floor,
        building: node.building,
        category: node.category
      });

      if (i < path.length - 1) {
        const nextNodeId = path[i + 1];
        const nextNode = this.nodes.get(nextNodeId);
        const edgeKey = `${nodeId}->${nextNodeId}`;
        const edge = edgeMetadata.get(edgeKey);

        const currentBearing = calculateBearing(
          node.latitude,
          node.longitude,
          nextNode.latitude,
          nextNode.longitude
        );

        let turnManeuver = 'Proceed straight';
        if (prevBearing !== null) {
          turnManeuver = calculateRelativeTurn(prevBearing, currentBearing);
        }
        prevBearing = currentBearing;

        instructions.push({
          step: i + 1,
          from: node.name,
          to: nextNode.name,
          maneuver: turnManeuver,
          instruction: edge ? edge.direction : `${turnManeuver} towards ${nextNode.name}`,
          distance: edge ? edge.distance : calculateHaversineDistance(node.latitude, node.longitude, nextNode.latitude, nextNode.longitude),
          bearing: Math.round(currentBearing),
          isIndoor: edge ? edge.isIndoor : true
        });
      }
    }

    // Final arrival instruction
    instructions.push({
      step: instructions.length + 1,
      from: waypoints[waypoints.length - 1]?.name,
      to: waypoints[waypoints.length - 1]?.name,
      maneuver: 'Arrive',
      instruction: `You have arrived at ${waypoints[waypoints.length - 1]?.name}`,
      distance: 0,
      bearing: 0,
      isIndoor: true
    });

    const totalDistance = Math.round(distances.get(target) * 10) / 10;
    const walkingTime = estimateWalkingTime(totalDistance);

    return {
      path,
      waypoints,
      totalDistance,
      walkingTime,
      instructions
    };
  }
}

module.exports = {
  CampusGraph
};
