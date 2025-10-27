const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const { authenticateToken, requireAdmin, requireDatabase } = require('../server');

// Get all users for admin
router.get('/users', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { role, team_id, search } = req.query;
    
    let matchStage = {};
    
    // Apply filters if provided
    if (role && role !== '') {
      matchStage.role = role;
    }
    if (team_id && team_id !== '') {
      matchStage.team_id = parseInt(team_id);
    }
    if (search && search !== '') {
      matchStage.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const db = req.app.locals.db;
    const users = await db.collection('users').aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'teams',
          localField: 'team_id',
          foreignField: 'team_id',
          as: 'team_info'
        }
      },
      {
        $unwind: { path: '$team_info', preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          password: 0
        }
      },
      { $sort: { created_at: -1 } }
    ]).toArray();
    
    res.json({ success: true, users });
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get admin tickets with filtering
router.get('/tickets', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { status, priority, issue_type } = req.query;
    
    let matchStage = {};
    
    // Apply filters if provided
    if (status && status !== '') {
      matchStage.status = status;
    }
    if (priority && priority !== '') {
      matchStage.priority = priority;
    }
    if (issue_type && issue_type !== '') {
      matchStage.issue_type = issue_type;
    }
    
    const db = req.app.locals.db;
    const tickets = await db.collection('tickets').aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: 'user_id',
          as: 'user_info'
        }
      },
      {
        $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true }
      },
      {
        $lookup: {
          from: 'teams',
          localField: 'team_id',
          foreignField: 'team_id',
          as: 'team_info'
        }
      },
      {
        $unwind: { path: '$team_info', preserveNullAndEmptyArrays: true }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assigned_to',
          foreignField: 'user_id',
          as: 'assigned_info'
        }
      },
      {
        $unwind: { path: '$assigned_info', preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          ticket_id: 1,
          user_id: 1,
          issue_type: 1,
          description: 1,
          priority: 1,
          status: 1,
          team_id: 1,
          assigned_to: 1,
          attachment: 1,
          in_queue: 1,
          queue_position: 1,
          ai_confidence: 1,
          estimated_wait_days: 1,
          assigned_at: 1,
          created_at: 1,
          updated_at: 1,
          user_name: '$user_info.name',
          user_email: '$user_info.email',
          team_name: '$team_info.team_name',
          assigned_to_name: '$assigned_info.name'
        }
      },
      { $sort: { created_at: -1 } }
    ]).toArray();
    
    res.json({
      success: true,
      tickets: tickets,
    });
  } catch (error) {
    console.error('Admin tickets error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;