const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  ticket_id: {
    type: Number,
    unique: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  issue_type: {
    type: String,
    required: true,
    enum: ['Hardware', 'Software', 'Network', 'Security', 'Account', 'Other']
  },
  description: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Queued', 'Closed'],
    default: 'Open'
  },
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  team_id: {
    type: Number,
    default: null
  },
  solution: {
    type: String,
    default: ''
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  resolved_at: {
    type: Date,
    default: null
  }
});

// Auto-increment ticket_id
ticketSchema.pre('save', async function(next) {
  if (this.isNew) {
    const lastTicket = await this.constructor.findOne().sort({ ticket_id: -1 });
    this.ticket_id = lastTicket ? lastTicket.ticket_id + 1 : 1000;
  }
  next();
});

module.exports = mongoose.model('Ticket', ticketSchema);