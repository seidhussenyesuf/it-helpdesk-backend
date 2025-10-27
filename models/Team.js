const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  team_id: {
    type: Number,
    required: true,
    unique: true
  },
  team_name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  senior_officers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Team', teamSchema);