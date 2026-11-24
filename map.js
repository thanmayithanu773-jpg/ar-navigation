/**
 * CAMPUS AR NAVIGATION - Interactive Leaflet Map Manager
 * Handles OpenStreetMap rendering, campus markers, user GPS tracking marker,
 * Dijkstra corridor route polylines, and arrival detection.
 */

class CampusMapManager {
  constructor(containerId = 'leaflet-map') {
    this.containerId = containerId;
    this.map = null;
    this.locationMarkers = new Map(); // id -> L.marker
    this.userMarker = null;
    this.accuracyCircle = null;
    this.routePolyline = null;
    this.activeDestination = null;
    this.activeRouteData = null;
    this.campusCenter = [13.337000, 77.130200];
    this.arrivalThreshold = 5.0; // 5 meters radius
    this.hasArrived = false;
  }

  /**
   * Initialize Leaflet Map
   */
  initMap() {
    if (this.map) return;
    if (typeof L === 'undefined') {
      console.warn('Leaflet failed to load — GPS map navigation unavailable.');
      return;
    }

    const mapElement = document.getElementById(this.containerId);
    if (!mapElement) return;

    this.map = L.map(this.containerId, {
      center: this.campusCenter,
      zoom: 19,
      maxZoom: 22,
      minZoom: 16,
      zoomControl: false
    });

    // Free OpenStreetMap raster tiles (no API key). The dark cyber look is
    // applied with a CSS filter on the tile pane so the theme is preserved.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxNativeZoom: 19,
      maxZoom: 22
    }).addTo(this.map);

    // Zoom controls at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Initial resize fix
    setTimeout(() => {
      this.map.invalidateSize();
    }, 250);
  }

  /**
   * Render all 10 campus locations on map
   */
  renderLocations(locations) {
    if (!this.map || !Array.isArray(locations)) return;

    // Clear existing
    this.locationMarkers.forEach(marker => marker.remove());
    this.locationMarkers.clear();

    locations.forEach(loc => {
      const isTarget = this.activeDestination && (this.activeDestination._id === loc._id || this.activeDestination.name === loc.name);

      const iconHtml = `
        <div class="pin-marker-inner ${isTarget ? 'active-target' : ''}" title="${loc.name}">
          ${this.getCategoryIcon(loc.category)}
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-campus-pin',
        html: iconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon })
        .addTo(this.map)
        .bindPopup(`
          <div style="font-family: 'Inter', sans-serif; color: #0b1528; padding: 4px;">
            <strong style="font-size: 1rem; color: #0f172a;">${loc.name}</strong><br/>
            <span style="font-size: 0.78rem; color: #2563eb; font-weight: 700;">${loc.category} • ${loc.floor}</span><br/>
            <p style="font-size: 0.8rem; color: #475569; margin: 4px 0 8px;">${loc.description || ''}</p>
            <div style="display: flex; gap: 6px;">
              <button onclick="window.app.startNavigation('${loc._id}', 'gps')" style="background: #2563eb; color: #fff; border:none; padding: 6px 10px; border-radius: 4px; font-size: 0.78rem; font-weight: bold; cursor: pointer;">GPS Nav</button>
              <button onclick="window.app.startNavigation('${loc._id}', 'ar')" style="background: #00e5ff; color: #0b1528; border:none; padding: 6px 10px; border-radius: 4px; font-size: 0.78rem; font-weight: bold; cursor: pointer;">Live AR</button>
            </div>
          </div>
        `);

      this.locationMarkers.set(String(loc._id), marker);
    });
  }

  /**
   * Update real-time user position on the map
   */
  updateUserPosition(coords, accuracyMeta = {}) {
    if (!this.map || !coords) return;

    const latLng = [coords.latitude, coords.longitude];

    if (!this.userMarker) {
      const userIcon = L.divIcon({
        className: 'user-pin-wrap',
        html: `<div class="user-gps-pulse-marker" title="Your GPS Location"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      this.userMarker = L.marker(latLng, { icon: userIcon, zIndexOffset: 1000 }).addTo(this.map);

      // Accuracy radius circle
      if (coords.accuracy) {
        this.accuracyCircle = L.circle(latLng, {
          radius: coords.accuracy,
          color: '#00e5ff',
          weight: 1,
          opacity: 0.35,
          fillColor: '#00e5ff',
          fillOpacity: 0.08
        }).addTo(this.map);
      }
    } else {
      this.userMarker.setLatLng(latLng);
      if (this.accuracyCircle) {
        this.accuracyCircle.setLatLng(latLng);
        if (coords.accuracy) this.accuracyCircle.setRadius(coords.accuracy);
      }
    }

    // Check arrival if navigating
    if (this.activeDestination && !this.hasArrived) {
      const distToTarget = GPSEngine.haversineDistance(
        coords.latitude,
        coords.longitude,
        this.activeDestination.latitude,
        this.activeDestination.longitude
      );

      // Update HUD metrics
      const distElement = document.getElementById('map-hud-dist');
      const timeElement = document.getElementById('map-hud-time');
      if (distElement) distElement.innerText = `${distToTarget} m`;
      if (timeElement) timeElement.innerText = GPSEngine.formatWalkingTime(distToTarget);

      if (distToTarget <= this.arrivalThreshold) {
        this.triggerArrival(this.activeDestination);
      }
    }
  }

  /**
   * Draw the Dijkstra pathway route connecting actual corridor waypoints
   */
  displayRoute(routeData) {
    if (!this.map || !routeData || !Array.isArray(routeData.waypoints)) return;

    this.activeRouteData = routeData;
    this.activeDestination = routeData.destination || routeData.waypoints[routeData.waypoints.length - 1];
    this.hasArrived = false;

    // Clear previous polyline
    if (this.routePolyline) {
      this.routePolyline.remove();
      this.routePolyline = null;
    }

    // Start the drawn path at the user's live position when available
    const latLngs = routeData.waypoints.map(wp => [wp.latitude, wp.longitude]);
    if (this.userMarker) {
      const u = this.userMarker.getLatLng();
      const first = latLngs[0];
      if (!first || u.distanceTo(L.latLng(first[0], first[1])) > 8) {
        latLngs.unshift([u.lat, u.lng]);
      }
    }

    // Draw glowing neon electric blue route
    this.routePolyline = L.polyline(latLngs, {
      color: '#00e5ff',
      weight: 5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: '8, 4'
    }).addTo(this.map);

    // Zoom and pan to fit entire route
    const bounds = L.latLngBounds(latLngs);
    if (this.userMarker) {
      bounds.extend(this.userMarker.getLatLng());
    }
    this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 20 });

    // Seed the HUD with route totals so it is useful before the first GPS tick
    const totalDistance = Number(routeData.totalDistance) || 0;
    const distElement = document.getElementById('map-hud-dist');
    const timeElement = document.getElementById('map-hud-time');
    if (distElement) distElement.innerText = `${totalDistance} m`;
    if (timeElement) {
      timeElement.innerText = (routeData.walkingTime && routeData.walkingTime.formatted)
        ? routeData.walkingTime.formatted
        : GPSEngine.formatWalkingTime(totalDistance);
    }

    // Update HUD banner with first instruction
    this.updateInstructionHUD(routeData.instructions ? routeData.instructions[0] : null);
  }

  clearRoute() {
    if (this.routePolyline) {
      this.routePolyline.remove();
      this.routePolyline = null;
    }
    this.activeRouteData = null;
    this.activeDestination = null;
    this.hasArrived = false;
  }

  updateInstructionHUD(instruction) {
    const maneuverEl = document.getElementById('map-hud-maneuver');
    const subEl = document.getElementById('map-hud-sub');
    const iconEl = document.getElementById('map-hud-icon');

    if (!instruction) return;

    if (maneuverEl) maneuverEl.innerText = instruction.maneuver || 'Continue';
    if (subEl) subEl.innerText = instruction.instruction || '';

    if (iconEl) {
      iconEl.innerHTML = this.getManeuverIcon(instruction.maneuver);
    }
  }

  triggerArrival(destination) {
    this.hasArrived = true;
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate([150, 100, 250]);
    }

    if (window.app && typeof window.app.showArrivalModal === 'function') {
      window.app.showArrivalModal(destination);
    }
  }

  reCenterUser() {
    if (this.userMarker && this.map) {
      this.map.flyTo(this.userMarker.getLatLng(), 19, { animate: true });
    } else {
      this.map.flyTo(this.campusCenter, 19, { animate: true });
    }
  }

  getCategoryIcon(cat) {
    switch (cat) {
      case 'Restroom':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 21h10M12 3v18M18 7H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>';
      case 'Auditorium':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
      case 'Resource Center':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15zM8 7h8M8 11h8"/></svg>';
      case 'Administrative':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>';
      case 'Faculty':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
      case 'Facility':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>';
      case 'Corridor Junction':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
      default: // Academic / Classroom
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>';
    }
  }

  getManeuverIcon(maneuver = '') {
    const m = maneuver.toLowerCase();
    if (m.includes('right')) {
      return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/><line x1="5" y1="12" x2="15" y2="12"/></svg>';
    } else if (m.includes('left')) {
      return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/><line x1="19" y1="12" x2="9" y2="12"/></svg>';
    } else if (m.includes('arrive')) {
      return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>';
    }
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  }
}

window.campusMapManager = new CampusMapManager();
