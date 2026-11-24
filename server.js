/**
 * CAMPUS AR NAVIGATION
 * Backend Server Entry Point (Node.js & Express.js)
 */

require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');

const { connectDB } = require('./config/database');
const { seedDatabase } = require('./seed/locations');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route Handlers
const locationRoutes = require('./routes/locationRoutes');
const routeRoutes = require('./routes/routeRoutes');
const navigationRoutes = require('./routes/navigationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const navigationController = require('./controllers/navigationController');

const app = express();
const server = http.createServer(app);

// Socket.IO for real-time location telemetry & admin live tracking
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Configure Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Frontend Static Assets
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// API Health Check
app.get('/api/health', (req, res) => {
  const address = server.address();
  res.status(200).json({
    status: 'ONLINE',
    project: 'CAMPUS AR NAVIGATION',
    tagline: 'Explore Your Campus. Navigate Smarter.',
    port: address && typeof address === 'object' ? address.port : null,
    timestamp: new Date().toISOString()
  });
});

// REST API Endpoints
app.use('/api/locations', locationRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/navigation', navigationRoutes);
app.get('/api/dashboard', navigationController.getDashboardStats); // Exact requirement endpoint
app.use('/api/admin', adminRoutes);

// Real-time Socket.IO Communication
io.on('connection', (socket) => {
  console.log(`🔌 [Socket.IO] Client connected: ${socket.id}`);

  // Broadcast user location update to admin monitoring
  socket.on('nav:location_update', (data) => {
    socket.broadcast.emit('admin:user_tracked', {
      socketId: socket.id,
      timestamp: Date.now(),
      ...data
    });
  });

  socket.on('nav:destination_reached', (data) => {
    socket.broadcast.emit('admin:arrival_alert', {
      socketId: socket.id,
      timestamp: Date.now(),
      ...data
    });
  });

  socket.on('disconnect', () => {
    socket.broadcast.emit('admin:user_disconnected', { socketId: socket.id });
  });
});

// Catch-all route to serve Single Page Application
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Central Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

// Server Activation & DB Initialization
const DEFAULT_PORT = Number(process.env.PORT) || 5001;
const MAX_PORT_ATTEMPTS = 20;

// Resolve to the first free port; listen errors (EADDRINUSE) are retried in place
// on the same http.Server instance so no duplicate server processes are spawned.
function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port);
  });
}

async function listenOnAvailablePort(startPort) {
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset++) {
    const candidate = startPort + offset;
    try {
      return await listenOnPort(candidate);
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      console.warn(`⚠️ Port ${candidate} is already in use — trying ${candidate + 1}...`);
    }
  }
  throw new Error(
    `No available port found between ${startPort} and ${startPort + MAX_PORT_ATTEMPTS - 1}.`
  );
}

let isStarting = false;

async function startServer() {
  if (isStarting) return;
  isStarting = true;

  try {
    // Attempt database connection (MongoDB Atlas)
    await connectDB();

    // Automatically seed locations, routes, and admin user
    await seedDatabase();

    const activePort = await listenOnAvailablePort(DEFAULT_PORT);
    const origin = `http://localhost:${activePort}`;

    console.log('====================================================');
    console.log(`🚀 CAMPUS AR NAVIGATION Server running on port ${activePort}`);
    console.log(`🌐 Local Web Interface: ${origin}`);
    console.log(`📡 API Endpoints active at: ${origin}/api/`);
    console.log('====================================================');
  } catch (error) {
    console.error('Fatal initialization error:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app, server };
