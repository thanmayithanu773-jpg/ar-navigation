/**
 * CAMPUS AR NAVIGATION - Master Application Controller
 * Orchestrates views, search suggestions, destination cards,
 * navigation launches, arrival flows, and modal controls.
 */

// Embedded default campus locations with EXACT preserved coordinates
// These are the canonical 10 campus locations - instantly visible on page load, no server needed!
const PREDEFINED_CAMPUS_LOCATIONS = [
  {
    _id: "loc_1",
    name: "Wash Room",
    latitude: 13.337356,
    longitude: 77.131155,
    category: "Restroom",
    building: "Main Academic Block",
    floor: "Ground Floor",
    status: "active",
    description: "Campus executive and student restrooms with modern hygiene facilities and water dispenser."
  },
  {
    _id: "loc_2",
    name: "3rd Year BCA Classroom",
    latitude: 13.336996,
    longitude: 77.130134,
    category: "Academic",
    building: "Computer Applications Wing",
    floor: "2nd Floor",
    status: "active",
    description: "Final Year BCA Lecture Hall equipped with interactive smart board and tiered acoustic seating."
  },
  {
    _id: "loc_3",
    name: "2nd Year BCA Classroom",
    latitude: 13.336973,
    longitude: 77.130062,
    category: "Academic",
    building: "Computer Applications Wing",
    floor: "1st Floor",
    status: "active",
    description: "Second Year BCA Lecture Hall featuring multimedia teaching aids and student discussion pods."
  },
  {
    _id: "loc_4",
    name: "1st Year BCA Classroom",
    latitude: 13.336754,
    longitude: 77.129898,
    category: "Academic",
    building: "Computer Applications Wing",
    floor: "Ground Floor",
    status: "active",
    description: "First Year Foundation Lecture Room with modern ergonomics and dual whiteboards."
  },
  {
    _id: "loc_5",
    name: "Seminar Hall",
    latitude: 13.336954,
    longitude: 77.130111,
    category: "Auditorium",
    building: "Central Auditorium Complex",
    floor: "Ground Floor",
    status: "active",
    description: "Air-conditioned auditorium for guest lectures, hackathons, and technical symposiums."
  },
  {
    _id: "loc_6",
    name: "Staff Room",
    latitude: 13.336816,
    longitude: 77.130138,
    category: "Faculty",
    building: "Main Academic Block",
    floor: "1st Floor",
    status: "active",
    description: "BCA & Computer Science faculty workstation cabins and student mentoring desks."
  },
  {
    _id: "loc_7",
    name: "Meeting Room",
    latitude: 13.337001,
    longitude: 77.130134,
    category: "Administrative",
    building: "Administrative Wing",
    floor: "1st Floor",
    status: "active",
    description: "Executive conference room with presentation screens and boardroom seating."
  },
  {
    _id: "loc_8",
    name: "Principal Office",
    latitude: 13.337017,
    longitude: 77.130165,
    category: "Administrative",
    building: "Administrative Wing",
    floor: "Ground Floor",
    status: "active",
    description: "Office of the College Principal and executive administration suite with reception lounge."
  },
  {
    _id: "loc_9",
    name: "Library",
    latitude: 13.337043,
    longitude: 77.130291,
    category: "Resource Center",
    building: "Central Library Block",
    floor: "Ground Floor",
    status: "active",
    description: "Central campus library containing physical volumes, digital catalog kiosks, and silent study zones."
  },
  {
    _id: "loc_10",
    name: "Academic Director Office Room",
    latitude: 13.336810,
    longitude: 77.130165,
    category: "Administrative",
    building: "Administrative Wing",
    floor: "1st Floor",
    status: "active",
    description: "Office of the Academic Director overseeing curriculum, university examinations, and institutional planning."
  }
];

class CampusARApp {
  constructor() {
    this.currentView = 'home';
    // Initialize immediately with predefined locations so UI is never empty
    this.locations = [...PREDEFINED_CAMPUS_LOCATIONS];
    this.filteredLocations = [...PREDEFINED_CAMPUS_LOCATIONS];
    this.selectedCategory = 'all';
    this.activeDestination = null;
    this.userGpsCoords = null;
    this.gpsNoticeShown = false;
    this._navRequestId = 0;
    this._launchingAR = false;
    this._arPickerTimer = null;
  }

  async init() {
    console.log('🚀 Initializing CAMPUS AR NAVIGATION System...');

    // 1. Instantly render destinations across all views from embedded data
    this.renderDestinationCards();
    this.renderARDestinationModal();
    this.renderARTrayChips();

    // 2. Initialize GPS Tracking Engine
    if (window.gpsEngine) {
      window.gpsEngine.startTracking();
      window.gpsEngine.onPositionChange((pos, meta) => this.handleGPSUpdate(pos, meta));
      window.gpsEngine.onError((err) => this.handleGPSError(err));
    }

    // 2b. Initialize the interactive GPS campus map (embedded locations first)
    if (window.campusMapManager) {
      window.campusMapManager.initMap();
      window.campusMapManager.renderLocations(this.locations);
    }

    // 3. Bind UI Event Listeners
    this.bindEvents();

    // 4. Keep fullscreen map/AR heights in sync with the wrapping navbar
    this.syncNavbarHeight();
    const navbarEl = document.querySelector('.navbar');
    if (navbarEl && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.syncNavbarHeight()).observe(navbarEl);
    } else {
      window.addEventListener('resize', () => this.syncNavbarHeight());
    }

    // 5. Check URL hash for initial routing
    this.handleRouting();

    // 6. Asynchronously sync locations from backend API (if server is online)
    await this.loadCampusLocations();
  }

  syncNavbarHeight() {
    const navbarEl = document.querySelector('.navbar');
    if (!navbarEl) return;
    document.documentElement.style.setProperty('--navbar-height', `${navbarEl.offsetHeight}px`);
  }

  async loadCampusLocations() {
    try {
      if (window.backendReady) await window.backendReady;
      const res = await fetch(window.apiUrl('/api/locations'));
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        // Merge API locations with predefined fallbacks, matching by name so
        // MongoDB ObjectIds never duplicate the embedded campus dataset.
        const merged = [...data.data];
        const seenNames = new Set(merged.map(l => String(l.name || '').trim().toLowerCase()));
        PREDEFINED_CAMPUS_LOCATIONS.forEach(pre => {
          const key = pre.name.trim().toLowerCase();
          if (!seenNames.has(key)) {
            merged.push(pre);
            seenNames.add(key);
          }
        });
        this.locations = merged;
        this.filteredLocations = [...this.locations];
        this.renderDestinationCards();
        this.renderARDestinationModal();
        this.renderARTrayChips();
        if (window.campusMapManager) window.campusMapManager.renderLocations(this.locations);
        console.log(`📍 Synced ${this.locations.length} campus locations from backend`);
      }
    } catch (e) {
      // Backend unavailable — predefined locations already loaded, app works offline
      console.log('ℹ️ Backend offline — running with embedded campus locations (all 10 destinations available)');
    }
  }

  handleGPSUpdate(pos, meta) {
    this.userGpsCoords = pos;
    this.gpsNoticeShown = false;

    // Update GPS status badge in navbar
    const badge = document.getElementById('navbar-gps-status');
    if (badge) {
      badge.innerHTML = `<span class="pulse-dot"></span> GPS Online (±${Math.round(pos.accuracy)}m)`;
      badge.style.borderColor = meta.isAccurate ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)';
      badge.title = `Live distances measured from your GPS position (${Number(pos.latitude).toFixed(6)}, ${Number(pos.longitude).toFixed(6)})`;
    }

    // Update real-time distances across all cards and trays
    this.updateCardDistances();

    // Keep the Leaflet user marker locked to the live GPS fix
    if (window.campusMapManager) window.campusMapManager.updateUserPosition(pos, meta);

    // Advance turn-by-turn guidance and stream live telemetry
    if (window.navigationCoordinator) {
      window.navigationCoordinator.updateProgress(pos);
      window.navigationCoordinator.emitLocationUpdate();
    }
  }

  handleGPSError(err) {
    const badge = document.getElementById('navbar-gps-status');
    if (badge) {
      badge.innerHTML = `<span class="pulse-dot" style="background: #f59e0b;"></span> GPS Off — Tap to enable`;
      badge.style.borderColor = 'rgba(245, 158, 11, 0.45)';
      badge.title = 'Tap to request location access for live distances';
    }

    // Never show distances from a fabricated origin: without a GPS fix the
    // cards fall back to an explicit "Enable GPS" state instead.
    this.updateCardDistances();

    if (!this.userGpsCoords && !this.gpsNoticeShown) {
      this.gpsNoticeShown = true;
      this.showToast('Live distances need your location. Tap the GPS badge or "Enable GPS" on a destination card.', 'warning');
    }
    console.warn('GPS Signal Notice:', err.message);
  }

  requestGps() {
    if (!window.gpsEngine) return;
    this.showToast('Requesting your location — allow access to see live distances from your position.', 'info');
    window.gpsEngine.stopTracking();
    window.gpsEngine.startTracking();
  }

  switchView(viewName, options = {}) {
    // Administrator view requires a valid JWT session
    if (viewName === 'admin') {
      if (!window.adminManager || !window.adminManager.isLoggedIn()) {
        this.showToast('Administrator sign-in required', 'warning');
        this.openModal('modal-admin-login');
        if (!document.querySelector('.view-container.active')) {
          const homeEl = document.getElementById('view-home');
          if (homeEl) homeEl.classList.add('active');
          this.currentView = 'home';
        }
        // Normalise deep links to #admin while signed out
        if (window.location.hash === '#admin') {
          window.location.hash = '#home';
        }
        return;
      }
    }

    if (this.currentView === viewName) {
      // Tapping the Live AR nav button again should re-open the destination list
      if (viewName === 'ar' && !options.keepDestinationPickerClosed) {
        this.renderARTrayChips();
        this.openARDestinationPicker();
      }
      return;
    }

    // Stop AR if leaving AR view
    if (this.currentView === 'ar' && viewName !== 'ar') {
      if (window.liveAREngine) window.liveAREngine.stopAR();
    }

    // Hide all view containers
    document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));

    // Show selected view
    const targetEl = document.getElementById(`view-${viewName}`);
    if (targetEl) {
      targetEl.classList.add('active');
    }

    // Update navbar active state
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    this.currentView = viewName;
    window.location.hash = `#${viewName}`;

    // Entering AR mode always presents the 10 campus destinations for selection
    if (viewName === 'ar') {
      this.renderARTrayChips();

      // Returning to Live AR with an active destination resumes that session
      // instead of showing a stale, stopped camera canvas.
      if (
        this.activeDestination &&
        !this._launchingAR &&
        window.liveAREngine &&
        !window.liveAREngine.isARActive
      ) {
        this.startNavigation(this.activeDestination._id, 'ar');
        return;
      }

      if (!options.keepDestinationPickerClosed) {
        if (this._arPickerTimer) clearTimeout(this._arPickerTimer);
        this._arPickerTimer = setTimeout(() => {
          this._arPickerTimer = null;
          this.openARDestinationPicker();
        }, 150);
      }
    }

    if (viewName === 'map' && window.campusMapManager && window.campusMapManager.map) {
      setTimeout(() => window.campusMapManager.map.invalidateSize(), 60);
    }

    // Admin render trigger
    if (viewName === 'admin' && window.adminManager) {
      const syncAdminChip = () => {
        const chipEl = document.getElementById('admin-user-name');
        if (chipEl) chipEl.innerText = window.adminManager.adminUser?.username || 'Administrator';
      };
      syncAdminChip();
      window.adminManager.loadProfile().then(() => {
        syncAdminChip();
        window.adminManager.renderDashboard();
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  handleRouting() {
    const views = ['home', 'search', 'map', 'ar', 'admin'];
    const hash = window.location.hash.replace('#', '') || 'home';
    if (views.includes(hash)) {
      this.switchView(hash);
    } else {
      this.switchView('home');
    }

    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.replace('#', '') || 'home';
      // switchView() writes the hash itself; ignore the echo so launching AR
      // does not re-enter the view and pop the destination picker.
      if (newHash === this.currentView) return;
      this.switchView(views.includes(newHash) ? newHash : 'home');
    });
  }

  bindEvents() {
    // GPS status badge — tap to request a fresh location fix
    const gpsBadge = document.getElementById('navbar-gps-status');
    if (gpsBadge) {
      gpsBadge.style.cursor = 'pointer';
      gpsBadge.title = 'Tap to enable live GPS distances';
      gpsBadge.addEventListener('click', () => this.requestGps());
    }

    // Nav buttons
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        this.switchView(view);
      });
    });

    // Home buttons
    const btnStartNav = document.getElementById('home-btn-start-nav');
    if (btnStartNav) btnStartNav.addEventListener('click', () => this.switchView('search'));

    // Clicking "LIVE AR NAVIGATION" card opens the AR Destinations Picker immediately!
    const cardArNav = document.getElementById('card-launch-ar');
    if (cardArNav) cardArNav.addEventListener('click', () => this.openARDestinationPicker());

    // AR Change Destination button
    const btnArPick = document.getElementById('btn-ar-pick-destination');
    if (btnArPick) btnArPick.addEventListener('click', () => this.openARDestinationPicker());

    // AR Test Arrival simulation button
    const btnArTestArrival = document.getElementById('btn-ar-test-arrival');
    if (btnArTestArrival) {
      btnArTestArrival.addEventListener('click', () => {
        const dest = this.activeDestination || (this.locations.length > 0 ? this.locations[0] : null);
        if (dest) {
          this.showArrivalModal(dest);
        } else {
          this.showToast('Please select a destination first', 'info');
        }
      });
    }

    // Search input
    const searchInput = document.getElementById('destination-search-input');
    const clearBtn = document.getElementById('clear-search-btn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';
        this.filterLocations(query);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          clearBtn.style.display = 'none';
          this.filterLocations('');
          searchInput.focus();
        }
      });
    }

    // Category filter pills
    document.querySelectorAll('.category-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.selectedCategory = pill.getAttribute('data-category');
        const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
        this.filterLocations(q);
      });
    });

    // Exit AR button
    const btnExitAr = document.getElementById('btn-exit-ar');
    if (btnExitAr) {
      btnExitAr.addEventListener('click', () => {
        this.switchView('home');
      });
    }

    // Arrival Modal Buttons
    const btnArrivalAnother = document.getElementById('btn-arrival-another');
    if (btnArrivalAnother) {
      btnArrivalAnother.addEventListener('click', () => {
        this.closeModal('modal-arrival');
        this.openARDestinationPicker();
      });
    }

    const btnArrivalHome = document.getElementById('btn-arrival-home');
    if (btnArrivalHome) {
      btnArrivalHome.addEventListener('click', () => {
        this.closeModal('modal-arrival');
        this.switchView('home');
      });
    }

    // Admin login form submit
    const adminLoginForm = document.getElementById('admin-login-form');
    if (adminLoginForm) {
      adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('admin-login-username').value;
        const pass = document.getElementById('admin-login-password').value;
        const submitBtn = document.getElementById('admin-login-btn');

        try {
          if (submitBtn) submitBtn.disabled = true;
          await window.adminManager.login(user, pass);
          this.closeModal('modal-admin-login');
          this.showToast('Administrator authenticated successfully', 'success');

          const wasAlreadyOnAdminView = this.currentView === 'admin';
          this.switchView('admin');
          // switchView() early-returns when the admin view is already active,
          // so refresh the dashboard explicitly in that case.
          if (wasAlreadyOnAdminView) {
            window.adminManager.renderDashboard();
            const chipEl = document.getElementById('admin-user-name');
            if (chipEl) chipEl.innerText = window.adminManager.adminUser?.username || 'Administrator';
          }
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // Admin CRUD forms
    const addLocForm = document.getElementById('form-add-location');
    if (addLocForm) {
      addLocForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!this.ensureAdminSession()) return;
        const submitBtn = addLocForm.querySelector('button[type="submit"]');
        try {
          if (submitBtn) submitBtn.disabled = true;
          const created = await window.adminManager.createLocation({
            name: document.getElementById('add-loc-name').value.trim(),
            latitude: Number(document.getElementById('add-loc-lat').value),
            longitude: Number(document.getElementById('add-loc-lon').value),
            category: document.getElementById('add-loc-category').value,
            floor: document.getElementById('add-loc-floor').value.trim() || 'Ground Floor',
            building: document.getElementById('add-loc-building').value.trim() || 'Main Academic Block',
            status: document.getElementById('add-loc-status').value,
            landmarkFeatures: this.parseLandmarks('add-loc-landmarks'),
            description: document.getElementById('add-loc-desc').value.trim()
          });
          addLocForm.reset();
          this.closeModal('modal-add-location');
          this.showToast(`Location '${created.name}' added successfully`, 'success');
          await window.adminManager.renderDashboard();
          await this.loadCampusLocations();
        } catch (err) {
          this.showToast(err.message || 'Failed to create location', 'error');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    const editLocForm = document.getElementById('form-edit-location');
    if (editLocForm) {
      editLocForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!this.ensureAdminSession()) return;
        const submitBtn = editLocForm.querySelector('button[type="submit"]');
        try {
          if (submitBtn) submitBtn.disabled = true;
          const id = document.getElementById('edit-loc-id').value;
          const updated = await window.adminManager.updateLocation(id, {
            name: document.getElementById('edit-loc-name').value.trim(),
            latitude: Number(document.getElementById('edit-loc-lat').value),
            longitude: Number(document.getElementById('edit-loc-lon').value),
            category: document.getElementById('edit-loc-category').value,
            floor: document.getElementById('edit-loc-floor').value.trim(),
            building: document.getElementById('edit-loc-building').value.trim(),
            status: document.getElementById('edit-loc-status').value,
            landmarkFeatures: this.parseLandmarks('edit-loc-landmarks'),
            description: document.getElementById('edit-loc-desc').value.trim()
          });
          this.closeModal('modal-edit-location');
          this.showToast(`Location '${updated.name}' updated successfully`, 'success');
          await window.adminManager.renderDashboard();
          await this.loadCampusLocations();
        } catch (err) {
          this.showToast(err.message || 'Failed to update location', 'error');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

  }

  parseLandmarks(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return [];
    return el.value.split(',').map(s => s.trim()).filter(Boolean);
  }

  ensureAdminSession() {
    if (window.adminManager && window.adminManager.isLoggedIn()) return true;
    this.showToast('Please sign in as administrator', 'warning');
    this.openModal('modal-admin-login');
    return false;
  }

  filterLocations(query = '') {
    this.filteredLocations = this.locations.filter(loc => {
      const matchesQuery = !query ||
        loc.name.toLowerCase().includes(query) ||
        loc.description?.toLowerCase().includes(query) ||
        loc.building?.toLowerCase().includes(query) ||
        loc.category?.toLowerCase().includes(query);

      const matchesCategory = this.selectedCategory === 'all' ||
        loc.category?.toLowerCase() === this.selectedCategory.toLowerCase();

      return matchesQuery && matchesCategory;
    });

    this.renderDestinationCards();
  }

  /**
   * Render destination cards in the Search view
   */
  renderDestinationCards() {
    const grid = document.getElementById('destinations-cards-grid');
    if (!grid) return;

    const countEl = document.getElementById('category-all-count');
    if (countEl) countEl.innerText = String(this.locations.length);

    if (this.filteredLocations.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
          <p style="font-size: 1.1rem; margin-bottom: 8px;">No campus locations found matching your search.</p>
          <span style="font-size: 0.85rem; color: var(--text-muted);">Try a different keyword or category.</span>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.filteredLocations.map(loc => {
      const distInfo = this.getDistanceToLocation(loc);
      const distAttrs = distInfo.hasFix
        ? ' title="Straight-line distance from your current GPS position"'
        : ' onclick="window.app.requestGps()" style="cursor: pointer;" title="Enable location to see your live distance"';

      return `
        <div class="dest-card" data-id="${loc._id}">
          <div class="dest-header">
            <h3 class="dest-name">${loc.name}</h3>
            <span class="dest-badge">${loc.category}</span>
          </div>

          <div class="dest-location-meta">
            <div class="meta-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v14M21 7v14M6 11h2M6 15h2M10 11h2M10 15h2M14 11h2M14 15h2M18 11h2M18 15h2M9 3l3-2 3 2"/></svg>
              <span>${loc.building}</span>
            </div>
            <div class="meta-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <span>${loc.floor}</span>
            </div>
          </div>

          <p class="dest-desc">${loc.description || 'Campus facility open for students and faculty.'}</p>

          <div class="dest-coordinates">
            📍 Lat: ${Number(loc.latitude).toFixed(6)}, Lon: ${Number(loc.longitude).toFixed(6)}
          </div>

          <div class="dest-distance-bar">
            <div class="distance-metric"${distAttrs}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
              <span class="card-dist-txt">${distInfo.distanceText}</span>
            </div>
            <div class="walking-metric card-time-txt">${distInfo.walkingTimeText}</div>
          </div>

          <div class="dest-actions">
            <button class="action-btn-ar" onclick="window.app.startNavigation('${loc._id}', 'ar')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Live AR
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render AR Destination Selection Modal with all 10 campus locations
   */
  renderARDestinationModal() {
    const container = document.getElementById('ar-modal-destinations-list');
    if (!container || !Array.isArray(this.locations)) return;

    container.innerHTML = this.locations.map((loc, idx) => {
      const distInfo = this.getDistanceToLocation(loc);
      const distDetail = distInfo.hasFix
        ? `<span style="font-weight: normal; font-size: 0.76rem; color: var(--text-muted);">(${distInfo.walkingTimeText})</span>`
        : `<span style="font-weight: normal; font-size: 0.76rem; color: #f59e0b; cursor: pointer;" onclick="event.stopPropagation(); window.app.requestGps();">(Enable GPS)</span>`;

      return `
        <div class="ar-dest-pick-card" onclick="window.app.selectARDestination('${loc._id}')">
          <div class="ar-pick-top">
            <div>
              <span style="font-size: 0.72rem; color: var(--electric-blue); font-weight: 800;">DESTINATION #${idx + 1}</span>
              <h4 class="ar-pick-name">${loc.name}</h4>
            </div>
            <span class="dest-badge">${loc.category}</span>
          </div>

          <div class="ar-pick-coords">
            📍 Lat: ${Number(loc.latitude).toFixed(6)}, Lon: ${Number(loc.longitude).toFixed(6)}
          </div>

          <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 10px; line-height: 1.4;">
            ${loc.building} • ${loc.floor}
          </p>

          <div class="ar-pick-meta">
            <div class="ar-pick-dist">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
              <span class="ar-modal-dist-txt">${distInfo.distanceText}</span>
              ${distDetail}
            </div>

            <button class="btn-launch-ar-item" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>
              Start AR
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render In-Screen AR Destination Quick Selector Chips
   */
  renderARTrayChips() {
    const tray = document.getElementById('ar-tray-chips');
    if (!tray || !Array.isArray(this.locations)) return;

    tray.innerHTML = this.locations.map(loc => {
      const isActive = this.activeDestination && (this.activeDestination._id === loc._id || this.activeDestination.name === loc.name);
      const distInfo = this.getDistanceToLocation(loc);

      return `
        <button type="button" class="ar-tray-chip ${isActive ? 'active' : ''}" data-id="${loc._id}" onclick="window.app.startNavigation('${loc._id}', 'ar')">
          <span>${this.getCategoryEmoji(loc.category)}</span>
          <span>${loc.name}</span>
          <span style="font-size: 0.75rem; color: var(--electric-blue); font-weight: 700;">(${distInfo.distanceText})</span>
        </button>
      `;
    }).join('');
  }

  getCategoryEmoji(cat) {
    switch (cat) {
      case 'Restroom': return '🚻';
      case 'Academic': return '🎓';
      case 'Auditorium': return '🏛️';
      case 'Faculty': return '👨‍🏫';
      case 'Administrative': return '💼';
      case 'Resource Center': return '📚';
      case 'Facility': return '🏢';
      case 'Corridor Junction': return '🧭';
      default: return '📍';
    }
  }

  openARDestinationPicker() {
    this.renderARDestinationModal();
    this.openModal('modal-ar-destinations');
  }

  async selectARDestination(destinationId) {
    this.closeModal('modal-ar-destinations');
    await this.startNavigation(destinationId, 'ar');
  }

  /**
   * Distance is always the great-circle distance between the user's live GPS
   * coordinates and this location's latitude/longitude. Without a real fix we
   * deliberately do not invent a reference point — the UI asks for GPS instead.
   */
  getDistanceToLocation(loc) {
    const coords = this.userGpsCoords;
    const userLat = coords ? Number(coords.latitude) : NaN;
    const userLon = coords ? Number(coords.longitude) : NaN;

    if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) {
      return {
        hasFix: false,
        distanceText: '-- m',
        walkingTimeText: 'Enable GPS'
      };
    }

    const meters = GPSEngine.haversineDistance(
      userLat,
      userLon,
      Number(loc.latitude),
      Number(loc.longitude)
    );

    return {
      hasFix: true,
      distanceText: `${meters} m`,
      walkingTimeText: GPSEngine.formatWalkingTime(meters)
    };
  }

  updateCardDistances() {
    // Update destination cards
    document.querySelectorAll('.dest-card').forEach(card => {
      const id = card.getAttribute('data-id');
      const loc = this.locations.find(l => String(l._id) === String(id));
      if (loc) {
        const info = this.getDistanceToLocation(loc);
        const distSpan = card.querySelector('.card-dist-txt');
        const timeSpan = card.querySelector('.card-time-txt');
        if (distSpan) distSpan.innerText = info.distanceText;
        if (timeSpan) timeSpan.innerText = info.walkingTimeText;
      }
    });

    // Update AR destination picker if it is open
    const pickerModal = document.getElementById('modal-ar-destinations');
    if (pickerModal && pickerModal.classList.contains('active')) {
      this.renderARDestinationModal();
    }

    // Update AR tray chips
    this.renderARTrayChips();
  }

  /**
   * Switch the current map route into the Live AR experience
   */
  switchToAR() {
    if (this.activeDestination) {
      this.startNavigation(this.activeDestination._id, 'ar');
      return;
    }
    this.switchView('ar');
  }

  /**
   * Launch Live AR Navigation
   */
  async startNavigation(destinationId, mode = 'ar') {
    const loc = this.locations.find(l => String(l._id) === String(destinationId) || l.name === destinationId);
    if (!loc) {
      this.showToast('Destination location not found', 'error');
      return;
    }

    const isAR = mode === 'ar';
    const requestId = this._navRequestId = (this._navRequestId || 0) + 1;

    this.activeDestination = loc;

    // Open the requested experience immediately — the pathway request runs in
    // the background so the AR camera/HUD (or map) never waits on the network.
    if (isAR) {
      if (this._arPickerTimer) {
        clearTimeout(this._arPickerTimer);
        this._arPickerTimer = null;
      }
      this.closeModal('modal-ar-destinations');

      this._launchingAR = true;
      this.switchView('ar', { keepDestinationPickerClosed: true });
      this._launchingAR = false;
      if (window.liveAREngine) {
        window.liveAREngine.startAR(loc, null);
      }
      this.renderARTrayChips();
    } else {
      this.switchView('map');
      if (window.campusMapManager) {
        window.campusMapManager.clearRoute();
        if (window.campusMapManager.map) window.campusMapManager.map.closePopup();
      }
    }

    const gpsNote = this.userGpsCoords ? '' : ' (GPS off — starting from campus center)';
    this.showToast(`Navigating to ${loc.name}...${gpsNote}`, 'info');

    try {
      // Calculate Dijkstra shortest pathway (with client-side fallback)
      const routeData = await window.navigationCoordinator.planRoute(loc._id, this.userGpsCoords, mode);

      // A newer destination tap superseded this request
      if (requestId !== this._navRequestId) return;

      if (isAR) {
        const ar = window.liveAREngine;
        if (ar) {
          ar.activeDestination = loc;
          ar.activeRoute = routeData;
          ar.hasArrived = false;
          ar.updateARHUD();
          const pos = window.gpsEngine && window.gpsEngine.currentPosition;
          if (pos) ar.handleGPSUpdate(pos);
        }
      } else {
        this.switchView('map');
        if (window.campusMapManager) {
          if (window.campusMapManager.map) window.campusMapManager.map.invalidateSize();
          window.campusMapManager.displayRoute(routeData);
          window.campusMapManager.renderLocations(this.locations);
        }
      }

      this.renderARTrayChips();
    } catch (e) {
      if (requestId !== this._navRequestId) return;
      this.showToast(e.message || 'Error generating route', 'error');
    }
  }

  showArrivalModal(destination) {
    if (window.navigationCoordinator) {
      window.navigationCoordinator.notifyArrival(destination);
    }

    const nameEl = document.getElementById('arrival-dest-name');
    const detailsEl = document.getElementById('arrival-dest-details');

    if (nameEl) nameEl.innerText = destination.name;
    if (detailsEl) detailsEl.innerText = `GPS: ${Number(destination.latitude).toFixed(6)}, ${Number(destination.longitude).toFixed(6)} • ${destination.building}`;

    this.openModal('modal-arrival');
  }

  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
  }

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  }

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

// Global initialization
window.app = new CampusARApp();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
