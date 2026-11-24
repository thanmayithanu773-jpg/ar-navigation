/**
 * CAMPUS AR NAVIGATION - GPS Engine
 * Handles geolocation tracking, watchPosition updates, Haversine geodesy,
 * bearing computations, and sensor accuracy validation.
 */

class GPSEngine {
  constructor() {
    this.currentPosition = null; // { latitude, longitude, accuracy, heading, speed, timestamp }
    this.watchId = null;
    this.listeners = [];
    this.errorListeners = [];
    this.isTracking = false;
    this.accuracyThreshold = 25; // meters
    this.lastKnownPosition = null;
    this.mockMode = false;
  }

  /**
   * Request GPS permission and start watching position
   */
  startTracking() {
    if (!('geolocation' in navigator)) {
      this.notifyError({
        code: 0,
        message: 'Geolocation API is not supported by your browser.'
      });
      return false;
    }

    if (this.isTracking && this.watchId !== null) {
      return true;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 2000
    };

    this.isTracking = true;

    // Initial position fetch
    navigator.geolocation.getCurrentPosition(
      (pos) => this.handlePositionUpdate(pos),
      (err) => this.handleError(err),
      options
    );

    // Continuous real-time updates
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handlePositionUpdate(pos),
      (err) => this.handleError(err),
      options
    );

    return true;
  }

  /**
   * Stop watching geolocation
   */
  stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking = false;
  }

  handlePositionUpdate(position) {
    const coords = position.coords;
    this.currentPosition = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      heading: coords.heading || null,
      speed: coords.speed || 0,
      altitude: coords.altitude || null,
      timestamp: position.timestamp
    };

    this.lastKnownPosition = this.currentPosition;

    // Check accuracy warning
    const isAccurate = coords.accuracy <= this.accuracyThreshold;

    // Broadcast to registered listeners
    this.listeners.forEach((callback) => {
      try {
        callback(this.currentPosition, {
          isAccurate,
          accuracyMeters: coords.accuracy
        });
      } catch (err) {
        console.error('Error in GPS listener callback:', err);
      }
    });
  }

  handleError(error) {
    let userMessage = 'Unable to determine GPS location.';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        userMessage = 'Location access was denied. Please enable GPS permissions in browser settings.';
        break;
      case error.POSITION_UNAVAILABLE:
        userMessage = 'Campus GPS signals are currently unavailable. Check your device location service.';
        break;
      case error.TIMEOUT:
        userMessage = 'GPS location request timed out. Retrying high-accuracy signal acquisition...';
        break;
    }

    this.notifyError({
      code: error.code,
      message: userMessage,
      raw: error
    });
  }

  notifyError(err) {
    this.errorListeners.forEach((cb) => {
      try {
        cb(err);
      } catch (e) {
        console.error('Error in GPS error handler:', e);
      }
    });
  }

  onPositionChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
      if (this.currentPosition) {
        callback(this.currentPosition, {
          isAccurate: this.currentPosition.accuracy <= this.accuracyThreshold,
          accuracyMeters: this.currentPosition.accuracy
        });
      }
      return () => {
        this.listeners = this.listeners.filter((cb) => cb !== callback);
      };
    }
    return () => {};
  }

  onError(callback) {
    if (typeof callback === 'function') {
      this.errorListeners.push(callback);
    }
  }

  /**
   * Calculate Great-Circle distance using Haversine formula
   * @param {number} lat1
   * @param {number} lon1
   * @param {number} lat2
   * @param {number} lon2
   * @returns {number} Distance in meters rounded to 1 decimal
   */
  static haversineDistance(lat1, lon1, lat2, lon2) {
    if (lat1 === lat2 && lon1 === lon2) return 0;
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  /**
   * Calculate forward bearing in degrees (0 - 360)
   */
  static calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;

    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dLon = toRad(lon2 - lon1);

    const y = Math.sin(dLon) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);

    let bearing = toDeg(Math.atan2(y, x));
    return (bearing + 360) % 360;
  }

  /**
   * Formatted walking time estimation
   */
  static formatWalkingTime(distanceMeters) {
    const seconds = Math.round(distanceMeters / 1.35); // 1.35 m/s walking speed
    if (seconds < 60) return '< 1 min walk';
    const mins = Math.ceil(seconds / 60);
    return `${mins} min walk`;
  }
}

// Global instance
window.gpsEngine = new GPSEngine();
