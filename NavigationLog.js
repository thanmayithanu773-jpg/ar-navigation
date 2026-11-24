const mongoose = require('mongoose');

const navigationLogSchema = new mongoose.Schema({
  destination: {
    type: String,
    required: [true, 'Destination name is required'],
    trim: true
  },
  destinationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location'
  },
  navigationMode: {
    type: String,
    required: [true, 'Navigation mode is required'],
    enum: ['gps', 'ar', 'indoor', 'combined'],
    default: 'gps'
  },
  status: {
    type: String,
    enum: ['started', 'reached', 'cancelled'],
    default: 'started'
  },
  userCoordinates: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },
  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('NavigationLog', navigationLogSchema);
