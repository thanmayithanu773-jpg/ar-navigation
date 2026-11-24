const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Location name is required'],
    trim: true,
    unique: true
  },
  latitude: {
    type: Number,
    required: [true, 'Latitude is required'],
    min: -90,
    max: 90
  },
  longitude: {
    type: Number,
    required: [true, 'Longitude is required'],
    min: -180,
    max: 180
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    enum: [
      'Academic',
      'Administrative',
      'Restroom',
      'Auditorium',
      'Faculty',
      'Resource Center',
      'Facility',
      'Corridor Junction'
    ],
    default: 'Academic'
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  building: {
    type: String,
    trim: true,
    default: 'Main Academic Block'
  },
  floor: {
    type: String,
    trim: true,
    default: 'Ground Floor'
  },
  status: {
    type: String,
    enum: ['active', 'maintenance', 'closed'],
    default: 'active'
  },
  landmarkFeatures: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Location', locationSchema);
