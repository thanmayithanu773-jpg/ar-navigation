/**
 * CAMPUS AR NAVIGATION - Runtime Backend Discovery
 *
 * The frontend may be opened from the Express server (same origin) or from a
 * separate static dev server / file path. This module finds the backend on the
 * current origin first, then on the backend's auto-selected port range
 * (5001-5020), and exposes window.API_ORIGIN / window.apiUrl() for every
 * fetch and Socket.IO connection in the app.
 */
(function () {
  'use strict';

  const PROJECT_NAME = 'CAMPUS AR NAVIGATION';
  const FALLBACK_PORTS = Array.from({ length: 20 }, (_, i) => 5001 + i);

  window.API_ORIGIN = '';
  window.backendDiscovered = false;
  window.apiUrl = function (path) {
    return (window.API_ORIGIN || '') + path;
  };

  let markReady;
  window.backendReady = new Promise((resolve) => {
    markReady = resolve;
  });

  function backendHost() {
    return window.location.hostname || 'localhost';
  }

  function originForPort(port) {
    const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
    return `${protocol}://${backendHost()}:${port}`;
  }

  async function probe(origin, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${origin}/api/health`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data && data.status === 'ONLINE' && data.project === PROJECT_NAME;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadSocketIOClient(origin) {
    if (window.io) return true;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `${origin}/socket.io/socket.io.js`;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  async function discoverBackend() {
    // Optional explicit override for unusual setups: index.html?apiPort=5002
    const overridePort = new URLSearchParams(window.location.search).get('apiPort');
    if (overridePort && /^\d+$/.test(overridePort)) {
      const overrideOrigin = originForPort(Number(overridePort));
      if (await probe(overrideOrigin, 1500)) return overrideOrigin;
    }

    // 1. Same origin (normal case: Express serves this page)
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      if (await probe(window.location.origin, 1200)) return window.location.origin;
    }

    // 2. Backend auto-selected port range
    for (const port of FALLBACK_PORTS) {
      const candidate = originForPort(port);
      if (candidate === window.location.origin) continue;
      if (await probe(candidate, 600)) return candidate;
    }

    return null;
  }

  discoverBackend()
    .then(async (origin) => {
      if (!origin) {
        console.warn('⚠️ Backend not found on this origin or ports 5001-5020.');
        markReady(false);
        return;
      }

      window.API_ORIGIN = origin === window.location.origin ? '' : origin.replace(/\/$/, '');
      window.backendDiscovered = true;

      const socketLoaded = await loadSocketIOClient(origin);
      if (!socketLoaded) {
        console.warn('⚠️ Socket.IO client could not be loaded from', origin);
      }

      console.log(
        origin === window.location.origin
          ? '🔗 Backend connected on same origin'
          : `🔗 Backend discovered at ${origin}`
      );
      markReady(true);
    })
    .catch((err) => {
      console.warn('Backend discovery failed:', err && err.message);
      markReady(false);
    });
})();
