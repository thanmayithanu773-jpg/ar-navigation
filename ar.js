/**
 * CAMPUS AR NAVIGATION - Live Camera-based Augmented Reality Engine
 * Three.js 3D Directional Arrow, Device Orientation Compass,
 * and Camera-based Visual Landmark Feature Positioning (No QR Codes).
 */

class LiveAREngine {
  constructor() {
    this.videoElement = null;
    this.canvasElement = null;
    this.stream = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.arrowGroup = null;
    this.animationFrameId = null;

    // Navigation State
    this.activeDestination = null;
    this.activeRoute = null;
    this.targetBearing = 0;
    this.currentCompassHeading = 0;
    this.deviceAlpha = 0;
    this.isARActive = false;
    this.hasArrived = false;
    this._gpsUnsubscribe = null;
    this._orientationBound = false;
    this._resizeBound = false;

    // Visual Feature Tracking State (No QR codes)
    this.analyzerCanvas = document.createElement('canvas');
    this.analyzerCtx = this.analyzerCanvas.getContext('2d', { willReadFrequently: true });
    this.trackingConfidence = 0.85;
    this.isTrackingLocked = false;
    this.visualTrackerInterval = null;
    this.recognizedLandmark = null;

    // Registered Campus Reference Visual Landmarks
    this.campusLandmarks = [
      { id: 'lib_gate', name: 'Library Security Gate', locationId: 'loc_9', colorSignature: [30, 80, 150], threshold: 0.72 },
      { id: 'prin_plate', name: 'Principal Brass Nameplate', locationId: 'loc_8', colorSignature: [190, 150, 40], threshold: 0.70 },
      { id: 'room_302', name: 'Room 302 Brass Plaque', locationId: 'loc_2', colorSignature: [170, 140, 50], threshold: 0.68 },
      { id: 'bca_banner', name: 'BCA Department Banner', locationId: 'loc_2', colorSignature: [20, 110, 210], threshold: 0.75 },
      { id: 'seminar_doors', name: 'Seminar Double Wooden Doors', locationId: 'loc_5', colorSignature: [110, 60, 30], threshold: 0.70 },
      { id: 'room_201', name: 'Room 201 Entryway', locationId: 'loc_3', colorSignature: [60, 100, 160], threshold: 0.68 },
      { id: 'washroom_sign', name: 'Restroom Facility Connector', locationId: 'loc_1', colorSignature: [20, 160, 200], threshold: 0.72 }
    ];
  }

  /**
   * Start Live AR Navigation Session
   */
  async startAR(destination, routeData) {
    // Changing the destination mid-session must not restart the live camera
    const cameraAlreadyLive = this.isARActive && !!this.stream;

    this.activeDestination = destination;
    this.activeRoute = routeData || null;
    this.hasArrived = false;
    this.isARActive = true;

    this.videoElement = document.getElementById('ar-video-feed');
    this.canvasElement = document.getElementById('ar-three-canvas');

    // Paint the 3D scene and HUD immediately. Camera and compass permission
    // dialogs must never block the AR view from opening.
    this.initThreeJS();
    this.initOrientationTracking();
    this.startVisualLandmarkTracking();
    this.updateARHUD();
    setTimeout(() => this.handleResize(), 120);

    if (this._gpsUnsubscribe) this._gpsUnsubscribe();
    this._gpsUnsubscribe = window.gpsEngine.onPositionChange((pos) => this.handleGPSUpdate(pos));

    if (cameraAlreadyLive) return;

    this.initCamera().then(cameraStarted => {
      if (cameraStarted || !this.isARActive) return;
      if (this._cameraWarningShown) return;
      this._cameraWarningShown = true;
      console.warn('⚠️ Camera activation failed. Running in AR Simulator mode.');
      if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast('Camera unavailable — showing AR guidance on a simulated backdrop. Allow camera access for the live feed.', 'warning');
      }
    });
  }

  /**
   * Request rear camera stream
   */
  async initCamera() {
    const requestId = this._cameraRequestId = (this._cameraRequestId || 0) + 1;
    this.stopCameraStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('MediaDevices API not available.');
      return false;
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // The session may have been stopped (or replaced) while the permission
      // prompt was open — never leave a hidden camera running.
      if (requestId !== this._cameraRequestId || !this.isARActive) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }

      this.stream = stream;
      if (this.videoElement) {
        this.videoElement.srcObject = stream;
        try {
          await this.videoElement.play();
        } catch (playErr) {
          console.warn('Camera autoplay blocked:', playErr.message);
        }
        this._cameraWarningShown = false;
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Camera permission denied or camera not found:', err.message);
      // Fallback: gradient cyber backdrop
      if (this.videoElement) {
        this.videoElement.style.background = 'radial-gradient(circle at center, #0f2038 0%, #050a14 100%)';
      }
      return false;
    }
  }

  stopCameraStream() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Initialize Three.js 3D Scene and Directional Guidance Arrow
   */
  initThreeJS() {
    if (!this.canvasElement) return;
    if (typeof THREE === 'undefined') {
      console.warn('Three.js failed to load — 3D guidance arrow unavailable.');
      return;
    }

    // Reuse the existing WebGL context when re-entering the AR view
    if (this.renderer) {
      this.handleResize();
      this.startRenderLoop();
      return;
    }

    const width = this.canvasElement.clientWidth || window.innerWidth;
    const height = this.canvasElement.clientHeight || (window.innerHeight - 70);

    // Three.js Scene
    this.scene = new THREE.Scene();

    // Camera with field of view matching mobile lenses
    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 5);

    // Renderer with transparency to overlay cleanly over camera video
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasElement,
      alpha: true,
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00e5ff, 1.2);
    dirLight.position.set(0, 5, 5);
    this.scene.add(dirLight);

    // Create 3D Holographic Directional Arrow Mesh
    this.arrowGroup = this.createDirectionalArrowMesh();
    this.scene.add(this.arrowGroup);

    // WebXR capability check
    this.checkWebXRSupport();

    // Register the resize handler once
    if (!this._resizeBound) {
      window.addEventListener('resize', () => this.handleResize());
      this._resizeBound = true;
    }

    this.startRenderLoop();
  }

  startRenderLoop() {
    if (this.animationFrameId || !this.renderer) return;

    const animate = () => {
      if (!this.isARActive) {
        this.animationFrameId = null;
        return;
      }
      this.animationFrameId = requestAnimationFrame(animate);

      // Smooth floating animation
      const time = Date.now() * 0.003;
      if (this.arrowGroup) {
        this.arrowGroup.position.y = -0.5 + Math.sin(time) * 0.12;

        // Calculate heading difference: Target Bearing minus Device Compass Heading
        const relativeAngle = ((this.targetBearing - this.currentCompassHeading + 360) % 360) * (Math.PI / 180);

        // Smoothly rotate arrow to face actual destination
        this.arrowGroup.rotation.z = -relativeAngle;
      }

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  /**
   * Create Futuristic 3D Cyber Arrow with Stem, Head, and Neon Rings
   */
  createDirectionalArrowMesh() {
    const group = new THREE.Group();

    // Arrow Material (Electric Cyan Glow)
    const arrowMaterial = new THREE.MeshPhongMaterial({
      color: 0x00e5ff,
      emissive: 0x007799,
      specular: 0xffffff,
      shininess: 60,
      transparent: true,
      opacity: 0.95
    });

    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x1e3a8a,
      roughness: 0.3,
      metalness: 0.8
    });

    // Arrow Shaft (Cylinder)
    const shaftGeometry = new THREE.CylinderGeometry(0.12, 0.12, 1.6, 32);
    const shaft = new THREE.Mesh(shaftGeometry, arrowMaterial);
    shaft.position.y = -0.3;
    group.add(shaft);

    // Arrow Head (Cone)
    const headGeometry = new THREE.ConeGeometry(0.48, 0.9, 32);
    const head = new THREE.Mesh(headGeometry, arrowMaterial);
    head.position.y = 0.85;
    group.add(head);

    // Holographic Pulse Rings around shaft
    const ringGeo = new THREE.TorusGeometry(0.35, 0.03, 16, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = -0.2;
    group.add(ring1);

    const ring2 = new THREE.Mesh(ringGeo, ringMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.3;
    ring2.scale.set(0.8, 0.8, 0.8);
    group.add(ring2);

    group.position.set(0, -0.5, 0);
    return group;
  }

  /**
   * Check WebXR API support where supported
   */
  async checkWebXRSupport() {
    const webxrBadge = document.getElementById('ar-webxr-status');
    if ('xr' in navigator && navigator.xr.isSessionSupported) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        if (supported && webxrBadge) {
          webxrBadge.innerHTML = '<span style="color: #10b981;">●</span> WebXR Ready';
        }
      } catch (e) {
        // Standard WebAR fallback active
      }
    }
  }

  /**
   * Request device orientation for real compass heading
   */
  initOrientationTracking() {
    // iOS 13+ requires explicit permission request via user action
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(response => {
          if (response === 'granted') {
            this.bindOrientationListeners();
          }
        })
        .catch(console.warn);
    } else {
      this.bindOrientationListeners();
    }
  }

  bindOrientationListeners() {
    if (this._orientationBound) return;
    this._orientationBound = true;

    // iOS Safari compass heading
    window.addEventListener('deviceorientation', (event) => {
      let heading = 0;
      if (event.webkitCompassHeading !== undefined) {
        // iOS provides exact compass heading (0 = North)
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        // Android / desktop fallback
        heading = (360 - event.alpha) % 360;
      }

      this.currentCompassHeading = Math.round(heading);
      this.deviceAlpha = event.alpha;

      // Update compass tape
      this.updateCompassTape(this.currentCompassHeading);
    }, true);
  }

  updateCompassTape(deg) {
    const degEl = document.getElementById('ar-compass-deg');
    const cardEl = document.getElementById('ar-compass-cardinal');
    if (degEl) degEl.innerText = `${deg}°`;
    if (cardEl) {
      const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const index = Math.round((deg / 45)) % 8;
      cardEl.innerText = cardinals[index];
    }
  }

  /**
   * Camera-based Visual Landmark Tracking (No QR codes)
   * Analyzes camera frames to recognize campus architectural signatures.
   */
  startVisualLandmarkTracking() {
    if (this.visualTrackerInterval) clearInterval(this.visualTrackerInterval);

    this.visualTrackerInterval = setInterval(() => {
      if (!this.isARActive || !this.videoElement || this.videoElement.readyState !== 4) return;

      this.analyzeCameraFrame();
    }, 600); // Sample twice a second for performance
  }

  analyzeCameraFrame() {
    const w = 160;
    const h = 120;
    this.analyzerCanvas.width = w;
    this.analyzerCanvas.height = h;

    try {
      this.analyzerCtx.drawImage(this.videoElement, 0, 0, w, h);
      const frameData = this.analyzerCtx.getImageData(0, 0, w, h);
      const data = frameData.data;

      // Compute average color and edge contrast
      let rSum = 0, gSum = 0, bSum = 0;
      const count = data.length / 4;
      for (let i = 0; i < data.length; i += 16) { // Stride of 4 pixels for fast mobile processing
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
      }
      const avgR = rSum / (count / 4);
      const avgG = gSum / (count / 4);
      const avgB = bSum / (count / 4);

      // Check proximity to registered landmark color/feature profiles
      let matchedLandmark = null;
      let highestSimilarity = 0;

      for (const lm of this.campusLandmarks) {
        const colorDiff = Math.sqrt(
          Math.pow(avgR - lm.colorSignature[0], 2) +
          Math.pow(avgG - lm.colorSignature[1], 2) +
          Math.pow(avgB - lm.colorSignature[2], 2)
        );
        const similarity = Math.max(0, 1 - (colorDiff / 255));

        if (similarity > highestSimilarity && similarity >= lm.threshold) {
          highestSimilarity = similarity;
          matchedLandmark = lm;
        }
      }

      this.handleLandmarkResult(matchedLandmark, highestSimilarity);
    } catch (e) {
      // Cross-origin or frame not ready
    }
  }

  handleLandmarkResult(landmark, confidence) {
    const reticle = document.getElementById('ar-reticle');
    const confFill = document.getElementById('ar-confidence-fill');
    const confText = document.getElementById('ar-confidence-text');
    const statusPill = document.getElementById('ar-tracking-status-pill');

    if (landmark) {
      this.isTrackingLocked = true;
      this.recognizedLandmark = landmark;
      this.trackingConfidence = Math.min(0.98, Math.max(0.75, confidence));

      if (reticle) reticle.classList.add('tracking-locked');
      if (confFill) {
        confFill.style.width = `${Math.round(this.trackingConfidence * 100)}%`;
        confFill.style.background = 'linear-gradient(90deg, #10b981 0%, #00e5ff 100%)';
      }
      if (confText) confText.innerText = `${Math.round(this.trackingConfidence * 100)}% Locked: ${landmark.name}`;
      if (statusPill) {
        statusPill.innerHTML = '<span class="pulse-dot"></span> Landmark Locked';
        statusPill.style.borderColor = '#10b981';
      }
    } else {
      // Tracking lost or scanning
      this.isTrackingLocked = false;
      this.recognizedLandmark = null;
      this.trackingConfidence = 0.65;

      if (reticle) reticle.classList.remove('tracking-locked');
      if (confFill) {
        confFill.style.width = '65%';
        confFill.style.background = 'var(--blue-gradient)';
      }
      if (confText) confText.innerText = 'Visual Tracking: Active (GPS Guided)';
      if (statusPill) {
        statusPill.innerHTML = '<span class="pulse-dot" style="background: #38bdf8;"></span> GPS Guided';
        statusPill.style.borderColor = 'var(--border-glass)';
      }
    }
  }

  /**
   * Handle real-time GPS update
   */
  handleGPSUpdate(pos) {
    if (!this.isARActive || !this.activeDestination) return;

    // Point the arrow at the next unvisited waypoint on the corridor graph
    let targetLat = this.activeDestination.latitude;
    let targetLon = this.activeDestination.longitude;

    const coordinator = window.navigationCoordinator;
    const nextIndex = coordinator && Number.isInteger(coordinator.nextWaypointIndex)
      ? coordinator.nextWaypointIndex
      : 1;

    if (this.activeRoute && this.activeRoute.waypoints && this.activeRoute.waypoints[nextIndex]) {
      const nextWp = this.activeRoute.waypoints[nextIndex];
      targetLat = nextWp.latitude;
      targetLon = nextWp.longitude;
    }

    this.targetBearing = GPSEngine.calculateBearing(pos.latitude, pos.longitude, targetLat, targetLon);

    const dist = GPSEngine.haversineDistance(pos.latitude, pos.longitude, this.activeDestination.latitude, this.activeDestination.longitude);

    // Update AR HUD
    const distValEl = document.getElementById('ar-hud-dist-val');
    if (distValEl) distValEl.innerText = `${dist} m`;

    this.checkArrival(dist);
  }

  getCurrentGPS() {
    return window.gpsEngine?.currentPosition
      || (window.app && window.app.userGpsCoords)
      || null;
  }

  /**
   * Arrival check (5 m radius) — guarded so the modal fires once per session
   */
  checkArrival(distanceMeters) {
    if (distanceMeters <= 5.0 && !this.hasArrived && this.activeDestination) {
      this.hasArrived = true;
      if (window.app && typeof window.app.showArrivalModal === 'function') {
        window.app.showArrivalModal(this.activeDestination);
      }
    }
  }

  updateARHUD() {
    if (!this.activeDestination) return;

    const titleEl = document.getElementById('ar-hud-dest-title');
    const subEl = document.getElementById('ar-hud-dest-sub');
    const maneuverTitle = document.getElementById('ar-hud-maneuver-title');
    const maneuverSub = document.getElementById('ar-hud-maneuver-sub');
    const distValEl = document.getElementById('ar-hud-dist-val');

    if (titleEl) titleEl.innerText = this.activeDestination.name;
    if (subEl) subEl.innerText = `GPS: ${Number(this.activeDestination.latitude).toFixed(6)}, ${Number(this.activeDestination.longitude).toFixed(6)} • ${this.activeDestination.building}`;

    // Compute initial distance and bearing immediately from current location
    const pos = this.getCurrentGPS();
    let dist = this.activeRoute ? Number(this.activeRoute.totalDistance) : null;
    if (pos) {
      dist = GPSEngine.haversineDistance(pos.latitude, pos.longitude, this.activeDestination.latitude, this.activeDestination.longitude);
      this.targetBearing = GPSEngine.calculateBearing(pos.latitude, pos.longitude, this.activeDestination.latitude, this.activeDestination.longitude);
      this.checkArrival(dist);
    }
    if (distValEl) {
      distValEl.innerText = Number.isFinite(dist) ? `${Math.round(dist * 10) / 10} m` : '— m';
    }

    if (this.activeRoute && this.activeRoute.instructions && this.activeRoute.instructions.length > 0) {
      const coordinator = window.navigationCoordinator;
      const stepIndex = coordinator && Number.isInteger(coordinator.currentStepIndex)
        ? coordinator.currentStepIndex
        : 0;
      const step = this.activeRoute.instructions[stepIndex] || this.activeRoute.instructions[0];
      if (maneuverTitle) maneuverTitle.innerText = step.maneuver || 'Head towards destination';
      if (maneuverSub) maneuverSub.innerText = step.instruction || 'Follow 3D guidance arrow';
    } else {
      if (maneuverTitle) maneuverTitle.innerText = 'Calculating route…';
      if (maneuverSub) maneuverSub.innerText = 'Hold your phone forward';
    }
  }

  handleResize() {
    if (!this.renderer || !this.canvasElement) return;
    const w = this.canvasElement.clientWidth || window.innerWidth;
    const h = this.canvasElement.clientHeight || (window.innerHeight - 70);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Stop Live AR session and release camera hardware
   */
  stopAR() {
    this.isARActive = false;
    this._cameraRequestId = (this._cameraRequestId || 0) + 1;
    if (this._gpsUnsubscribe) {
      this._gpsUnsubscribe();
      this._gpsUnsubscribe = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.visualTrackerInterval) {
      clearInterval(this.visualTrackerInterval);
      this.visualTrackerInterval = null;
    }
    this.stopCameraStream();
  }
}

window.liveAREngine = new LiveAREngine();
