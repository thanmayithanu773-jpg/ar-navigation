/**
 * CAMPUS AR NAVIGATION - Navigation Coordinator
 * Orchestrates Dijkstra routing, turn-by-turn progression,
 * Web SpeechSynthesis audio guidance, arrival notifications, and telemetry.
 */

class NavigationCoordinator {
  constructor() {
    this.currentRoute = null;
    this.currentDestination = null;
    this.activeMode = 'ar';
    this.currentStepIndex = 0;
    this.nextWaypointIndex = 1;
    this.hasArrived = false;
    this.voiceMuted = false;
    this.socket = null;
    this.audioContext = null;
    this.lastTelemetryAt = 0;

    this.initSocket();
  }

  async initSocket() {
    try {
      if (window.backendReady) await window.backendReady;
      if (typeof io !== 'undefined') {
        this.socket = window.API_ORIGIN ? io(window.API_ORIGIN) : io();
        this.socket.on('connect', () => {
          console.log('📡 [Socket.IO] Navigation telemetry connected');
        });
      }
    } catch (e) {
      console.warn('Socket.IO connection skipped:', e.message);
    }
  }

  /**
   * Request Dijkstra shortest path from backend API
   */
  async planRoute(destinationId, userCoords = null, mode = 'ar') {
    this.activeMode = mode;
    const requestId = this.planRequestId = (this.planRequestId || 0) + 1;

    let route = null;

    try {
      const payload = {
        destinationId,
        navigationMode: mode
      };

      if (userCoords && userCoords.latitude && userCoords.longitude) {
        payload.userLatitude = userCoords.latitude;
        payload.userLongitude = userCoords.longitude;
      }

      const response = await fetch(window.apiUrl('/api/navigation/calculate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.message || 'Could not calculate navigation path');
      }

      route = resData.data;
    } catch (err) {
      console.warn('Backend route calculation fallback to client-side engine:', err.message);

      const dest = window.app && window.app.locations
        ? window.app.locations.find(l => String(l._id) === String(destinationId) || l.name === destinationId)
        : null;

      if (!dest) {
        throw err;
      }

      const uLat = userCoords && userCoords.latitude ? userCoords.latitude : 13.337000;
      const uLon = userCoords && userCoords.longitude ? userCoords.longitude : 77.130200;
      const dist = GPSEngine.haversineDistance(uLat, uLon, dest.latitude, dest.longitude);
      const bearing = GPSEngine.calculateBearing(uLat, uLon, dest.latitude, dest.longitude);

      route = {
        destination: dest,
        totalDistance: dist,
        walkingTime: { seconds: Math.round(dist / 1.35), formatted: GPSEngine.formatWalkingTime(dist) },
        waypoints: [
          { latitude: uLat, longitude: uLon, name: 'Current Location' },
          dest
        ],
        instructions: [
          {
            step: 1,
            from: 'Your Position',
            to: dest.name,
            maneuver: 'Proceed towards',
            instruction: `Head directly along campus pathway towards ${dest.name} (${dest.building})`,
            distance: dist,
            bearing: Math.round(bearing)
          },
          {
            step: 2,
            from: dest.name,
            to: dest.name,
            maneuver: 'Arrive',
            instruction: `You have arrived at ${dest.name}`,
            distance: 0,
            bearing: 0
          }
        ]
      };
    }

    // A late response from a superseded request must not overwrite the route
    // for the destination the user tapped most recently.
    if (requestId === this.planRequestId) {
      this.currentRoute = route;
      this.currentDestination = route.destination;
      this.currentStepIndex = 0;
      this.nextWaypointIndex = 1;
      this.hasArrived = false;

      if (route.instructions && route.instructions.length > 0) {
        this.speakInstruction(route.instructions[0].instruction);
      }

      this.emitTelemetry('started');
    }

    return route;
  }

  /**
   * Recompute the guidance step and next waypoint from the live GPS position.
   * Steps advance only after the user physically reaches a waypoint, so the
   * AR arrow always points to the next unvisited point on the corridor graph.
   */
  updateProgress(position) {
    if (!this.currentRoute || !Array.isArray(this.currentRoute.waypoints) || !position) return;
    const waypoints = this.currentRoute.waypoints;
    if (waypoints.length < 2) return;

    const lastIdx = waypoints.length - 1;
    const accuracy = Number(position.accuracy);
    // Scale the "waypoint reached" radius with GPS accuracy so dense corridor
    // nodes are not all marked visited from a single noisy fix.
    const reachedRadius = Math.min(12, Math.max(6, Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 8));

    let lastReached = 0;
    for (let i = 1; i < lastIdx; i++) {
      const dist = GPSEngine.haversineDistance(
        position.latitude,
        position.longitude,
        waypoints[i].latitude,
        waypoints[i].longitude
      );
      if (dist <= reachedRadius) lastReached = i;
    }

    const distToFinal = GPSEngine.haversineDistance(
      position.latitude,
      position.longitude,
      waypoints[lastIdx].latitude,
      waypoints[lastIdx].longitude
    );
    const finalReached = distToFinal <= 5;

    const instructions = this.currentRoute.instructions || [];
    // Never show the "Arrive" instruction before the 5 m arrival radius
    const maxGuidanceIndex = Math.max(0, instructions.length - 2);
    const stepIndex = finalReached
      ? Math.max(0, instructions.length - 1)
      : Math.min(lastReached, maxGuidanceIndex);
    const nextIndex = finalReached ? lastIdx : Math.min(lastReached + 1, lastIdx);
    const changed = stepIndex !== this.currentStepIndex;

    this.currentStepIndex = stepIndex;
    this.nextWaypointIndex = nextIndex;

    if (changed) {
      const instruction = instructions[stepIndex];
      if (instruction) {
        this.speakInstruction(instruction.instruction);
      }
      if (window.liveAREngine && window.liveAREngine.isARActive) {
        window.liveAREngine.updateARHUD();
      }
    }
  }

  /**
   * Speak turn instruction using SpeechSynthesis
   */
  speakInstruction(text) {
    if (this.voiceMuted || !('speechSynthesis' in window) || !text) return;

    try {
      window.speechSynthesis.cancel(); // clear previous utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      // Audio autoplay policy handled gracefully
    }
  }

  toggleVoiceGuidance() {
    this.voiceMuted = !this.voiceMuted;
    if (this.voiceMuted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    return !this.voiceMuted;
  }

  /**
   * Emit telemetry event via Socket.IO
   */
  emitTelemetry(status) {
    if (!this.socket || !this.currentDestination) return;

    const coords = window.gpsEngine.currentPosition;
    this.socket.emit('nav:location_update', {
      destination: this.currentDestination.name,
      mode: this.activeMode,
      status,
      coords: coords ? { latitude: coords.latitude, longitude: coords.longitude } : null
    });
  }

  /**
   * Stream throttled live location updates to the admin telemetry channel
   */
  emitLocationUpdate() {
    if (!this.socket || !this.currentDestination) return;

    const now = Date.now();
    if (now - this.lastTelemetryAt < 5000) return;

    const coords = window.gpsEngine.currentPosition;
    if (!coords) return;

    this.lastTelemetryAt = now;
    this.socket.emit('nav:location_update', {
      destination: this.currentDestination.name,
      mode: this.activeMode,
      status: 'enroute',
      coords: { latitude: coords.latitude, longitude: coords.longitude },
      accuracy: coords.accuracy
    });
  }

  /**
   * Log arrival and play celebratory sound chime
   */
  async notifyArrival(destination) {
    this.hasArrived = true;
    this.playArrivalChime();

    if (this.socket) {
      this.socket.emit('nav:destination_reached', {
        destination: destination.name,
        mode: this.activeMode
      });
    }

    try {
      await fetch(window.apiUrl('/api/navigation/log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: destination.name,
          destinationId: destination._id,
          navigationMode: this.activeMode,
          status: 'reached',
          userCoordinates: window.gpsEngine.currentPosition
        })
      });
    } catch (e) {
      console.warn('Could not post arrival log:', e);
    }
  }

  /**
   * Play futuristic chime using Web Audio API
   */
  playArrivalChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.3); // G5
      osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.45); // C6

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {
      // AudioContext policy
    }
  }
}

window.navigationCoordinator = new NavigationCoordinator();
