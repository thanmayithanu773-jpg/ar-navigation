/**
 * CAMPUS AR NAVIGATION - Administrator Panel Logic
 * Authentication, Dashboard KPIs, Locations CRUD, Persisted Destination
 * Selections (history), and Real-time Telemetry.
 */

/**
 * Escape user-supplied strings before interpolating them into table markup
 */
function escapeAdminHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

class AdminManager {
  constructor() {
    this.token = localStorage.getItem('campus_ar_admin_token') || null;
    this.adminUser = null;
    try {
      this.adminUser = JSON.parse(localStorage.getItem('campus_ar_admin_user') || 'null');
    } catch (e) {
      this.adminUser = null;
    }
    this.locationsCache = [];

    // Live telemetry state (Socket.IO)
    this.telemetrySocket = null;
    this.trackedUsers = new Map();
    this.initTelemetry();
    this.bindTableActions();
  }

  /**
   * Delegate table row actions so names containing quotes never break handlers
   */
  bindTableActions() {
    const locBody = document.getElementById('admin-locations-tbody');
    if (!locBody) return;
    locBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      const row = btn ? btn.closest('tr[data-loc-id]') : null;
      if (!btn || !row) return;
      const id = row.getAttribute('data-loc-id');
      if (btn.getAttribute('data-action') === 'edit') {
        this.openEditLocationModal(id);
      } else {
        const loc = this.locationsCache.find(l => String(l._id) === String(id));
        this.handleDeleteLocation(id, loc ? loc.name : 'this location');
      }
    });
  }

  /**
   * Subscribe to real-time navigation telemetry broadcast by Socket.IO
   */
  async initTelemetry() {
    if (window.backendReady) await window.backendReady;
    if (this.telemetrySocket || typeof io === 'undefined') return;

    this.telemetrySocket = window.API_ORIGIN ? io(window.API_ORIGIN) : io();

    this.telemetrySocket.on('admin:user_tracked', (data) => {
      if (!data || !data.socketId) return;
      this.trackedUsers.set(data.socketId, data);
      this.renderLiveTelemetry(data);
    });

    this.telemetrySocket.on('admin:arrival_alert', (data) => {
      this.renderLiveTelemetry(data);
      if (window.app && data && data.destination) {
        window.app.showToast(`Destination reached: ${data.destination}`, 'success');
      }
      if (this.isLoggedIn()) this.renderDashboard();
    });

    this.telemetrySocket.on('admin:user_disconnected', (data) => {
      if (data && data.socketId) this.trackedUsers.delete(data.socketId);
      this.renderLiveTelemetry(null);
    });
  }

  renderLiveTelemetry(latest) {
    const countEl = document.getElementById('admin-live-users');
    if (countEl) countEl.innerText = String(this.trackedUsers.size);

    if (!latest || !latest.destination) return;
    const latestEl = document.getElementById('admin-live-latest');
    if (latestEl) {
      const accuracy = latest.accuracy ? ` • ±${Math.round(latest.accuracy)}m` : '';
      latestEl.innerText = `${latest.destination} • ${String(latest.mode || 'ar').toUpperCase()} • ${latest.status || 'enroute'}${accuracy}`;
    }
  }

  isLoggedIn() {
    return !!this.token;
  }

  getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`
    };
  }

  /**
   * Fetch wrapper that catches expired/invalid JWTs and reopens the login modal
   */
  async authFetch(url, options = {}) {
    const res = await fetch(window.apiUrl(url), {
      ...options,
      headers: { ...this.getAuthHeaders(), ...(options.headers || {}) }
    });
    if (res.status === 401) {
      this.expireSession();
      throw new Error('Administrator session expired. Please sign in again.');
    }
    return res;
  }

  expireSession() {
    const hadToken = !!this.token;
    this.token = null;
    this.adminUser = null;
    localStorage.removeItem('campus_ar_admin_token');
    localStorage.removeItem('campus_ar_admin_user');
    if (hadToken && window.app) {
      window.app.showToast('Administrator session expired. Please sign in again.', 'warning');
      window.app.openModal('modal-admin-login');
    }
  }

  /**
   * Restore the signed-in administrator profile after a page reload
   */
  async loadProfile() {
    if (!this.token) return null;
    try {
      const res = await this.authFetch('/api/admin/profile');
      const data = await res.json();
      if (data.success && data.data) {
        this.adminUser = data.data;
        localStorage.setItem('campus_ar_admin_user', JSON.stringify(data.data));
        return data.data;
      }
    } catch (e) {
      // expireSession already handled auth failures
    }
    return null;
  }

  async login(username, password) {
    if (window.backendReady) await window.backendReady;
    const backendLabel = window.API_ORIGIN || window.location.origin;
    let res;
    try {
      res = await fetch(window.apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
    } catch (err) {
      console.error('Login error:', err);
      throw new Error(
        `Cannot reach the backend server at ${backendLabel}. Start it with "npm start" and open the URL it prints.`
      );
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      console.error('Login error:', err);
      throw new Error(
        `Login service unavailable (HTTP ${res.status}) at ${backendLabel}. Make sure the backend is running, then reload the page.`
      );
    }

    if (!data.success) {
      throw new Error(data.message || 'Authentication failed');
    }

    this.token = data.token;
    this.adminUser = data.admin;
    localStorage.setItem('campus_ar_admin_token', this.token);
    localStorage.setItem('campus_ar_admin_user', JSON.stringify(this.adminUser));

    return data;
  }

  logout() {
    this.token = null;
    this.adminUser = null;
    localStorage.removeItem('campus_ar_admin_token');
    localStorage.removeItem('campus_ar_admin_user');
    window.location.reload();
  }

  /**
   * Fetch Dashboard Statistics
   */
  async fetchDashboardStats() {
    try {
      const res = await this.authFetch('/api/dashboard');
      const data = await res.json();
      return data.success ? data.data : null;
    } catch (e) {
      console.error('Error fetching dashboard stats:', e);
      return null;
    }
  }

  /**
   * Fetch All Campus Locations
   */
  async fetchLocations() {
    try {
      if (window.backendReady) await window.backendReady;
      const res = await fetch(window.apiUrl('/api/locations'));
      const data = await res.json();
      if (data.success) {
        this.locationsCache = data.data;
        return data.data;
      }
      return [];
    } catch (e) {
      console.error('Error fetching locations:', e);
      return [];
    }
  }

  /**
   * Fetch the persisted history of destinations selected by users
   */
  async fetchDestinationHistory() {
    try {
      const res = await this.authFetch('/api/admin/destination-history');
      const data = await res.json();
      return data.success && Array.isArray(data.data) ? data.data : [];
    } catch (e) {
      console.error('Error fetching destination history:', e);
      return [];
    }
  }

  /**
   * Create Location
   */
  async createLocation(locationData) {
    const res = await this.authFetch('/api/locations', {
      method: 'POST',
      body: JSON.stringify(locationData)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    return data.data;
  }

  /**
   * Update Location
   */
  async updateLocation(id, locationData) {
    const res = await this.authFetch(`/api/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(locationData)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    return data.data;
  }

  /**
   * Delete Location
   */
  async deleteLocation(id) {
    const res = await this.authFetch(`/api/locations/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    return true;
  }

  applyStats(stats) {
    if (!stats) return;
    const locEl = document.getElementById('admin-stat-locations');
    const arrivalsEl = document.getElementById('admin-stat-arrivals');
    const navEl = document.getElementById('admin-stat-navigations');
    const actEl = document.getElementById('admin-stat-active');

    if (locEl) locEl.innerText = stats.totalLocations;
    if (arrivalsEl) arrivalsEl.innerText = stats.totalArrivals ?? 0;
    if (navEl) navEl.innerText = stats.totalNavigations;
    if (actEl) actEl.innerText = stats.activeDestinations;
  }

  /**
   * Render Admin Dashboard Views
   */
  async renderDashboard() {
    const [stats, logs] = await Promise.all([
      this.fetchDashboardStats(),
      this.fetchDestinationHistory()
    ]);

    this.applyStats(stats);
    this.renderActivityLogs(logs);

    // Render Locations Table
    await this.renderLocationsTable();
  }

  /**
   * Re-fetch and repaint the destination history table and KPIs
   */
  async refreshDestinationHistory() {
    const tbody = document.getElementById('admin-logs-tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Loading destination history…</td></tr>';
    }
    const [stats, logs] = await Promise.all([
      this.fetchDashboardStats(),
      this.fetchDestinationHistory()
    ]);
    this.applyStats(stats);
    this.renderActivityLogs(logs);
    if (window.app) {
      window.app.showToast(
        logs.length ? `Destination history refreshed — ${logs.length} selection(s)` : 'No destination selections recorded yet',
        logs.length ? 'success' : 'warning'
      );
    }
  }

  async renderLocationsTable() {
    const locations = await this.fetchLocations();
    const tbody = document.getElementById('admin-locations-tbody');
    if (!tbody) return;

    if (locations.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No campus locations configured yet.</td></tr>';
      return;
    }

    tbody.innerHTML = locations.map(loc => {
      const statusColor = loc.status === 'active' ? '#10b981' : (loc.status === 'maintenance' ? '#f59e0b' : '#ef4444');
      const landmarks = Array.isArray(loc.landmarkFeatures) && loc.landmarkFeatures.length > 0
        ? `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 3px;">${escapeAdminHtml(loc.landmarkFeatures.join(', '))}</div>`
        : '';

      return `
      <tr data-loc-id="${escapeAdminHtml(loc._id)}">
        <td><strong>${escapeAdminHtml(loc.name)}</strong>${landmarks}</td>
        <td><span class="dest-badge">${escapeAdminHtml(loc.category)}</span></td>
        <td><code>${Number(loc.latitude).toFixed(6)}, ${Number(loc.longitude).toFixed(6)}</code></td>
        <td>${escapeAdminHtml(loc.building)} • ${escapeAdminHtml(loc.floor)}</td>
        <td><span style="color: ${statusColor}; font-weight: bold;">${escapeAdminHtml(loc.status || 'active')}</span></td>
        <td>
          <button class="btn-action-icon" data-action="edit" title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="btn-action-icon delete" data-action="delete" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>
      `;
    }).join('');
  }

  /**
   * Render persisted destination selections, newest first
   */
  renderActivityLogs(logs = []) {
    const tbody = document.getElementById('admin-logs-tbody');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No destinations selected by users yet.</td></tr>';
      return;
    }

    const sorted = [...logs].sort((a, b) => this.logTimestamp(b) - this.logTimestamp(a));

    tbody.innerHTML = sorted.map(l => {
      const coords = l.userCoordinates;
      const hasGps = coords && Number.isFinite(Number(coords.latitude)) && Number.isFinite(Number(coords.longitude));
      const gps = hasGps
        ? `<code style="font-size: 0.75rem;">${Number(coords.latitude).toFixed(5)}, ${Number(coords.longitude).toFixed(5)}</code>`
        : '<span style="color: var(--text-muted);">GPS off</span>';
      const status = String(l.status || 'started').toLowerCase();
      const statusColor = status === 'reached' ? '#10b981' : (status === 'cancelled' ? '#ef4444' : '#38bdf8');
      const when = this.formatLogDate(l);

      return `
      <tr>
        <td><strong>${escapeAdminHtml(l.destination || 'Campus Point')}</strong></td>
        <td><span class="dest-badge">${escapeAdminHtml(String(l.navigationMode || 'gps').toUpperCase())}</span></td>
        <td><span style="color: ${statusColor}; font-weight: 700;">${escapeAdminHtml(status.toUpperCase())}</span></td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary); white-space: nowrap;">${escapeAdminHtml(when.time)}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap;">${escapeAdminHtml(when.day)}</div>
        </td>
        <td>${gps}</td>
      </tr>
      `;
    }).join('');
  }

  logTimestamp(log) {
    const raw = log?.date || log?.createdAt;
    const time = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(time) ? time : 0;
  }

  formatLogDate(log) {
    const raw = log?.date || log?.createdAt;
    if (!raw) return { time: '—', day: '' };
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return { time: '—', day: '' };
    return {
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      day: date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
    };
  }

  async handleDeleteLocation(id, name) {
    if (!confirm(`Are you sure you want to remove '${name}' from campus locations?`)) return;
    try {
      await this.deleteLocation(id);
      window.app.showToast(`Location '${name}' deleted successfully`, 'success');
      await this.renderDashboard();
      if (window.app) await window.app.loadCampusLocations();
    } catch (e) {
      window.app.showToast(e.message, 'error');
    }
  }

  openEditLocationModal(id) {
    const loc = this.locationsCache.find(l => String(l._id) === String(id));
    if (!loc) return;

    document.getElementById('edit-loc-id').value = loc._id;
    document.getElementById('edit-loc-name').value = loc.name;
    document.getElementById('edit-loc-lat').value = loc.latitude;
    document.getElementById('edit-loc-lon').value = loc.longitude;
    document.getElementById('edit-loc-category').value = loc.category;
    document.getElementById('edit-loc-building').value = loc.building;
    document.getElementById('edit-loc-floor').value = loc.floor;
    document.getElementById('edit-loc-desc').value = loc.description || '';

    const statusEl = document.getElementById('edit-loc-status');
    if (statusEl) statusEl.value = loc.status || 'active';
    const landmarksEl = document.getElementById('edit-loc-landmarks');
    if (landmarksEl) {
      landmarksEl.value = Array.isArray(loc.landmarkFeatures) ? loc.landmarkFeatures.join(', ') : '';
    }

    window.app.openModal('modal-edit-location');
  }
}

window.adminManager = new AdminManager();
