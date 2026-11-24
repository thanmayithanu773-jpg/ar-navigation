/**
 * Database Configuration & Hybrid Storage Layer
 * Connects to MongoDB Atlas via Mongoose, with automatic fallback
 * to persistent local memory-store if MongoDB Atlas URI is pending.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const dns = require('dns');

// Configure reliable DNS resolvers for MongoDB Atlas SRV lookups on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (dnsErr) {
  // Use system default DNS if setServers is restricted
}

let isConnected = false;

// Fallback JSON persistence file
const LOCAL_STORAGE_FILE = path.join(__dirname, '../data_storage.json');

// In-memory fallback dataset
const memoryStore = {
  locations: [],
  routes: [],
  admins: [],
  navigationLogs: []
};

// Load local persistence if exists
function loadLocalStore() {
  try {
    if (fs.existsSync(LOCAL_STORAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_STORAGE_FILE, 'utf-8'));
      memoryStore.locations = data.locations || [];
      memoryStore.routes = data.routes || [];
      memoryStore.admins = data.admins || [];
      memoryStore.navigationLogs = data.navigationLogs || [];
      console.log('📦 Loaded existing local store data.');
    }
  } catch (err) {
    console.warn('⚠️ Could not load local store cache, using defaults:', err.message);
  }
}

function saveLocalStore() {
  try {
    fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(memoryStore, null, 2), 'utf-8');
  } catch (err) {
    console.warn('⚠️ Could not persist local store to disk:', err.message);
  }
}

/**
 * Connect to MongoDB Atlas
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_ar_navigation';
  console.log(`🔌 Attempting MongoDB connection: ${uri.replace(/\/\/.*@/, '//***:***@')}`);

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 4000 // Fast failover to local store if MongoDB is offline
    });
    isConnected = true;
    console.log(`✅ MongoDB Atlas connected successfully: ${conn.connection.host}`);
    return true;
  } catch (error) {
    isConnected = false;
    console.warn(`⚠️ MongoDB Atlas connection error: ${error.message}`);
    console.log('🔄 Switching to High-Performance Hybrid In-Memory Data Engine with JSON persistence.');
    loadLocalStore();
    return false;
  }
}

function isDbConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  isDbConnected,
  memoryStore,
  saveLocalStore
};
