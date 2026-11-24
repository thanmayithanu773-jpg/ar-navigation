/**
 * Geolocation & Spatial Navigation Utilities
 * Precision spherical geodesy functions for Campus AR Navigation
 */

// Earth's mean radius in meters
const EARTH_RADIUS_METERS = 6371000;
const AVERAGE_WALKING_SPEED_MPS = 1.35; // ~4.86 km/h

/**
 * Converts degrees to radians
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees
 */
function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * Calculate Great-Circle Distance between two coordinates using Haversine formula
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in meters
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c * 10) / 10; // 1 decimal precision
}

/**
 * Calculate initial forward bearing from point A to point B in degrees (0 - 360)
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Bearing in degrees clockwise from North
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const dLon = toRadians(lon2 - lon1);

  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);

  let bearing = toDegrees(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/**
 * Convert compass degrees to 8-point cardinal direction string
 * @param {number} degrees
 * @returns {string} Cardinal direction (e.g. "NE", "S")
 */
function getCardinalDirection(degrees) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((degrees % 360) / 45)) % 8;
  return directions[index];
}

/**
 * Estimate walking duration in seconds and formatted string
 * @param {number} distanceMeters
 * @returns {{ seconds: number, formatted: string }}
 */
function estimateWalkingTime(distanceMeters) {
  const seconds = Math.round(distanceMeters / AVERAGE_WALKING_SPEED_MPS);
  const minutes = Math.ceil(seconds / 60);

  let formatted = '';
  if (minutes < 1) {
    formatted = `${seconds} sec walk`;
  } else if (minutes === 1) {
    formatted = `1 min walk`;
  } else {
    formatted = `${minutes} mins walk`;
  }

  return { seconds, formatted };
}

/**
 * Checks if current position is within arrival radius of destination
 * @param {number} currentLat
 * @param {number} currentLon
 * @param {number} destLat
 * @param {number} destLon
 * @param {number} radiusMeters
 * @returns {boolean}
 */
function isWithinArrivalRadius(currentLat, currentLon, destLat, destLon, radiusMeters = 5) {
  const distance = calculateHaversineDistance(currentLat, currentLon, destLat, destLon);
  return distance <= radiusMeters;
}

/**
 * Determine relative turn maneuver from previous bearing to new bearing
 * @param {number} prevBearing
 * @param {number} nextBearing
 * @returns {string} 'straight' | 'slight-right' | 'right' | 'sharp-right' | 'slight-left' | 'left' | 'sharp-left' | 'u-turn'
 */
function calculateRelativeTurn(prevBearing, nextBearing) {
  let diff = (nextBearing - prevBearing + 360) % 360;
  if (diff > 180) diff -= 360;

  if (Math.abs(diff) <= 20) return 'Continue straight';
  if (diff > 20 && diff <= 55) return 'Bear slight right';
  if (diff > 55 && diff <= 125) return 'Turn right';
  if (diff > 125 && diff <= 160) return 'Sharp right turn';
  if (diff < -20 && diff >= -55) return 'Bear slight left';
  if (diff < -55 && diff >= -125) return 'Turn left';
  if (diff < -125 && diff >= -160) return 'Sharp left turn';
  return 'Make a U-turn';
}

module.exports = {
  calculateHaversineDistance,
  calculateBearing,
  getCardinalDirection,
  estimateWalkingTime,
  isWithinArrivalRadius,
  calculateRelativeTurn
};
