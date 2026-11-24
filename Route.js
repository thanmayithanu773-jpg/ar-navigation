const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  startLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: [true, 'Start location reference is required']
  },
  endLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: [true, 'End location reference is required']
  },
  distance: {
    type: Number,
    required: [true, 'Distance in meters is required'],
    min: 0
  },
  direction: {
    type: String,
    required: [true, 'Directional instruction is required'],
    trim: true
  },
  connectedPathways: {
    type: [String],
    default: []
  },
  isIndoor: {
    type: Boolean,
    default: true
  },
  accessible: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Route', routeSchema);
