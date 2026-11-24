/**
 * Admin Authentication Controller
 * Handles administrator login, bcrypt verification, JWT token issuance,
 * and profile retrieval.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const { JWT_SECRET } = require('../middleware/auth');
const { isDbConnected, memoryStore } = require('../config/database');

// POST /api/admin/login
exports.adminLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    let adminRecord = null;

    if (isDbConnected()) {
      adminRecord = await Admin.findOne({ username: cleanUsername });
    } else {
      adminRecord = memoryStore.admins.find(a => a.username === cleanUsername);
    }

    // Fallback if seeder hasn't run yet or admin missing
    if (!adminRecord && cleanUsername === (process.env.ADMIN_USERNAME || 'admin').toLowerCase()) {
      const defaultPassword = process.env.ADMIN_PASSWORD || 'admincampus2026';
      if (password === defaultPassword) {
        const token = jwt.sign(
          { id: 'admin_default', username: cleanUsername, role: 'superadmin' },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        return res.status(200).json({
          success: true,
          message: 'Admin authenticated successfully',
          token,
          admin: {
            username: cleanUsername,
            role: 'superadmin'
          }
        });
      }
    }

    if (!adminRecord) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials.'
      });
    }

    const isMatch = await bcrypt.compare(password, adminRecord.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials.'
      });
    }

    // Update lastLogin if in MongoDB
    if (isDbConnected() && adminRecord.save) {
      adminRecord.lastLogin = new Date();
      await adminRecord.save();
    }

    const token = jwt.sign(
      { id: adminRecord._id, username: adminRecord.username, role: adminRecord.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Admin authenticated successfully',
      token,
      admin: {
        id: adminRecord._id,
        username: adminRecord.username,
        role: adminRecord.role,
        lastLogin: adminRecord.lastLogin
      }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/profile
exports.getAdminProfile = async (req, res, next) => {
  try {
    const { id, username, role } = req.admin;

    return res.status(200).json({
      success: true,
      data: {
        id,
        username,
        role,
        systemVersion: '1.0.0-PROD',
        campusBlock: 'Campus AR Navigation Center'
      }
    });
  } catch (err) {
    next(err);
  }
};
