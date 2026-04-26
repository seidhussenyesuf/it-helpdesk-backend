const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const natural = require('natural');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ticket_system';
const DB_NAME = process.env.DB_NAME || 'ticket_system';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here'
});

// MongoDB connection
let db;
let client;
let isDatabaseConnected = false;




// Updated MongoDB connection with better SSL handling
// Updated MongoDB connection with better SSL handling
async function connectToMongoDB() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    
    if (!MONGODB_URI || MONGODB_URI === 'mongodb://localhost:27017/ticket_system') {
      console.log('⚠️  Using default MongoDB URI. Make sure MongoDB is running locally.');
    }
    
    // **FIXED: Simplified connection options without hardcoded SSL/TLS**
    const connectionOptions = {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority'
      // **REMOVED: tls: true and tlsAllowInvalidCertificates: false**
    };
    
    client = new MongoClient(MONGODB_URI, connectionOptions);
    
    await client.connect();
    db = client.db(DB_NAME);
    isDatabaseConnected = true;
    
    console.log('✅ Connected to MongoDB successfully');
    await createIndexes();
    console.log('✅ Database indexes created');
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    isDatabaseConnected = false;
    
    console.log('\n💡 MongoDB Atlas Connection Troubleshooting:');
    console.log('1. Check your IP is whitelisted in MongoDB Atlas');
    console.log('2. Verify your username/password in the connection string');
    console.log('3. Make sure your cluster is running');
    console.log('4. Try using the mongodb+srv:// format');
    
    return false;
  }
}

// Add this function after your MongoDB connection setup
function getDB() {
  // If you're using MongoClient directly
  if (typeof client !== 'undefined' && client) {
    return client.db('ticket_system');
  }
  
  // If you're using mongoose
  if (typeof mongoose !== 'undefined' && mongoose.connection.db) {
    return mongoose.connection.db;
  }
  
  throw new Error('Database connection not available');
}

async function createIndexes() {
  try {
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('tickets').createIndex({ user_id: 1 });
    await db.collection('tickets').createIndex({ team_id: 1 });
    await db.collection('tickets').createIndex({ assigned_to: 1 });
    await db.collection('tickets').createIndex({ status: 1 });
    await db.collection('comments').createIndex({ ticket_id: 1 });
    await db.collection('ticket_logs').createIndex({ ticket_id: 1 });
    await db.collection('counters').createIndex({ _id: 1 });
    
    // ADD THESE FOR FAST DELETION
    await db.collection('comments').createIndex({ author_id: 1 });
    await db.collection('ticket_logs').createIndex({ changed_by: 1 });
    await db.collection('notifications').createIndex({ user_id: 1 });
    await db.collection('procurement_requests').createIndex({ requested_by: 1 });
    
    console.log('✅ Database indexes created');
  } catch (error) {
    console.error('Index creation error:', error.message);
  }
}

// Initialize database
async function initializeDatabase() {
  if (!isDatabaseConnected) {
    console.log('❌ Database not connected, skipping initialization');
    return false;
  }

  try {
    console.log('🔄 Initializing database...');
    
    // Check if collections exist and create them if they don't
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    const requiredCollections = ['users', 'teams', 'tickets', 'comments', 'ticket_logs', 'counters', 'procurement_requests', 'procurement_messages', 'notifications'];
    
    for (const collectionName of requiredCollections) {
      if (!collectionNames.includes(collectionName)) {
        await db.createCollection(collectionName);
        console.log(`✅ Created collection: ${collectionName}`);
      }
    }
    
    // Initialize counters
    const counters = await db.collection('counters').findOne({ _id: 'userId' });
    if (!counters) {
      await db.collection('counters').insertMany([
        { _id: 'userId', sequence_value: 1 },
        { _id: 'ticketId', sequence_value: 1 },
        { _id: 'teamId', sequence_value: 10 },
        { _id: 'commentId', sequence_value: 1 },
        { _id: 'logId', sequence_value: 1 },
        { _id: 'notificationId', sequence_value: 1 }
      ]);
      console.log('✅ Counters initialized');
    }
    
    // Initialize teams
    const teamsCount = await db.collection('teams').countDocuments();
    if (teamsCount === 0) {
      const teams = [
        { _id: 1, team_id: 1, team_name: 'Hardware Support Team', team_type: 'Hardware Support Team', created_at: new Date() },
        { _id: 2, team_id: 2, team_name: 'Software Support Team', team_type: 'Software Support Team', created_at: new Date() },
        { _id: 3, team_id: 3, team_name: 'Network Operations Team', team_type: 'Network Support Team', created_at: new Date() },
        { _id: 4, team_id: 4, team_name: 'Security Team', team_type: 'Security Support Team', created_at: new Date() },
        { _id: 5, team_id: 5, team_name: 'Account Management Team', team_type: 'Account Support Team', created_at: new Date() },
        { _id: 6, team_id: 6, team_name: 'Database Administration Team', team_type: 'Database Support Team', created_at: new Date() },
        { _id: 7, team_id: 7, team_name: 'Configuration Management Team', team_type: 'Configuration Support Team', created_at: new Date() },
        { _id: 8, team_id: 8, team_name: 'System Maintenance Team', team_type: 'Maintenance Support Team', created_at: new Date() },
        { _id: 9, team_id: 9, team_name: 'Other Issues Team', team_type: 'Other Support Team', created_at: new Date() }
      ];
      
      await db.collection('teams').insertMany(teams);
      console.log('✅ Default teams created');
    }
    
    // Initialize admin user
    const adminUser = await db.collection('users').findOne({ email: 'seidhussen0729@gmail.com' });
    if (!adminUser) {
      const hashedPassword = await bcrypt.hash('Seid2986@', 10);
      const userId = await getNextSequence('userId');
      const adminUserDoc = {
        _id: userId,
        user_id: userId,
        name: 'Seid Hussen',
        email: 'seidhussen0729@gmail.com',
        password: hashedPassword,
        role: 'admin',
        phone_number: '+251912345678',
        team_id: 1,
        assigned_tickets_count: 0,
        is_active: true,
        avatar_path: null,
        created_at: new Date()
      };
      
      await db.collection('users').insertOne(adminUserDoc);
      console.log('✅ Default admin user created: seidhussen0729@gmail.com / Seid2986@');
    }
    
    console.log('✅ Database initialization completed');
    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    return false;
  }
}







// Enhanced auto-increment sequence function
async function getNextSequence(sequenceName) {
  if (!isDatabaseConnected) {
    console.error('Database not connected for sequence');
    return Math.floor(Math.random() * 10000) + 1;
  }

  try {
    // First, check if counter exists
    const existingCounter = await db.collection('counters').findOne({ _id: sequenceName });
    
    if (!existingCounter) {
      // Initialize the counter if it doesn't exist
      await db.collection('counters').insertOne({
        _id: sequenceName,
        sequence_value: 1
      });
      return 1;
    }
    
    // Use findOneAndUpdate for atomic operation
    const result = await db.collection('counters').findOneAndUpdate(
      { _id: sequenceName },
      { $inc: { sequence_value: 1 } },
      { 
        returnDocument: 'after',
        upsert: true // This ensures it creates if doesn't exist
      }
    );
    
    if (result && result.value) {
      return result.value.sequence_value;
    } else {
      // Fallback: manually increment
      const current = await db.collection('counters').findOne({ _id: sequenceName });
      const newValue = (current?.sequence_value || 0) + 1;
      await db.collection('counters').updateOne(
        { _id: sequenceName },
        { $set: { sequence_value: newValue } },
        { upsert: true }
      );
      return newValue;
    }
  } catch (error) {
    console.error('Sequence error for', sequenceName, ':', error);
    // Emergency fallback - generate random ID
    return Math.floor(Math.random() * 100000) + 1000;
  }
}





// Database connection middleware
const requireDatabase = (req, res, next) => {
  if (!isDatabaseConnected) {
    return res.status(503).json({ 
      success: false, 
      message: 'Database not available. Please check MongoDB connection.' 
    });
  }
  next();
};

// ========== FIXED CORS CONFIGURATION ==========
// Clean CORS setup - remove all duplicate configurations
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Handle preflight requests
app.options('*', cors());

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Create assets directory if it doesn't exist
const assetsDir = path.join(__dirname, 'assets');
const avatarsDir = path.join(assetsDir, 'avatars');
const ticketUploadsDir = path.join(assetsDir, 'ticket_uploads');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}
if (!fs.existsSync(ticketUploadsDir)) {
  fs.mkdirSync(ticketUploadsDir, { recursive: true });
}





// Email configuration
const emailConfig = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || 'hussenseid670@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'bbxtzlnixdsnvyvj'
  }
};

const transporter = nodemailer.createTransport(emailConfig);

// Verify email configuration
transporter.verify((error) => {
  if (error) {
    console.error('❌ Email configuration error:', error);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

// Multer configuration for avatar uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, avatarsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Multer for ticket attachments
const ticketStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, ticketUploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'ticket-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const ticketUpload = multer({
  storage: ticketStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs are allowed'));
    }
  },
});

// JWT Authentication Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT verification error:', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Admin Authorization Middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// Senior Officer Authorization Middleware
const requireSeniorOrAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'senior') {
    return res.status(403).json({ success: false, message: 'Senior officer or admin access required' });
  }
  next();
};




// ========== NOTIFICATION FUNCTIONS ==========

// Create notification function
async function createNotification(notificationData) {
  if (!isDatabaseConnected) {
    console.log('❌ Database not connected for notification creation');
    return false;
  }

  try {
    const notificationId = await getNextSequence('notificationId');
    
    const notificationDoc = {
      _id: notificationId,
      notification_id: notificationId,
      user_id: notificationData.user_id,
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.type || 'system',
      related_ticket_id: notificationData.related_ticket_id || null,
      related_request_id: notificationData.related_request_id || null,
      read: false,
      created_at: new Date(),
      updated_at: new Date()
    };

    await db.collection('notifications').insertOne(notificationDoc);
    console.log(`✅ Notification created for user ${notificationData.user_id}: ${notificationData.title}`);
    return true;
  } catch (error) {
    console.error('❌ Create notification error:', error);
    return false;
  }
}

// Create multiple notifications for a team
async function createTeamNotifications(teamId, notificationData) {
  if (!isDatabaseConnected) {
    console.log('❌ Database not connected for team notifications');
    return false;
  }

  try {
    // Get all senior officers in the team
    const teamOfficers = await db.collection('users').find({
      team_id: teamId,
      role: 'senior',
      is_active: true
    }).toArray();

    let createdCount = 0;
    for (const officer of teamOfficers) {
      const success = await createNotification({
        ...notificationData,
        user_id: officer.user_id
      });
      if (success) createdCount++;
    }

    console.log(`✅ Created ${createdCount} notifications for team ${teamId}`);
    return createdCount > 0;
  } catch (error) {
    console.error('❌ Create team notifications error:', error);
    return false;
  }
}

// ========== NOTIFICATION ROUTES ==========

// Get user notifications
app.get('/api/notifications', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { limit = 50, unread_only = false } = req.query;
    
    console.log(`🔔 Fetching notifications for user ${req.user.id}`);
    
    let query = { user_id: req.user.id };
    if (unread_only === 'true') {
      query.read = false;
    }
    
    const notifications = await db.collection('notifications')
      .find(query)
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .toArray();

    // Get unread count
    const unreadCount = await db.collection('notifications').countDocuments({
      user_id: req.user.id,
      read: false
    });

    console.log(`✅ Found ${notifications.length} notifications for user ${req.user.id} (${unreadCount} unread)`);
    
    res.json({
      success: true,
      notifications,
      unread_count: unreadCount
    });
  } catch (error) {
    console.error('❌ Get notifications error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch notifications: ' + error.message 
    });
  }
});

// Mark notification as read
app.put('/api/notifications/:notificationId/read', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    console.log(`📖 Marking notification ${notificationId} as read for user ${req.user.id}`);
    
    const result = await db.collection('notifications').updateOne(
      { 
        notification_id: parseInt(notificationId),
        user_id: req.user.id 
      },
      { 
        $set: { 
          read: true,
          updated_at: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found or access denied' 
      });
    }

    console.log(`✅ Notification ${notificationId} marked as read`);
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('❌ Mark notification as read error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark notification as read: ' + error.message 
    });
  }
});

// Mark all notifications as read
app.put('/api/notifications/read-all', authenticateToken, requireDatabase, async (req, res) => {
  try {
    console.log(`📖 Marking all notifications as read for user ${req.user.id}`);
    
    const result = await db.collection('notifications').updateMany(
      { 
        user_id: req.user.id,
        read: false
      },
      { 
        $set: { 
          read: true,
          updated_at: new Date()
        } 
      }
    );

    console.log(`✅ ${result.modifiedCount} notifications marked as read`);
    
    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
      marked_count: result.modifiedCount
    });
  } catch (error) {
    console.error('❌ Mark all notifications as read error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark notifications as read: ' + error.message 
    });
  }
});

// Delete notification
app.delete('/api/notifications/:notificationId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    console.log(`🗑️ Deleting notification ${notificationId} for user ${req.user.id}`);
    
    const result = await db.collection('notifications').deleteOne({
      notification_id: parseInt(notificationId),
      user_id: req.user.id
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found or access denied' 
      });
    }

    console.log(`✅ Notification ${notificationId} deleted`);
    
    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete notification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete notification: ' + error.message 
    });
  }
});

// Delete all notifications
app.delete('/api/notifications', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { read_only = false } = req.query;
    
    console.log(`🗑️ Deleting notifications for user ${req.user.id} (read_only: ${read_only})`);
    
    let query = { user_id: req.user.id };
    if (read_only === 'true') {
      query.read = true;
    }
    
    const result = await db.collection('notifications').deleteMany(query);

    console.log(`✅ ${result.deletedCount} notifications deleted`);
    
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} notifications`,
      deleted_count: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Delete notifications error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete notifications: ' + error.message 
    });
  }
});

// Get notification statistics
app.get('/api/notifications/stats', authenticateToken, requireDatabase, async (req, res) => {
  try {
    console.log(`📊 Getting notification stats for user ${req.user.id}`);
    
    const totalCount = await db.collection('notifications').countDocuments({
      user_id: req.user.id
    });
    
    const unreadCount = await db.collection('notifications').countDocuments({
      user_id: req.user.id,
      read: false
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCount = await db.collection('notifications').countDocuments({
      user_id: req.user.id,
      created_at: { $gte: today }
    });
    
    // Count by type
    const typeCounts = await db.collection('notifications').aggregate([
      { $match: { user_id: req.user.id } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]).toArray();

    console.log(`✅ Notification stats: ${totalCount} total, ${unreadCount} unread, ${todayCount} today`);
    
    res.json({
      success: true,
      stats: {
        total_count: totalCount,
        unread_count: unreadCount,
        today_count: todayCount,
        by_type: typeCounts
      }
    });
  } catch (error) {
    console.error('❌ Get notification stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch notification statistics: ' + error.message 
    });
  }
});









// ========== COMPREHENSIVE NOTIFICATION SYSTEM ==========

// Enhanced notification function with email
// Enhanced notification function with email for ALL events AND admin notification
async function createComprehensiveNotification(notificationData) {
  if (!isDatabaseConnected) {
    console.log('❌ Database not connected for notification creation');
    return false;
  }

  try {
    const notificationId = await getNextSequence('notificationId');
    
    const notificationDoc = {
      _id: notificationId,
      notification_id: notificationId,
      user_id: notificationData.user_id,
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.type || 'system',
      related_ticket_id: notificationData.related_ticket_id || null,
      related_request_id: notificationData.related_request_id || null,
      priority: notificationData.priority || 'medium',
      read: false,
      created_at: new Date(),
      updated_at: new Date()
    };

    await db.collection('notifications').insertOne(notificationDoc);
    console.log(`✅ Database notification created: ${notificationData.title} for user ${notificationData.user_id}`);

    // 🔥 SEND EMAIL TO USER
    try {
      await sendEmailNotification(notificationData.user_id, notificationData.title, notificationData.message);
      console.log(`📧 Email notification sent to user for: ${notificationData.title}`);
    } catch (emailError) {
      console.error('❌ User email notification failed (non-critical):', emailError.message);
    }

    // 🔥 SEND EMAIL TO ADMIN FOR ALL NOTIFICATIONS
    try {
      // Get user info for admin notification
      const user = await db.collection('users').findOne({ user_id: notificationData.user_id });
      
      await notifyAdmin(notificationData.title, notificationData.message, {
        ticketId: notificationData.related_ticket_id,
        userName: user ? user.name : 'Unknown',
        userEmail: user ? user.email : 'Unknown',
        action: notificationData.type
      });
      console.log(`📧 Admin notification sent for: ${notificationData.title}`);
    } catch (adminEmailError) {
      console.error('❌ Admin email notification failed (non-critical):', adminEmailError.message);
    }

    return true;
  } catch (error) {
    console.error('❌ Create notification error:', error);
    return false;
  }
}




// Fixed procurement message notification - NO axiosInstance
async function createProcurementMessageNotification(requestId, senderId, senderName, message) {
  try {
    console.log(`🔔 Creating procurement message notification for request: ${requestId}`);
    
    const request = await db.collection('procurement_requests').findOne({ _id: new ObjectId(requestId) });
    if (!request) {
      console.log('❌ Procurement request not found for notification');
      return;
    }

    const usersToNotify = new Set();

    // Notify the requester (if sender is not the requester)
    if (request.requested_by !== senderId) {
      usersToNotify.add(request.requested_by);
      console.log(`🔔 Will notify requester: ${request.requested_by}`);
    }

    // Notify assigned officer about procurement messages
    const ticket = await db.collection('tickets').findOne({ ticket_id: request.ticket_id });
    if (ticket && ticket.assigned_to && ticket.assigned_to !== senderId) {
      usersToNotify.add(ticket.assigned_to);
      console.log(`🔔 Will notify assigned officer: ${ticket.assigned_to}`);
    }

    // Notify all users who sent messages in this procurement request
    if (request.messages && request.messages.length > 0) {
      request.messages.forEach(msg => {
        if (msg.sender_id && msg.sender_id !== senderId) {
          usersToNotify.add(msg.sender_id);
          console.log(`🔔 Will notify message participant: ${msg.sender_id}`);
        }
      });
    }

    console.log(`🔔 Total users to notify: ${usersToNotify.size}`);

    // Create notifications for all relevant users
    for (const userId of usersToNotify) {
      const success = await createComprehensiveNotification({
        user_id: userId,
        title: '💬 Equipment Message',
        message: `${senderName} sent a message about "${request.item_name}": "${message.substring(0, 100)}..."`,
        type: 'procurement_message',
        related_ticket_id: request.ticket_id,
        related_request_id: requestId,
        priority: 'medium'
      });
      
      if (success) {
        console.log(`✅ Notification sent to user: ${userId}`);
      } else {
        console.log(`❌ Failed to send notification to user: ${userId}`);
      }
    }

    console.log(`✅ Procurement message notifications completed for request: ${requestId}`);

  } catch (error) {
    console.error('❌ Procurement message notification error:', error);
  }
}

// Fixed procurement notification - NO axiosInstance
async function createProcurementNotification(requestId, action, actionBy) {
  try {
    const request = await db.collection('procurement_requests').findOne({ _id: new ObjectId(requestId) });
    if (!request) return;

    const actionConfig = {
      'created': {
        title: '🛒 New Equipment Request',
        message: `New equipment request submitted for "${request.item_name}" in ticket #${request.ticket_id}`,
        priority: 'high'
      },
      'approved': {
        title: '✅ Equipment Approved',
        message: `Your equipment request for "${request.item_name}" has been approved by ${actionBy}`,
        priority: 'high'
      },
      'rejected': {
        title: '❌ Equipment Rejected',
        message: `Your equipment request for "${request.item_name}" has been rejected by ${actionBy}`,
        priority: 'high'
      },
      'ordered': {
        title: '📦 Equipment Ordered',
        message: `Your equipment request for "${request.item_name}" has been ordered`,
        priority: 'medium'
      },
      'delivered': {
        title: '🎁 Equipment Delivered',
        message: `Your equipment request for "${request.item_name}" has been delivered`,
        priority: 'medium'
      },
      'cancelled': {
        title: '🚫 Request Cancelled',
        message: `Your equipment request for "${request.item_name}" has been cancelled by ${actionBy}`,
        priority: 'high'
      }
    };

    const config = actionConfig[action];
    if (config) {
      // Notify the requester
      await createComprehensiveNotification({
        user_id: request.requested_by,
        title: config.title,
        message: config.message,
        type: 'procurement',
        related_ticket_id: request.ticket_id,
        related_request_id: requestId,
        priority: config.priority
      });

      // Notify all senior officers in the team about new procurement requests
      if (action === 'created') {
        const ticket = await db.collection('tickets').findOne({ ticket_id: request.ticket_id });
        if (ticket && ticket.team_id) {
          const teamOfficers = await db.collection('users').find({
            team_id: ticket.team_id,
            role: 'senior',
            is_active: true
          }).toArray();

          for (const officer of teamOfficers) {
            if (officer.user_id !== request.requested_by) {
              await createComprehensiveNotification({
                user_id: officer.user_id,
                title: '🛒 New Equipment Request',
                message: `New equipment request for "${request.item_name}" in ticket #${request.ticket_id}`,
                type: 'procurement',
                related_ticket_id: request.ticket_id,
                related_request_id: requestId,
                priority: 'medium'
              });
            }
          }
        }
      }

      // Notify assigned officer about procurement updates
      const ticket = await db.collection('tickets').findOne({ ticket_id: request.ticket_id });
      if (ticket && ticket.assigned_to && ticket.assigned_to !== request.requested_by) {
        await createComprehensiveNotification({
          user_id: ticket.assigned_to,
          title: config.title,
          message: `Equipment request for ticket #${request.ticket_id}: ${config.message}`,
          type: 'procurement',
          related_ticket_id: request.ticket_id,
          related_request_id: requestId,
          priority: 'medium'
        });
      }
    }
  } catch (error) {
    console.error('❌ Procurement notification error:', error);
  }
}
// Enhanced ticket status notification
async function createTicketStatusNotification(ticketId, newStatus, changedByName) {
  const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
  if (!ticket) return;

  const statusConfig = {
    'In Progress': {
      title: '🔄 Ticket In Progress',
      message: `Your ticket #${ticketId} is now being worked on by ${changedByName}.`,
      priority: 'medium'
    },
    'Resolved': {
      title: '✅ Ticket Resolved',
      message: `Your ticket #${ticketId} has been resolved by ${changedByName}. Please review and close if satisfied.`,
      priority: 'high'
    },
    'Closed': {
      title: '🔒 Ticket Closed',
      message: `Your ticket #${ticketId} has been closed by ${changedByName}.`,
      priority: 'medium'
    },
    'Queued': {
      title: '⏳ Ticket Queued',
      message: `Your ticket #${ticketId} has been placed in queue. Position: ${ticket.queue_position}. Estimated wait: ${ticket.estimated_wait_days} days.`,
      priority: 'low'
    },
    'Reopened': {
      title: '🔄 Ticket Reopened',
      message: `Your ticket #${ticketId} has been reopened by ${changedByName}.`,
      priority: 'medium'
    }
  };

  const config = statusConfig[newStatus];
  if (config) {
    await createComprehensiveNotification({
      user_id: ticket.user_id,
      title: config.title,
      message: config.message,
      type: 'ticket_status',
      related_ticket_id: ticketId,
      priority: config.priority
    });

    // Also notify assigned officer if status changed by someone else
    if (ticket.assigned_to && ticket.assigned_to !== ticket.user_id) {
      await createComprehensiveNotification({
        user_id: ticket.assigned_to,
        title: config.title,
        message: `Ticket #${ticketId} status changed to ${newStatus} by ${changedByName}.`,
        type: 'ticket_status',
        related_ticket_id: ticketId,
        priority: 'medium'
      });
    }
  }
}

// Enhanced comment notification
async function createCommentNotification(ticketId, commenterId, commenterName, commentText) {
  const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
  if (!ticket) return;

  const usersToNotify = new Set();

  // Always notify ticket owner (if commenter is not the owner)
  if (ticket.user_id !== commenterId) {
    usersToNotify.add(ticket.user_id);
  }

  // Notify assigned officer (if different from commenter and ticket owner)
  if (ticket.assigned_to && ticket.assigned_to !== commenterId) {
    usersToNotify.add(ticket.assigned_to);
  }

  // Notify all users who commented on this ticket (except current commenter)
  const commenters = await db.collection('comments').distinct('author_id', { 
    ticket_id: parseInt(ticketId),
    author_id: { $ne: commenterId }
  });
  
  commenters.forEach(commenterId => usersToNotify.add(commenterId));

  for (const userId of usersToNotify) {
    await createComprehensiveNotification({
      user_id: userId,
      title: '💬 New Comment',
      message: `${commenterName} commented on ticket #${ticketId}: "${commentText.substring(0, 100)}..."`,
      type: 'comment_added',
      related_ticket_id: ticketId,
      priority: 'medium'
    });
  }
}

// Enhanced procurement request notifications
async function createProcurementNotification(requestId, action, actionBy) {
  const request = await db.collection('procurement_requests').findOne({ _id: new ObjectId(requestId) });
  if (!request) return;

  const actionConfig = {
    'created': {
      title: '🛒 New Equipment Request',
      message: `New equipment request submitted for "${request.item_name}" in ticket #${request.ticket_id}`,
      priority: 'high'
    },
    'approved': {
      title: '✅ Equipment Approved',
      message: `Your equipment request for "${request.item_name}" has been approved by ${actionBy}`,
      priority: 'high'
    },
    'rejected': {
      title: '❌ Equipment Rejected',
      message: `Your equipment request for "${request.item_name}" has been rejected by ${actionBy}`,
      priority: 'high'
    },
    'ordered': {
      title: '📦 Equipment Ordered',
      message: `Your equipment request for "${request.item_name}" has been ordered`,
      priority: 'medium'
    },
    'delivered': {
      title: '🎁 Equipment Delivered',
      message: `Your equipment request for "${request.item_name}" has been delivered`,
      priority: 'medium'
    },
    'cancelled': {
      title: '🚫 Request Cancelled',
      message: `Your equipment request for "${request.item_name}" has been cancelled by ${actionBy}`,
      priority: 'high'
    }
  };

  const config = actionConfig[action];
  if (config) {
    // Notify the requester
    await createComprehensiveNotification({
      user_id: request.requested_by,
      title: config.title,
      message: config.message,
      type: 'procurement',
      related_ticket_id: request.ticket_id,
      related_request_id: requestId,
      priority: config.priority
    });

    // Notify all senior officers in the team about new procurement requests
    if (action === 'created') {
      const ticket = await db.collection('tickets').findOne({ ticket_id: request.ticket_id });
      if (ticket && ticket.team_id) {
        const teamOfficers = await db.collection('users').find({
          team_id: ticket.team_id,
          role: 'senior',
          is_active: true
        }).toArray();

        for (const officer of teamOfficers) {
          if (officer.user_id !== request.requested_by) {
            await createComprehensiveNotification({
              user_id: officer.user_id,
              title: '🛒 New Equipment Request',
              message: `New equipment request for "${request.item_name}" in ticket #${request.ticket_id}`,
              type: 'procurement',
              related_ticket_id: request.ticket_id,
              related_request_id: requestId,
              priority: 'medium'
            });
          }
        }
      }
    }

    // Notify assigned officer about procurement updates
    const ticket = await db.collection('tickets').findOne({ ticket_id: request.ticket_id });
    if (ticket && ticket.assigned_to && ticket.assigned_to !== request.requested_by) {
      await createComprehensiveNotification({
        user_id: ticket.assigned_to,
        title: config.title,
        message: `Equipment request for ticket #${request.ticket_id}: ${config.message}`,
        type: 'procurement',
        related_ticket_id: request.ticket_id,
        related_request_id: requestId,
        priority: 'medium'
      });
    }
  }
}

// Enhanced procurement message notification
async function createProcurementMessageNotification(requestId, senderId, senderName, message) {
  const request = await db.collection('procurement_requests').findOne({ _id: new ObjectId(requestId) });
  if (!request) return;

  const usersToNotify = new Set();

  // Notify the requester (if sender is not the requester)
  if (request.requested_by !== senderId) {
    usersToNotify.add(request.requested_by);
  }

  // Notify assigned officer about procurement messages
  const ticket = await db.collection('tickets').findOne({ ticket_id: request.ticket_id });
  if (ticket && ticket.assigned_to && ticket.assigned_to !== senderId) {
    usersToNotify.add(ticket.assigned_to);
  }

  // Notify all users who sent messages in this procurement request
  const messageSenders = await db.collection('procurement_requests').distinct('messages.sender_id', { 
    _id: new ObjectId(requestId) 
  });
  
  messageSenders.forEach(senderId => {
    if (senderId !== senderId) {
      usersToNotify.add(senderId);
    }
  });

  for (const userId of usersToNotify) {
    await createComprehensiveNotification({
      user_id: userId,
      title: '💬 Equipment Message',
      message: `${senderName} sent a message about "${request.item_name}": "${message.substring(0, 100)}..."`,
      type: 'procurement_message',
      related_ticket_id: request.ticket_id,
      related_request_id: requestId,
      priority: 'medium'
    });
  }
}

// System-wide notifications for important events
async function createSystemNotification(title, message, targetUsers = 'all') {
  let users = [];
  
  if (targetUsers === 'all') {
    users = await db.collection('users').find({ is_active: true }).toArray();
  } else if (targetUsers === 'seniors') {
    users = await db.collection('users').find({ role: 'senior', is_active: true }).toArray();
  } else if (targetUsers === 'admins') {
    users = await db.collection('users').find({ role: 'admin', is_active: true }).toArray();
  }

  for (const user of users) {
    await createComprehensiveNotification({
      user_id: user.user_id,
      title: `⚙️ ${title}`,
      message: message,
      type: 'system',
      priority: 'high'
    });
  }
}





// ========== PROCUREMENT ROUTES ==========

// Get procurement requests for a ticket
app.get('/api/tickets/:ticketId/procurement-requests', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    console.log(`📦 Fetching procurement requests for ticket ${ticketId}`);

    const requests = await db.collection('procurement_requests')
      .find({ ticket_id: ticketId.toString() })
      .sort({ created_at: -1 })
      .toArray();

    console.log(`✅ Found ${requests.length} procurement requests`);
    
    res.json({
      success: true,
      requests: requests
    });
  } catch (error) {
    console.error('❌ Fetch procurement requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch procurement requests: ' + error.message 
    });
  }
});

// Get single procurement request
app.get('/api/procurement-requests/:requestId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { requestId } = req.params;
    console.log(`📦 Fetching procurement request: ${requestId}`);

    const request = await db.collection('procurement_requests').findOne({ 
      _id: new ObjectId(requestId) 
    });

    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: 'Procurement request not found' 
      });
    }

    res.json({
      success: true,
      request: request
    });
  } catch (error) {
    console.error('❌ Fetch procurement request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch procurement request: ' + error.message 
    });
  }
});

// Update procurement request status
app.put('/api/procurement-requests/:requestId/status', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, admin_notes } = req.body;

    console.log('🔄 Updating procurement request status:', requestId, 'to:', status);

    // First get the current request to know who requested it
    const currentRequest = await db.collection('procurement_requests').findOne({
      _id: new ObjectId(requestId)
    });

    if (!currentRequest) {
      return res.status(404).json({
        success: false,
        message: 'Procurement request not found'
      });
    }

    const updateData = {
      status: status,
      updated_at: new Date()
    };

    if (admin_notes) {
      updateData.admin_notes = admin_notes;
    }

    const result = await db.collection('procurement_requests').updateOne(
      { _id: new ObjectId(requestId) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Procurement request not found'
      });
    }

    console.log('✅ Procurement request status updated');

    // Create notification for status change
    await createProcurementNotification(requestId, status, req.user.name);

    res.json({
      success: true,
      message: 'Procurement request status updated successfully'
    });

  } catch (error) {
    console.error('❌ Update procurement status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update procurement request status: ' + error.message
    });
  }
});






// ========== ANNOUNCEMENTS ROUTES ==========

// Get all announcements
app.get('/api/announcements', authenticateToken, requireDatabase, async (req, res) => {
  try {
    console.log('📢 Fetching announcements');
    
    const announcements = await db.collection('announcements')
      .find({})
      .sort({ created_at: -1 })
      .toArray();

    console.log(`✅ Found ${announcements.length} announcements`);
    
    res.json({
      success: true,
      announcements: announcements
    });
  } catch (error) {
    console.error('❌ Get announcements error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch announcements: ' + error.message 
    });
  }
});

// Create new announcement (Admin only)
app.post('/api/announcements', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { title, content, priority } = req.body;
    
    console.log('📢 Creating new announcement:', { title, priority });
    
    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and content are required' 
      });
    }

    const announcement = {
      title,
      content,
      priority: priority || 'medium',
      created_by: req.user.id,
      created_by_name: req.user.name,
      created_at: new Date(),
      updated_at: new Date()
    };

    await db.collection('announcements').insertOne(announcement);
    
    console.log('✅ Announcement created successfully');
    
    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      announcement: announcement
    });
  } catch (error) {
    console.error('❌ Create announcement error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create announcement: ' + error.message 
    });
  }
});

// Update announcement (Admin only)
app.put('/api/announcements/:id', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, priority } = req.body;
    
    console.log('📢 Updating announcement:', id);
    
    const result = await db.collection('announcements').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          title,
          content,
          priority,
          updated_at: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Announcement not found' 
      });
    }

    console.log('✅ Announcement updated successfully');
    
    res.json({
      success: true,
      message: 'Announcement updated successfully'
    });
  } catch (error) {
    console.error('❌ Update announcement error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update announcement: ' + error.message 
    });
  }
});

// Delete announcement (Admin only)
app.delete('/api/announcements/:id', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📢 Deleting announcement:', id);
    
    const result = await db.collection('announcements').deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Announcement not found' 
      });
    }

    console.log('✅ Announcement deleted successfully');
    
    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete announcement error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete announcement: ' + error.message 
    });
  }
});





// User backup their own data
app.post('/api/user/backup-my-data', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await db.collection('users').findOne({ user_id: userId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const userTickets = await db.collection('tickets').find({ user_id: userId }).toArray();
    const userComments = await db.collection('comments').find({ author_id: userId }).toArray();
    const userLogs = await db.collection('ticket_logs').find({ changed_by: userId }).toArray();
    const userNotifications = await db.collection('notifications').find({ user_id: userId }).toArray();
    
    const backupDoc = {
      user_id: userId,
      user_data: { ...user },
      tickets: userTickets,
      comments: userComments,
      logs: userLogs,
      notifications: userNotifications,
      created_by: userId,
      created_at: new Date(),
      backup_type: 'manual_user_backup',
      restored: false
    };
    
    const result = await db.collection('user_backups').insertOne(backupDoc);
    
    res.json({
      success: true,
      message: 'Your data has been backed up successfully!',
      backup_id: result.insertedId,
      summary: {
        tickets: userTickets.length,
        comments: userComments.length,
        logs: userLogs.length,
        notifications: userNotifications.length
      }
    });
  } catch (error) {
    console.error('User backup error:', error);
    res.status(500).json({ success: false, message: 'Backup failed' });
  }
});



// ========== AI CLASSIFICATION FUNCTIONS ==========

// Enhanced ML training data
// ========== AI CLASSIFICATION - FULL ONLINE AI ==========

// Updated training data with MORE examples for better accuracy
const enhancedClassifier = new natural.BayesClassifier();

// Expanded training data
// ========== ENHANCED AI CLASSIFICATION - FULL ONLINE AI ==========

// Expanded training data with MORE hardware examples
// ========== ENHANCED AI CLASSIFICATION - BETTER MAINTENANCE VS HARDWARE ==========

// Expanded training data with CLEAR distinction between Maintenance and Hardware
const trainingData = [
  // ===== MAINTENANCE ISSUES (MUST COME FIRST for priority) =====
  ['system maintenance schedule downtime', 'Maintenance'],
  ['preventive maintenance hardware software', 'Maintenance'],
  ['server maintenance reboot required', 'Maintenance'],
  ['network maintenance upgrade planned', 'Maintenance'],
  ['storage maintenance cleanup required', 'Maintenance'],
  ['backup maintenance verification needed', 'Maintenance'],
  ['security maintenance patch management', 'Maintenance'],
  ['database maintenance optimization required', 'Maintenance'],
  ['application maintenance update deployment', 'Maintenance'],
  ['infrastructure maintenance upgrade', 'Maintenance'],
  ['scheduled maintenance window activities', 'Maintenance'],
  ['emergency maintenance urgent repair', 'Maintenance'],
  ['routine maintenance checklist tasks', 'Maintenance'],
  ['software maintenance license renewal', 'Maintenance'],
  ['system update patch installation', 'Maintenance'],
  ['security update patch deployment', 'Maintenance'],
  ['regular maintenance check schedule', 'Maintenance'],
  ['monthly maintenance routine', 'Maintenance'],
  ['weekly system maintenance', 'Maintenance'],
  ['quarterly maintenance review', 'Maintenance'],
  ['annual maintenance plan', 'Maintenance'],
  ['preventive check maintenance', 'Maintenance'],
  ['system health check maintenance', 'Maintenance'],
  ['server update maintenance window', 'Maintenance'],
  ['firmware update maintenance', 'Maintenance'],
  ['software patch update maintenance', 'Maintenance'],
  ['system upgrade maintenance plan', 'Maintenance'],
  ['hardware replacement maintenance', 'Maintenance'],
  ['equipment maintenance schedule', 'Maintenance'],
  ['facility maintenance routine', 'Maintenance'],
  ['it infrastructure maintenance', 'Maintenance'],
  ['regular software updates maintenance', 'Maintenance'],
  ['system cleanup maintenance', 'Maintenance'],
  ['log cleanup maintenance', 'Maintenance'],
  ['disk cleanup maintenance', 'Maintenance'],
  ['database cleanup maintenance', 'Maintenance'],
  ['cache clearing maintenance', 'Maintenance'],
  ['temp file cleanup maintenance', 'Maintenance'],
  ['system optimization maintenance', 'Maintenance'],
  ['performance tuning maintenance', 'Maintenance'],
  ['capacity planning maintenance', 'Maintenance'],
  ['resource allocation maintenance', 'Maintenance'],
  
  // ===== HARDWARE ISSUES (Physical device problems) =====
  ['computer slow performance lagging freezing', 'Hardware'],
  ['laptop battery not charging power issue', 'Hardware'],
  ['printer not printing paper jam error', 'Hardware'],
  ['monitor screen black no display', 'Hardware'],
  ['keyboard keys not working unresponsive', 'Hardware'],
  ['mouse cursor moving erratically', 'Hardware'],
  ['computer overheating fan noise loud', 'Hardware'],
  ['hard drive making clicking sounds', 'Hardware'],
  ['blue screen error crash restart', 'Hardware'],
  ['computer wont turn on no power', 'Hardware'],
  ['display flickering distorted graphics', 'Hardware'],
  ['usb port not working device unrecognized', 'Hardware'],
  ['speaker no sound audio issues', 'Hardware'],
  ['webcam not working camera failed', 'Hardware'],
  ['laptop screen cracked broken', 'Hardware'],
  ['ram memory failure upgrade', 'Hardware'],
  ['cpu processor overheating thermal', 'Hardware'],
  ['power supply failure replacement', 'Hardware'],
  ['motherboard issue boot failure', 'Hardware'],
  ['graphics card gpu issue', 'Hardware'],
  ['cd dvd drive not reading', 'Hardware'],
  ['headphone jack broken', 'Hardware'],
  ['bluetooth adapter not working', 'Hardware'],
  ['touchpad not responding', 'Hardware'],
  ['desktop computer wont start', 'Hardware'],
  ['computer shuts down suddenly restarts', 'Hardware'],
  ['system randomly restarts crashes', 'Hardware'],
  ['computer keeps restarting looping', 'Hardware'],
  ['device powers off randomly', 'Hardware'],
  ['computer smells like burning', 'Hardware'],
  ['laptop hinge broken loose', 'Hardware'],
  ['power cord adapter broken', 'Hardware'],
  ['screen backlight not working', 'Hardware'],
  ['dead pixels on monitor', 'Hardware'],
  ['computer case damaged', 'Hardware'],
  ['liquid spill on keyboard', 'Hardware'],
  ['broken usb connector port', 'Hardware'],
  ['cpu fan not spinning', 'Hardware'],
  ['graphics card fan loud noise', 'Hardware'],
  ['power button not responding', 'Hardware'],
  ['laptop keyboard keys stuck', 'Hardware'],
  ['monitor has lines stripes', 'Hardware'],
  ['screen flickers when moved', 'Hardware'],
  ['laptop trackpad not clicking', 'Hardware'],
  ['external hard drive not detected', 'Hardware'],
  ['ssd drive failure', 'Hardware'],
  ['ram stick faulty', 'Hardware'],
  ['cmos battery dead', 'Hardware'],
  ['power surge damaged computer', 'Hardware'],
  ['monitor no signal detected', 'Hardware'],
  ['computer freezing randomly', 'Hardware'],
  ['laptop battery drains fast', 'Hardware'],
  ['charger not working', 'Hardware'],
  ['screen has dark spots', 'Hardware'],
  ['keyboard backlight broken', 'Hardware'],
  ['fan makes grinding noise', 'Hardware'],
  ['computer wont boot', 'Hardware'],
  ['bios error on startup', 'Hardware'],
  ['computer stuck on loading screen', 'Hardware'],
  ['device not recognized usb', 'Hardware'],
  ['printer paper jam', 'Hardware'],
  ['printer ink cartridge problem', 'Hardware'],
  ['scanner not working', 'Hardware'],
  ['fax machine broken', 'Hardware'],
  ['projector lamp needs replacement', 'Hardware'],
  ['ups battery needs replacement', 'Hardware'],
  
  // ===== SOFTWARE ISSUES =====
  ['software application crash error', 'Software'],
  ['program wont install installation failed', 'Software'],
  ['update failed cannot update system', 'Software'],
  ['email not sending receiving outlook', 'Software'],
  ['password reset forgot password login', 'Software'],
  ['login issues cannot sign in account', 'Software'],
  ['application freezing not responding', 'Software'],
  ['license activation failed software', 'Software'],
  ['compatibility issues program', 'Software'],
  ['performance slow lagging software', 'Software'],
  ['microsoft office word excel powerpoint', 'Software'],
  ['adobe photoshop premiere crash', 'Software'],
  ['browser chrome firefox edge issues', 'Software'],
  ['operating system windows linux mac', 'Software'],
  ['driver update failed device', 'Software'],
  ['software license expired renewal', 'Software'],
  ['app not opening crashing startup', 'Software'],
  ['software bug glitch error', 'Software'],
  ['program uninstall failed', 'Software'],
  ['software configuration settings', 'Software'],
  ['windows update stuck', 'Software'],
  ['mac os update failed', 'Software'],
  ['application not responding', 'Software'],
  ['error message popup dialog', 'Software'],
  ['program keeps crashing closing', 'Software'],
  ['software wont open', 'Software'],
  
  // ===== NETWORK ISSUES =====
  ['internet connection slow speed', 'Network'],
  ['wifi not connecting wireless network', 'Network'],
  ['vpn connection failed remote access', 'Network'],
  ['network drive not accessible shared', 'Network'],
  ['cannot access shared resources folder', 'Network'],
  ['dns resolution failed website', 'Network'],
  ['network cable disconnected ethernet', 'Network'],
  ['router configuration issues modem', 'Network'],
  ['ip address conflict network', 'Network'],
  ['bandwidth usage high slow', 'Network'],
  ['wireless access point issues', 'Network'],
  ['network printer not found', 'Network'],
  ['firewall blocking application network', 'Network'],
  ['proxy server configuration issues', 'Network'],
  ['voip phone system issues', 'Network'],
  ['lan connection dropped disconnected', 'Network'],
  ['network latency ping high slow', 'Network'],
  ['dhcp not assigning ip address', 'Network'],
  ['network switch port failure', 'Network'],
  ['cannot reach website server', 'Network'],
  
  // ===== SECURITY ISSUES =====
  ['virus malware detected infection', 'Security'],
  ['suspicious email phishing scam', 'Security'],
  ['firewall blocking access application', 'Security'],
  ['antivirus alert warning threat', 'Security'],
  ['unauthorized access attempt login', 'Security'],
  ['data breach concern information', 'Security'],
  ['ransomware encrypted files locked', 'Security'],
  ['security patch needed update', 'Security'],
  ['account compromised hacked', 'Security'],
  ['privacy concerns data protection', 'Security'],
  ['spam email filtering issues', 'Security'],
  ['two factor authentication problems', 'Security'],
  ['encryption issues data protection', 'Security'],
  ['security certificate errors', 'Security'],
  ['intrusion detection system alerts', 'Security'],
  
  // ===== ACCOUNT ISSUES =====
  ['user account locked disabled', 'Account'],
  ['permissions access denied folder', 'Account'],
  ['profile corrupted user settings', 'Account'],
  ['password expired change reset', 'Account'],
  ['multi factor authentication mfa', 'Account'],
  ['account settings reset default', 'Account'],
  ['user preferences lost saved', 'Account'],
  ['login credentials invalid wrong', 'Account'],
  ['domain join issues computer', 'Account'],
  ['access rights missing permissions', 'Account'],
  ['active directory sync issues', 'Account'],
  ['user profile service failed', 'Account'],
  ['account creation new user', 'Account'],
  ['group policy issues settings', 'Account'],
  ['single sign on sso problems', 'Account'],
  ['cant log in cannot login', 'Account'],
  ['username password incorrect', 'Account'],
  
  // ===== DATABASE ISSUES =====
  ['database slow performance query optimization', 'Database'],
  ['sql server connection failed timeout', 'Database'],
  ['database backup failed recovery issues', 'Database'],
  ['mysql postgresql oracle db connection', 'Database'],
  ['database table corrupted data integrity', 'Database'],
  ['query execution plan performance tuning', 'Database'],
  ['database replication sync issues', 'Database'],
  ['stored procedure function error', 'Database'],
  ['database migration upgrade problems', 'Database'],
  ['deadlock timeout transaction issues', 'Database'],
  ['database storage space running out', 'Database'],
  
  // ===== CONFIGURATION ISSUES =====
  ['system configuration settings change', 'Configuration'],
  ['application configuration file error', 'Configuration'],
  ['server configuration optimization tuning', 'Configuration'],
  ['network device configuration router switch', 'Configuration'],
  ['software settings preference configuration', 'Configuration'],
  ['environment variable configuration setup', 'Configuration'],
  ['registry settings configuration changes', 'Configuration'],
  ['configuration management tool issues', 'Configuration'],
  ['deployment configuration pipeline setup', 'Configuration'],
  ['load balancer configuration settings', 'Configuration'],
];

// Train the classifier
console.log('🤖 Training AI classifier with ' + trainingData.length + ' examples...');

// Create a new classifier instance to clear previous training
const { BayesClassifier } = natural;
// Reassign enhancedClassifier to a new instance
Object.assign(enhancedClassifier, new BayesClassifier());

trainingData.forEach(([text, category]) => {
  enhancedClassifier.addDocument(text, category);
});
enhancedClassifier.train();
console.log('✅ AI classifier training completed');





// ========== FULL ONLINE AI CLASSIFICATION ==========
async function classifyTicketWithAI(description) {
  try {
    console.log('🤖 ========================================');
    console.log('🤖 AI CLASSIFICATION REQUEST');
    console.log('🤖 Description: "' + description.substring(0, 100) + (description.length > 100 ? '...' : '') + '"');
    console.log('🤖 ========================================');
    
    // First try local classifier
    const localClassification = enhancedClassifier.getClassifications(description);
    const topLocalCategory = localClassification[0].label;
    const localConfidence = localClassification[0].value;
    
    console.log(`🤖 Local AI Top 3:`);
    localClassification.slice(0, 3).forEach((c, i) => {
      console.log(`   ${i+1}. ${c.label}: ${(c.value * 100).toFixed(1)}%`);
    });
    
    // If local confidence is VERY high (>92%), use it
    if (localConfidence > 0.92) {
      console.log(`✅ Local classifier VERY HIGH confidence (${(localConfidence * 100).toFixed(1)}%), using it`);
      return { 
        issue_type: topLocalCategory, 
        confidence: localConfidence,
        method: 'local_high_confidence',
        reason: 'Local classifier has very high confidence'
      };
    }
    
    // Try Gemini AI (FREE)
    if (genAI) {
      try {
        console.log('🌐 Attempting Google Gemini AI classification...');
        
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `You are an IT help desk ticket classifier. Classify this ticket into EXACTLY ONE category.

CATEGORIES WITH EXAMPLES:
- Hardware: Physical device is broken/faulty (computer shuts down, laptop restarts, printer broken, screen cracked, battery not charging, overheating, fan noise, keyboard not working, USB port damaged, power failure, RAM issues, CPU problems, hard drive failure, beeping sounds, liquid spills, burning smell, physical damage, monitor display issues)
- Maintenance: Routine upkeep, updates, or scheduled work (system maintenance, preventive checks, scheduled updates, patch deployment, regular cleanup, server reboot for maintenance, firmware upgrades, planned downtime, routine tasks, system health checks, weekly/monthly maintenance, software updates, security patches, system optimization, disk cleanup, cache clearing)
- Software: Application problems (program crashes, software error, installation failed, Microsoft Office problems, browser issues, app not opening, license expired, driver issues, Windows/Mac/Linux problems, software bug, error messages)
- Network: Connection problems (no internet, WiFi not working, VPN failed, DNS issues, router problems, slow connection, ethernet disconnected, cannot reach server)
- Security: Safety problems (virus, malware, hacking, phishing, antivirus alert, ransomware, data breach, suspicious activity, spam)
- Account: Login problems (password reset, account locked, access denied, login failed, authentication, permissions, MFA problems)
- Database: Data problems (SQL errors, database connection failed, query issues, data corruption, backup failure, MySQL/PostgreSQL/Oracle problems)
- Configuration: Setup problems (settings incorrect, deployment failed, registry issues, environment variables, config changes)
- Other: ONLY if absolutely none of the above fit

CRITICAL DISTINCTION - MAINTENANCE vs HARDWARE:
- "Need to schedule maintenance", "regular maintenance check", "routine maintenance" = MAINTENANCE
- "Computer is broken", "laptop crashed", "hardware failed" = HARDWARE
- "System update needed", "patch deployment", "upgrade scheduled" = MAINTENANCE
- "hardware replacement maintenance" = If it's about SCHEDULING replacement = MAINTENANCE. If device ALREADY failed = HARDWARE.

Ticket Description: "${description}"

Return ONLY valid JSON (no markdown, just the JSON):
{"issue_type":"CategoryName","confidence":0.95,"reason":"One sentence explanation"}`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        console.log('🌐 Gemini raw response:', text.substring(0, 200));
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const classification = JSON.parse(jsonMatch[0]);
            
            const validCategories = ['Hardware', 'Software', 'Network', 'Security', 'Account', 'Database', 'Configuration', 'Maintenance', 'Other'];
            
            if (validCategories.includes(classification.issue_type)) {
              console.log(`🌐 Gemini AI RESULT: ${classification.issue_type} (${(classification.confidence * 100).toFixed(1)}% confidence)`);
              console.log(`📝 Reason: ${classification.reason || 'N/A'}`);
              
              return {
                issue_type: classification.issue_type,
                confidence: classification.confidence || 0.85,
                method: 'gemini',
                reason: classification.reason || ''
              };
            } else {
              console.log(`⚠️ Invalid category: "${classification.issue_type}"`);
            }
          } catch (parseError) {
            console.error('❌ JSON parse error:', parseError.message);
          }
        }
      } catch (geminiError) {
        console.error('❌ Gemini AI failed:', geminiError.message);
      }
    }
    
    // If local confidence is decent (>70%), use it
    if (localConfidence > 0.70) {
      console.log(`✅ Local classifier decent confidence (${(localConfidence * 100).toFixed(1)}%), using it`);
      return { 
        issue_type: topLocalCategory, 
        confidence: localConfidence,
        method: 'local_decent_confidence',
        reason: 'Local classifier has decent confidence'
      };
    }
    
    // Fallback to keyword-based
    console.log('🔄 Falling back to keyword-based classification...');
    return fallbackClassification(description);
    
  } catch (error) {
    console.error('❌ All AI classification methods failed:', error);
    return fallbackClassification(description);
  }
}

// Enhanced fallback with MAINTENANCE as PRIORITY check
function fallbackClassification(description) {
  const desc = description.toLowerCase();
  
  console.log('🔧 Running keyword-based fallback classification...');
  
  // CHECK MAINTENANCE FIRST (before Hardware)
  const maintenanceKeywords = [
    'maintenance', 'scheduled', 'routine', 'preventive', 'upgrade',
    'cleanup', 'clean up', 'cleaning', 'optimization', 'optimize',
    'patch', 'patching', 'service pack', 'firmware update',
    'health check', 'healthcheck', 'audit', 'review',
    'quarterly', 'monthly', 'weekly', 'annual', 'yearly',
    'plan', 'planning', 'schedule', 'scheduling', 'window',
    'downtime', 'outage window', 'change window',
    'deployment', 'deploy', 'rollout', 'release',
    'capacity planning', 'resource planning',
    'log rotation', 'log cleanup', 'cache clearing',
    'temp files', 'temporary files', 'disk cleanup',
    'database cleanup', 'system cleanup',
    'preventive check', 'regular check', 'routine check',
    'maintenance mode', 'maintenance plan'
  ];
  
  let maintenanceCount = 0;
  for (const keyword of maintenanceKeywords) {
    if (desc.includes(keyword)) {
      maintenanceCount++;
    }
  }
  
  // If 2 or more maintenance keywords found, classify as Maintenance
  if (maintenanceCount >= 2) {
    console.log(`🔧 MAINTENANCE detected (${maintenanceCount} keywords matched)`);
    return { 
      issue_type: 'Maintenance', 
      confidence: Math.min(0.7 + (maintenanceCount * 0.08), 0.95),
      method: 'fallback_maintenance_priority',
      reason: `Matched ${maintenanceCount} maintenance keywords`
    };
  }
  
  // Check Hardware
  const hardwareKeywords = [
    'computer', 'laptop', 'printer', 'monitor', 'keyboard', 'mouse', 
    'screen', 'battery', 'power', 'fan', 'usb', 'speaker', 'webcam', 
    'touchpad', 'desktop', 'graphics', 'gpu', 'motherboard', 'cpu', 'ram',
    'shuts down', 'shutdown', 'restarts', 'restarting', 'turns off',
    'overheating', 'overheat', 'burning smell', 'smoke',
    'blue screen', 'bsod', 'black screen', 'no display',
    'beeping', 'beep', 'clicking sound', 'noise', 'loud',
    'cracked', 'broken', 'damaged', 'liquid spill', 'water damage',
    'charging', 'charger', 'power cord', 'adapter', 'plug',
    'hinge', 'loose', 'wobbly', 'stand',
    'dead pixel', 'flickering', 'lines on screen', 'backlight',
    'hard drive', 'ssd', 'storage', 'disk', 'hdd',
    'not turning on', 'wont turn on', 'no power', 'dead',
    'freezes and restarts', 'crashes and reboots', 'keeps restarting',
    'randomly turns off', 'suddenly shuts', 'unexpectedly shuts',
    'powers down', 'powered down', 'shut down randomly',
    'grinding', 'screeching', 'whining noise'
  ];
  
  let hardwareCount = 0;
  for (const keyword of hardwareKeywords) {
    if (desc.includes(keyword)) {
      hardwareCount++;
    }
  }
  
  if (hardwareCount >= 2) {
    console.log(`🔧 HARDWARE detected (${hardwareCount} keywords matched)`);
    return { 
      issue_type: 'Hardware', 
      confidence: Math.min(0.7 + (hardwareCount * 0.08), 0.95),
      method: 'fallback_hardware_priority',
      reason: `Matched ${hardwareCount} hardware keywords`
    };
  }
  
  // Check other categories...
  const rules = [
    { type: 'Software', keywords: ['software', 'application', 'program', 'microsoft', 'word', 'excel', 'crash', 'error message', 'install', 'app', 'bug', 'glitch', 'license', 'adobe', 'browser', 'chrome', 'firefox', 'driver', 'windows', 'mac', 'linux', 'not opening', 'not responding', 'frozen', 'stuck'] },
   { type: 'Network', keywords: [
  'internet', 'wifi', 'network', 'connection', 'vpn', 'dns', 'router', 'modem', 
  'ethernet', 'bandwidth', 'latency', 'ping', 'signal', 'wireless', 
  'no internet', 'cannot connect', 'disconnected', 'slow internet', 'weak signal', 'no wifi',
  'downloading', 'download', 'browsing', 'browse', 'browser slow', 'slow browsing',
  'streaming', 'buffering', 'uploading', 'upload slow', 'download slow',
  'web page', 'website', 'url', 'http', 'https', 'web browsing',
  'online', 'offline', 'no connection', 'limited connectivity',
  'network slow', 'network speed', 'internet speed', 'speed test',
  'cannot reach', 'unreachable', 'timeout', 'timed out', 'connection refused',
  'proxy', 'gateway', 'subnet', 'lan', 'wan', 'isp',
  'tcp', 'udp', 'packet loss', 'jitter', 'throughput',
  'port', 'firewall blocking', 'nat', 'dhcp'
] },
    { type: 'Account', keywords: ['login', 'account', 'password', 'user', 'access', 'permission', 'credentials', 'locked', 'disabled', 'forgot', 'reset', 'profile', 'sign in', 'log in', 'authentication', 'mfa', 'access denied', 'permission denied'] },
    { type: 'Database', keywords: ['database', 'data', 'sql', 'query', 'mysql', 'postgresql', 'oracle', 'mongodb', 'table', 'index', 'deadlock', 'transaction', 'corrupted', 'data loss', 'backup'] },
    { type: 'Configuration', keywords: ['configure', 'setting', 'setup', 'configuration', 'options', 'registry', 'deployment', 'environment', 'config file', 'settings change', 'reconfigure'] }
  ];
  
  let bestMatch = { type: 'Other', confidence: 0.3, keywordCount: 0 };
  
  for (const rule of rules) {
    let matchCount = 0;
    for (const keyword of rule.keywords) {
      if (desc.includes(keyword)) {
        matchCount++;
      }
    }
    if (matchCount > bestMatch.keywordCount) {
      bestMatch = { 
        type: rule.type, 
        confidence: Math.min(0.3 + (matchCount * 0.12), 0.88),
        keywordCount: matchCount
      };
    }
  }

  // If hardware came second but has keywords, prefer it over Other
  if (bestMatch.type === 'Other' && hardwareCount >= 1) {
    console.log(`🔧 Defaulting to Hardware (${hardwareCount} keywords vs Other)`);
    return { 
      issue_type: 'Hardware', 
      confidence: 0.5,
      method: 'fallback_hardware_default',
      reason: `Matched ${hardwareCount} hardware keywords, no other category matched`
    };
  }
  
  console.log(`🔧 Fallback RESULT: ${bestMatch.type} (${bestMatch.keywordCount} keywords, ${(bestMatch.confidence * 100).toFixed(1)}% confidence)`);
  
  return { 
    issue_type: bestMatch.type, 
    confidence: bestMatch.confidence,
    method: 'fallback_keywords',
    reason: `Matched ${bestMatch.keywordCount} keywords`
  };
}

// ========== QUEUE MANAGEMENT FUNCTIONS ==========

// ========== ENHANCED TEAM-BASED ASSIGNMENT SYSTEM ==========

// Enhanced team mapping
const enhancedTeamMap = {
  'Hardware': 1,
  'Software': 2,
  'Network': 3,
  'Security': 4,
  'Account': 5,
  'Database': 6,
  'Configuration': 7,
  'Maintenance': 8,
  'Other': 9
};

// ========== FIXED: Check officer availability with <3 tickets rule ==========
async function checkOfficerAvailabilityForAllTeams(teamId) {
  if (!isDatabaseConnected) {
    console.log('❌ Database not connected for officer availability check');
    return null;
  }

  try {
    console.log(`🔍 Checking available officers for team ${teamId} (looking for officers with <3 active tickets)`);
    
    const availableOfficers = await db.collection('users').aggregate([
      {
        $match: {
          role: 'senior',
          team_id: teamId,
          is_active: true
        }
      },
      {
        $lookup: {
          from: 'tickets',
          let: { user_id: '$user_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$assigned_to', '$$user_id'] },
                status: { $in: ['In Progress'] } // ONLY count "In Progress" tickets
              }
            }
          ],
          as: 'active_tickets'
        }
      },
      {
        $addFields: {
          active_tickets_count: { $size: '$active_tickets' }
        }
      },
      {
        $match: {
          active_tickets_count: { $lt: 3 } // FIXED: Less than 3 active tickets (0, 1, or 2)
        }
      },
      {
        $sort: { active_tickets_count: 1 } // Prefer officers with fewer tickets
      },
      {
        $limit: 1
      },
      {
        $project: {
          user_id: 1,
          name: 1,
          active_tickets_count: 1
        }
      }
    ]).toArray();

    console.log(`📊 Found ${availableOfficers.length} available officers for team ${teamId} with <3 active tickets`);
    
    if (availableOfficers.length > 0) {
      console.log(`✅ Available officer: ${availableOfficers[0].name} with ${availableOfficers[0].active_tickets_count}/3 active tickets`);
      return availableOfficers[0];
    } else {
      console.log(`❌ NO available officers for team ${teamId} - all officers have 3 or more active tickets`);
      return null;
    }
  } catch (error) {
    console.error('❌ Check officer availability error:', error);
    return null;
  }
}






// Enhanced ticket submission with automatic assignment for ALL teams
app.post('/api/submit-ticket', authenticateToken, requireDatabase, ticketUpload.single('attachment'), async (req, res) => {
  try {
    const { description, priority, steps_to_reproduce, additional_notes } = req.body;
    const userId = req.user.id;
    const attachment = req.file ? 'assets/ticket_uploads/' + req.file.filename : null;

    if (!description || !priority) {
      return res.status(400).json({ success: false, message: 'Description and priority are required' });
    }

    console.log(`🎫 NEW TICKET from user ${userId}`);

    // AI classification
    const aiCategory = await classifyTicketWithAI(description);
    const issueType = aiCategory.issue_type;
    const confidence = aiCategory.confidence;

    console.log(`🤖 AI Classification: ${issueType} (${(confidence * 100).toFixed(1)}% confidence)`);

    // Get team ID for the issue type
    const teamId = enhancedTeamMap[issueType] || 9;

    // Check if any officer in this team is available (has less than 3 active tickets)
    const availableOfficer = await checkOfficerAvailabilityForAllTeams(teamId);

    let assignedTo = null;
    let status = 'Queued';
    let queuePosition = null;
    let estimatedWaitTime = null;
    let assignmentMessage = '';

    if (availableOfficer) {
      // Direct assignment to available officer (has <3 tickets)
      assignedTo = availableOfficer.user_id;
      status = 'In Progress';
      assignmentMessage = `Ticket submitted and assigned to ${availableOfficer.name}! 🎯 (${availableOfficer.active_tickets_count}/3 tickets)`;
      console.log(`✅ Direct assignment to ${availableOfficer.name} (${availableOfficer.active_tickets_count}/3 active tickets)`);
      
     
    } else {
      // Place in queue - no available officers in this team (all have ≥3 tickets)
      status = 'Queued';
      
      // Calculate queue position and wait time
      const queueCount = await db.collection('tickets').countDocuments({ 
        status: 'Queued', 
        team_id: teamId 
      });
      
      queuePosition = queueCount + 1;
      estimatedWaitTime = calculateWaitTime(issueType, queuePosition);
      assignmentMessage = `Ticket submitted and placed in queue. Position: ${queuePosition}. Estimated wait: ${estimatedWaitTime} business days. ⏳ (All officers have 3+ tickets)`;
      console.log(`⏳ Ticket queued for ${issueType} team at position ${queuePosition} - ALL officers have 3+ active tickets`);
    }

// Insert ticket
const ticketId = await getNextSequence('ticketId');  // This line should come FIRST
const ticketDoc = {
  _id: ticketId,
  ticket_id: ticketId,
  user_id: userId,
  description,
  priority,
  issue_type: issueType,
  status,
  team_id: teamId,
  assigned_to: assignedTo,
  attachment,
  steps_to_reproduce: steps_to_reproduce || null,
  additional_notes: additional_notes || null,
  ai_confidence: confidence,
  queue_position: queuePosition,
  estimated_wait_days: estimatedWaitTime,
  in_queue: status === 'Queued',
  assigned_at: assignedTo ? new Date() : null,
  created_at: new Date(),
  updated_at: new Date()
};

await db.collection('tickets').insertOne(ticketDoc);

// ✅ MOVED: Create notification for the assigned officer - NOW ticketId is available
if (availableOfficer) {
  await createComprehensiveNotification({
    user_id: availableOfficer.user_id,
    title: 'New Ticket Assigned',
    message: `You have been assigned a new ${issueType} ticket: "${description.substring(0, 100)}..."`,
    type: 'ticket_assigned',
    related_ticket_id: ticketId,  // ← NOW this works correctly
    priority: 'high'
  });
}

// Create notification for the user
await createComprehensiveNotification({
  user_id: userId,
  title: 'Ticket Submitted Successfully',
  message: `Your ${issueType} ticket has been ${assignedTo ? 'assigned to an officer' : 'placed in queue'}. ${assignmentMessage}`,
  type: 'ticket_created',
  related_ticket_id: ticketId,  // ← This also works now
  priority: 'medium'
});

    // Log ticket creation
    await db.collection('ticket_logs').insertOne({
      log_id: await getNextSequence('logId'),
      ticket_id: ticketId,
      changed_by: userId,
      change_description: `Ticket created: ${issueType} - Status: ${status}`,
      created_at: new Date()
    });

    console.log(`✅ Ticket ${ticketId} created with status: ${status}`);

    // If ticket was queued, try immediate assignment in background
    if (status === 'Queued') {
      setTimeout(async () => {
        try {
          const assigned = await processTicketAssignment(ticketId);
          if (assigned) {
            console.log(`🚀 Immediately assigned ticket ${ticketId} after submission`);
          }
        } catch (error) {
          console.error('Immediate assignment error:', error);
        }
      }, 1000);
    }

    res.json({
      success: true,
      ticket_id: ticketId,
      issue_type: issueType,
      confidence: confidence,
      assigned: assignedTo !== null,
      queue_position: queuePosition,
      estimated_wait_days: estimatedWaitTime,
      status: status,
      message: assignmentMessage
    });

  } catch (error) {
    console.error('Submit ticket error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit ticket: ' + error.message 
    });
  }
});







// ========== FIXED: Enhanced process individual ticket assignment ==========
async function processTicketAssignment(ticketId) {
  if (!isDatabaseConnected) {
    console.log('❌ Database not connected for ticket assignment');
    return false;
  }

  try {
    console.log(`🔍 PROCESSING ASSIGNMENT for ticket ${ticketId}`);
    
    // Get ticket details
    const ticket = await db.collection('tickets').findOne({ 
      ticket_id: parseInt(ticketId), 
      status: 'Queued' 
    });

    if (!ticket) {
      console.log(`❌ Ticket ${ticketId} not found or not queued`);
      return false;
    }

    const teamId = ticket.team_id;

    // Find available officer with LESS THAN 3 ACTIVE tickets in the same team
    const availableOfficers = await db.collection('users').aggregate([
      {
        $match: {
          role: 'senior',
          team_id: teamId,
          is_active: true
        }
      },
      {
        $lookup: {
          from: 'tickets',
          let: { user_id: '$user_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$assigned_to', '$$user_id'] },
                status: { $in: ['In Progress'] } // ONLY count "In Progress" tickets
              }
            }
          ],
          as: 'active_tickets'
        }
      },
      {
        $addFields: {
          active_tickets_count: { $size: '$active_tickets' }
        }
      },
      {
        $match: {
          active_tickets_count: { $lt: 3 } // FIXED: Less than 3 active tickets
        }
      },
      {
        $sort: { active_tickets_count: 1 } // Prefer officers with fewer tickets
      },
      {
        $limit: 1
      }
    ]).toArray();

    if (availableOfficers.length > 0) {
      const officer = availableOfficers[0];
      
      console.log(`🎯 ASSIGNING ticket ${ticketId} to ${officer.name} (${officer.active_tickets_count}/3 active tickets)`);

      // Assign ticket to officer
      await db.collection('tickets').updateOne(
        { ticket_id: parseInt(ticketId) },
        {
          $set: {
            assigned_to: officer.user_id,
            status: 'In Progress',
            in_queue: false,
            queue_position: null,
            estimated_wait_days: null,
            assigned_at: new Date(),
            updated_at: new Date()
          }
        }
      );

      // Create notification for the officer
    await createComprehensiveNotification({
  user_id: ticket.user_id,
  title: 'Ticket Resolved',
  message: `Your ticket #${ticketId} has been resolved by ${req.user.name}. Please review and close the ticket if satisfied.`,
  type: 'ticket_resolved',
  related_ticket_id: parseInt(ticketId),
  priority: 'high'
});

      // Create notification for the user
      await createComprehensiveNotification({
  user_id: ticket.user_id,
  title: 'Ticket Resolved',
  message: `Your ticket #${ticketId} has been resolved by ${req.user.name}. Please review and close the ticket if satisfied.`,
  type: 'ticket_resolved',
  related_ticket_id: parseInt(ticketId),
  priority: 'high'
});

      // Log the assignment
      await db.collection('ticket_logs').insertOne({
        log_id: await getNextSequence('logId'),
        ticket_id: parseInt(ticketId),
        changed_by: officer.user_id,
        change_description: `Automatically assigned to ${officer.name} from queue (${officer.active_tickets_count}/3 active tickets)`,
        created_at: new Date()
      });

      console.log(`✅ SUCCESS: Ticket ${ticketId} assigned to ${officer.name}`);
      return true;
    } else {
      console.log(`⏳ NO available officers in team ${teamId} for ticket ${ticketId} (all have 3+ active tickets)`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Assignment error for ticket ${ticketId}:`, error);
    return false;
  }
}

// ========== FIXED: Enhanced process ALL queued tickets automatically ==========
async function processAllQueuedTickets() {
  if (!isDatabaseConnected) {
    console.log('❌ Database not connected for queue processing');
    return 0;
  }

  try {
    console.log('🔄 PROCESSING ALL QUEUED TICKETS...');
    
    // Get all queued tickets ordered by priority and creation time
    const queuedTickets = await db.collection('tickets')
      .find({ status: 'Queued' })
      .sort({ 
        priority: -1, // High priority first (High > Medium > Low)
        created_at: 1 // Oldest first
      })
      .toArray();

    console.log(`📋 Found ${queuedTickets.length} queued tickets to process`);

    let assignedCount = 0;

    for (const ticket of queuedTickets) {
      const assigned = await processTicketAssignment(ticket.ticket_id);
      if (assigned) {
        assignedCount++;
        // Small delay to prevent database overload
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Queue processing completed. ${assignedCount} tickets assigned.`);
    return assignedCount;
  } catch (error) {
    console.error('❌ Queue processing error:', error);
    return 0;
  }
}

// Calculate wait time based on queue position
function calculateWaitTime(issueType, queuePosition) {
  const baseTimes = {
    'Hardware': 2, 'Software': 1, 'Network': 3, 'Security': 1,
    'Account': 1, 'Database': 2, 'Configuration': 2, 'Maintenance': 3, 'Other': 2
  };
  const baseDays = baseTimes[issueType] || 2;
  const additionalDays = Math.floor(queuePosition / 2);
  return Math.max(1, baseDays + additionalDays);
}

// ========== ADMIN DELETE TICKET ROUTE ==========

// Delete ticket - ADMIN ONLY VERSION (for admin dashboard)
app.delete('/api/admin/tickets/:ticketId', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    console.log(`🗑️ [ADMIN] Delete ticket request: ${ticketId} by admin ${req.user.id}`);

    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    try {
      // Delete comments without transaction
      const commentsResult = await db.collection('comments').deleteMany({ ticket_id: parseInt(ticketId) });
      console.log(`✅ Comments deleted for ticket ${ticketId}: ${commentsResult.deletedCount} comments`);
      
      // Delete logs without transaction
      const logsResult = await db.collection('ticket_logs').deleteMany({ ticket_id: parseInt(ticketId) });
      console.log(`✅ Logs deleted for ticket ${ticketId}: ${logsResult.deletedCount} logs`);
      
      // Delete notifications related to this ticket
      const notificationsResult = await db.collection('notifications').deleteMany({ related_ticket_id: parseInt(ticketId) });
      console.log(`✅ Notifications deleted for ticket ${ticketId}: ${notificationsResult.deletedCount} notifications`);
      
      // Delete the ticket
      const result = await db.collection('tickets').deleteOne({ ticket_id: parseInt(ticketId) });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      
      console.log(`✅ Ticket ${ticketId} deleted successfully by admin`);
      
      res.json({
        success: true,
        message: 'Ticket deleted successfully',
      });
    } catch (error) {
      console.error('❌ Error during ticket deletion:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Admin delete ticket error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during ticket deletion: ' + error.message 
    });
  }
});

// ========== PUBLIC ROUTES ==========

// Health check endpoint (works without database)
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    database: isDatabaseConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Test endpoint (works without database)
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running!',
    database: isDatabaseConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// ========== FIXED USER ROUTES ==========

// Get all users (for admin dashboard and reports)
app.get('/api/users', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    console.log('👥 Fetching all users for admin');
    
    const users = await db.collection('users')
      .find({}, { projection: { password: 0 } }) // Exclude passwords
      .sort({ created_at: -1 })
      .toArray();
    
    console.log(`✅ Found ${users.length} users`);
    
    res.json({
      success: true,
      users: users,
    });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users: ' + error.message 
    });
  }
});

// Get user by ID
app.get('/api/users/:userId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`👤 Fetching user ${userId} by user ${req.user.id}`);
    
    // Check permissions
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      console.log(`❌ Access denied: User ${req.user.id} cannot access user ${userId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const user = await db.collection('users').findOne(
      { user_id: parseInt(userId) },
      { projection: { password: 0 } }
    );
    
    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    console.log(`✅ User ${userId} fetched successfully`);
    res.json({ success: true, user: user });
    
  } catch (error) {
    console.error(`❌ Get user error for userId: ${req.params.userId}:`, error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});










// Public Registration endpoint
// Public Registration endpoint - WITH EMAIL NOTIFICATIONS
// Public Registration endpoint - WITH CREDENTIALS IN EMAIL
app.post('/api/register', upload.single('avatar'), requireDatabase, async (req, res) => {
  try {
    const { name, email, password, confirm_password, phone_number, team_id, role = 'user' } = req.body;
    console.log(`Register request: ${JSON.stringify({ name, email, role })} at ${new Date().toISOString()}`);
    
    if (!name || !email || !password || !confirm_password) {
      return res.status(400).json({ success: false, message: 'Name, email, password, and confirm password are required' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const avatar_path = req.file ? 'assets/avatars/' + req.file.filename : null;
    
    const userId = await getNextSequence('userId');
    const userDoc = {
      _id: userId,
      user_id: userId,
      name,
      email,
      password: hashedPassword,
      role,
      phone_number: phone_number || null,
      department: req.body.department || '',
      position: req.body.position || '',
      team_id: team_id ? parseInt(team_id) : null,
      avatar_path,
      assigned_tickets_count: 0,
      is_active: true,
      created_at: new Date()
    };
    
    await db.collection('users').insertOne(userDoc);
    
    // 🔥 SEND WELCOME EMAIL WITH LOGIN CREDENTIALS
    try {
      const welcomeHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">🎉 Welcome to IT Help Desk!</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">Hello ${name},</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              Your account has been successfully created in the IT Help Desk System.
            </p>
            <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">📋 Your Login Credentials:</h3>
              <p style="margin: 5px 0; color: #856404; font-size: 14px;">
                <strong>Email:</strong> ${email}<br>
                <strong>Password:</strong> ${password}<br>
                <strong>Login URL:</strong> <a href="http://localhost:3000/login" style="color: #007bff;">http://localhost:3000/login</a>
              </p>
              <p style="margin: 10px 0 0 0; color: #856404; font-size: 12px;">
                ⚠️ Please keep your credentials safe. You can change your password after logging in.
              </p>
            </div>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Name:</strong> ${name}<br>
                <strong>Email:</strong> ${email}<br>
                <strong>Role:</strong> ${role}<br>
                <strong>Account Created:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
            <p style="color: #888; font-size: 14px;">
              You can now log in and submit support tickets.
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 12px;">
              Ethiopian Statistical Service IT Help Desk<br>
              This is an automated message, please do not reply.
            </p>
          </div>
        </div>
      `;
      
      const mailOptions = {
        from: '"IT Help Desk" <hussenseid670@gmail.com>',
        to: email,
        subject: '🎉 Welcome to IT Help Desk - Your Account is Ready!',
        html: welcomeHtml
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`✅ Welcome email with credentials sent to: ${email}`);
    } catch (emailError) {
      console.error('❌ Welcome email failed:', emailError.message);
    }

    // 🔥 NOTIFY ADMIN
    try {
      await notifyAdmin('👤 New User Registration', 
        `A new user has registered on the IT Help Desk System.`, {
        userName: name,
        userEmail: email,
        action: 'user_registration'
      });
    } catch (adminEmailError) {
      console.error('❌ Admin notification failed:', adminEmailError.message);
    }
    
    const newUser = await db.collection('users').findOne(
      { user_id: userId },
      { projection: { password: 0 } }
    );
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: newUser,
    });
  } catch (error) {
    console.error(`Registration error:`, error);
    res.status(500).json({ success: false, message: 'Server error during registration: ' + error.message });
  }
});





// Login endpoint - UPDATED VERSION
app.post('/api/login', requireDatabase, async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`🔐 Login attempt for email: ${email} at ${new Date().toISOString()}`);
    
    if (!email || !password) {
      console.log('❌ Login failed: Missing email or password');
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    
    // Find user by email (case-insensitive)
    const user = await db.collection('users').findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    });
    
    if (!user) {
      console.log(`❌ Login failed: No user found with email ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    console.log(`👤 User found: ${user.name}, role: ${user.role}, active: ${user.is_active}`);
    
    // Check if user is active
    if (user.is_active === false) {
      console.log(`❌ Login failed: User account is deactivated`);
      return res.status(401).json({ success: false, message: 'Account is deactivated. Please contact administrator.' });
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log(`❌ Login failed: Invalid password for user ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.user_id, 
        email: user.email, 
        role: user.role, 
        team_id: user.team_id,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;
    
    console.log(`✅ Login successful for: ${user.name} (${user.role})`);
    
    res.json({
      success: true,
      message: 'Login successful',
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error(`❌ Login error at ${new Date().toISOString()}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login: ' + error.message 
    });
  }
});





// Admin register regular user endpoint
// Admin register regular user endpoint - WITH EMAIL NOTIFICATIONS
// Admin register user endpoint - WITH CREDENTIALS IN EMAIL
// Admin register regular user endpoint - WITH CREDENTIALS TO BOTH USER AND ADMIN
app.post('/api/admin/register-user', authenticateToken, requireAdmin, requireDatabase, upload.single('avatar'), async (req, res) => {
  try {
    const { name, email, password, confirm_password, phone_number, team_id, role = 'user' } = req.body;
    console.log(`Admin creating user: ${JSON.stringify({ name, email, role })} at ${new Date().toISOString()}`);
    
    if (!name || !email || !password || !confirm_password) {
      return res.status(400).json({ success: false, message: 'Name, email, password, and confirm password are required' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const avatar_path = req.file ? 'assets/avatars/' + req.file.filename : null;
    
    const userId = await getNextSequence('userId');
    const userDoc = {
      _id: userId,
      user_id: userId,
      name,
      email,
      password: hashedPassword,
      role,
      phone_number: phone_number || null,
      department: req.body.department || '',
      position: req.body.position || '',
      team_id: team_id ? parseInt(team_id) : null,
      avatar_path,
      assigned_tickets_count: 0,
      is_active: true,
      created_at: new Date()
    };
    
    await db.collection('users').insertOne(userDoc);
    
    const adminName = req.user.name;
    const adminEmail = req.user.email;

    // 🔥 SEND WELCOME EMAIL TO THE NEW USER (WITH CREDENTIALS)
    try {
      const welcomeHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">🎉 Welcome to IT Help Desk!</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">Hello ${name},</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              Your account has been created by an administrator in the IT Help Desk System.
            </p>
            <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">📋 Your Login Credentials:</h3>
              <p style="margin: 5px 0; color: #856404; font-size: 14px;">
                <strong>Email:</strong> ${email}<br>
                <strong>Password:</strong> ${password}<br>
                <strong>Login URL:</strong> <a href="http://localhost:3000/login" style="color: #007bff;">http://localhost:3000/login</a>
              </p>
              <p style="margin: 10px 0 0 0; color: #856404; font-size: 12px;">
                ⚠️ Please change your password after first login for security.
              </p>
            </div>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Name:</strong> ${name}<br>
                <strong>Email:</strong> ${email}<br>
                <strong>Role:</strong> ${role}<br>
                <strong>Created By:</strong> Admin (${adminName})<br>
                <strong>Account Created:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
            <p style="color: #888; font-size: 14px;">
              You can now log in and submit support tickets.
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 12px;">
              Ethiopian Statistical Service IT Help Desk<br>
              This is an automated message, please do not reply.
            </p>
          </div>
        </div>
      `;
      
      const mailOptions = {
        from: '"IT Help Desk" <hussenseid670@gmail.com>',
        to: email,
        subject: '🎉 Welcome to IT Help Desk - Account Created by Admin',
        html: welcomeHtml
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`✅ Welcome email with credentials sent to user: ${email}`);
    } catch (emailError) {
      console.error('❌ Welcome email to user failed:', emailError.message);
    }

    // 🔥 SEND CONFIRMATION EMAIL TO THE ADMIN WITH THE PASSWORD THEY SET
    try {
      const adminConfirmHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="background: #28a745; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">✅ User Created Successfully</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">Hello ${adminName},</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              You have successfully created a new user account in the IT Help Desk System.
            </p>
            <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">📋 User Credentials (for your records):</h3>
              <p style="margin: 5px 0; color: #856404; font-size: 14px;">
                <strong>Name:</strong> ${name}<br>
                <strong>Email:</strong> ${email}<br>
                <strong>Password Set:</strong> ${password}<br>
                <strong>Role:</strong> ${role}<br>
                <strong>User ID:</strong> ${userId}
              </p>
              <p style="margin: 10px 0 0 0; color: #856404; font-size: 12px;">
                📝 Please keep these credentials for your records. The user has also received this information.
              </p>
            </div>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Created By:</strong> ${adminName} (You)<br>
                <strong>Created At:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 12px;">
              Ethiopian Statistical Service IT Help Desk - Admin Confirmation
            </p>
          </div>
        </div>
      `;
      
      const adminMailOptions = {
        from: '"IT Help Desk" <hussenseid670@gmail.com>',
        to: adminEmail || 'seidhussen0729@gmail.com',
        subject: `✅ User Created: ${name} (${email}) - Credentials Included`,
        html: adminConfirmHtml
      };
      
      await transporter.sendMail(adminMailOptions);
      console.log(`✅ Confirmation email with credentials sent to admin: ${adminEmail}`);
    } catch (emailError) {
      console.error('❌ Admin confirmation email failed:', emailError.message);
    }

    // 🔥 ALSO NOTIFY SUPER ADMIN (seidhussen0729@gmail.com)
    try {
      await notifyAdmin('👤 New User Created by Admin', 
        `Admin ${adminName} created a new user: ${name} (${email}), Role: ${role}. Password set: ${password}`, {
        userName: name,
        userEmail: email,
        action: 'admin_created_user'
      });
      console.log('✅ Super admin notified about new user creation');
    } catch (superAdminEmailError) {
      console.error('❌ Super admin notification failed:', superAdminEmailError.message);
    }
    
    const newUser = await db.collection('users').findOne(
      { user_id: userId },
      { projection: { password: 0 } }
    );
    
    console.log(`User registered successfully by admin: ${name} (${email})`);
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: newUser,
    });
  } catch (error) {
    console.error(`Admin user registration error:`, error);
    res.status(500).json({ success: false, message: 'Server error during registration: ' + error.message });
  }
});





// ========== FIXED PROFILE & PASSWORD ROUTES ==========

// Get user profile by ID (FIXED ROUTE - SINGLE VERSION)
app.get('/api/profile/:userId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`👤 Profile request for userId: ${userId} by user ${req.user.id}`);
    
    // Check permissions
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      console.log(`❌ Access denied: User ${req.user.id} cannot access profile of user ${userId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const user = await db.collection('users').findOne(
      { user_id: parseInt(userId) },
      { projection: { password: 0 } } // Exclude password from response
    );
    
    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    console.log(`✅ Profile fetched successfully for user ${userId}`);
    res.json({ success: true, user: user });
    
  } catch (error) {
    console.error(`❌ Profile fetch error for userId: ${userId}:`, error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// Update user profile by ID (FIXED ROUTE - SINGLE VERSION)
// Update user profile by ID - WITH EMAIL NOTIFICATION
app.put('/api/profile/:userId', authenticateToken, requireDatabase, upload.single('avatar'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone_number, team_id } = req.body;
    
    console.log(`🔄 Profile update for userId: ${userId} by user ${req.user.id}`);
    
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }
    
    const existingUser = await db.collection('users').findOne({ user_id: parseInt(userId) });
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (email && email !== existingUser.email) {
      const emailUser = await db.collection('users').findOne({ 
        email, 
        user_id: { $ne: parseInt(userId) } 
      });
      if (emailUser) {
        return res.status(400).json({ success: false, message: 'Email already taken by another user' });
      }
    }
    
    const updateFields = {
      name,
      email,
      phone_number: phone_number || null,
      department: req.body.department || '',
      position: req.body.position || '',
      updated_at: new Date()
    };
    
    if (req.file) {
      updateFields.avatar_path = 'assets/avatars/' + req.file.filename;
      if (existingUser.avatar_path && existingUser.avatar_path !== 'assets/default_avatar.png') {
        const oldAvatarPath = path.join(__dirname, existingUser.avatar_path);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }
    }
    
    if (team_id !== undefined && (req.user.role === 'admin' || req.user.role === 'senior')) {
      updateFields.team_id = team_id ? parseInt(team_id) : null;
    }
    
    const result = await db.collection('users').updateOne(
      { user_id: parseInt(userId) },
      { $set: updateFields }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // 🔥 SEND PROFILE UPDATE EMAIL
    try {
      const changesDetected = [];
      if (name !== existingUser.name) changesDetected.push(`Name: "${existingUser.name}" → "${name}"`);
      if (email !== existingUser.email) changesDetected.push(`Email: "${existingUser.email}" → "${email}"`);
      if (phone_number !== existingUser.phone_number) changesDetected.push('Phone number updated');
      if (req.file) changesDetected.push('Profile picture updated');
      
      const changesText = changesDetected.length > 0 
        ? changesDetected.map(c => `• ${c}`).join('<br>')
        : '• Profile information updated';
      
      const profileUpdateHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="background: #007bff; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">📝 Profile Updated</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">Hello ${name},</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              Your profile information has been updated successfully.
            </p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Changes Made:</strong><br>
                ${changesText}
              </p>
            </div>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Updated Profile:</strong><br>
                <strong>Name:</strong> ${name}<br>
                <strong>Email:</strong> ${email}<br>
                <strong>Phone:</strong> ${phone_number || 'N/A'}<br>
                <strong>Updated At:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
            <p style="color: #dc3545; font-size: 14px;">
              ⚠️ If you did NOT make these changes, please contact IT support immediately!
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 12px;">
              Ethiopian Statistical Service IT Help Desk
            </p>
          </div>
        </div>
      `;
      
      const mailOptions = {
        from: '"IT Help Desk" <hussenseid670@gmail.com>',
        to: existingUser.email,
        subject: '📝 Profile Updated - IT Help Desk',
        html: profileUpdateHtml
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`✅ Profile update email sent to: ${existingUser.email}`);
      
      // If email changed, also send to new email
      if (email !== existingUser.email) {
        const mailOptions2 = {
          from: '"IT Help Desk" <hussenseid670@gmail.com>',
          to: email,
          subject: '📝 Email Address Updated - IT Help Desk',
          html: profileUpdateHtml
        };
        await transporter.sendMail(mailOptions2);
        console.log(`✅ Profile update email also sent to new email: ${email}`);
      }
    } catch (emailError) {
      console.error('❌ Profile update email failed:', emailError.message);
    }

    // 🔥 NOTIFY ADMIN
    try {
      await notifyAdmin('📝 User Profile Updated', 
        `${existingUser.name} updated their profile information.`, {
        userName: name,
        userEmail: email,
        action: 'profile_update'
      });
    } catch (adminEmailError) {
      console.error('❌ Admin notification failed:', adminEmailError.message);
    }
    
    const updatedUser = await db.collection('users').findOne(
      { user_id: parseInt(userId) },
      { projection: { password: 0 } }
    );
    
    console.log(`✅ Profile updated successfully for userId: ${userId}`);
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
    });
    
  } catch (error) {
    console.error(`❌ Profile update error:`, error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// Change password endpoint (FIXED ROUTE - BOTH VERSIONS FOR COMPATIBILITY)
// Change password endpoint - WITH EMAIL NOTIFICATION
app.put('/api/change-password', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { user_id, current_password, new_password, confirm_password } = req.body;
    
    console.log(`🔐 Change password request for userId: ${user_id} by user ${req.user.id}`);
    
    if (req.user.id !== parseInt(user_id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (!user_id || !current_password || !new_password || !confirm_password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    if (new_password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'New passwords do not match' });
    }
    
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    const user = await db.collection('users').findOne({ user_id: parseInt(user_id) });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const isCurrentPasswordValid = await bcrypt.compare(current_password, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await db.collection('users').updateOne(
      { user_id: parseInt(user_id) },
      { $set: { password: hashedPassword, updated_at: new Date() } }
    );
    
    // 🔥 SEND PASSWORD CHANGE EMAIL
    try {
      const passwordChangeHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="background: #ffc107; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: #333; margin: 0;">🔐 Password Changed</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">Hello ${user.name},</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              Your password has been successfully changed.
            </p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Email:</strong> ${user.email}<br>
                <strong>Changed At:</strong> ${new Date().toLocaleString()}<br>
                <strong>IP Address:</strong> ${req.ip || 'Unknown'}
              </p>
            </div>
            <p style="color: #dc3545; font-size: 14px; font-weight: bold;">
              ⚠️ If you did NOT make this change, please contact IT support immediately!
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 12px;">
              Ethiopian Statistical Service IT Help Desk<br>
              This is an automated security notification.
            </p>
          </div>
        </div>
      `;
      
      const mailOptions = {
        from: '"IT Help Desk Security" <hussenseid670@gmail.com>',
        to: user.email,
        subject: '🔐 Password Changed - IT Help Desk',
        html: passwordChangeHtml
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`✅ Password change email sent to: ${user.email}`);
    } catch (emailError) {
      console.error('❌ Password change email failed:', emailError.message);
    }

    // 🔥 NOTIFY ADMIN
    try {
      await notifyAdmin('🔐 User Password Changed', 
        `${user.name} (${user.email}) has changed their password.`, {
        userName: user.name,
        userEmail: user.email,
        action: 'password_change'
      });
    } catch (adminEmailError) {
      console.error('❌ Admin notification failed:', adminEmailError.message);
    }
    
    console.log(`✅ Password changed successfully for userId: ${user_id}`);
    res.json({ success: true, message: 'Password changed successfully' });
    
  } catch (error) {
    console.error(`❌ Change password error:`, error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// Alternative change password endpoint with URL parameter (for compatibility)
app.put('/api/change-password/:userId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { userId } = req.params;
    const { current_password, new_password, confirm_password } = req.body;
    
    console.log(`🔐 Change password request for userId: ${userId} by user ${req.user.id}`);
    
    // Check permissions
    if (req.user.id !== parseInt(userId)) {
      console.log(`❌ Access denied: User ${req.user.id} cannot change password for user ${userId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (!current_password || !new_password || !confirm_password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    if (new_password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'New passwords do not match' });
    }
    
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    const user = await db.collection('users').findOne({ user_id: parseInt(userId) });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const isCurrentPasswordValid = await bcrypt.compare(current_password, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await db.collection('users').updateOne(
      { user_id: parseInt(userId) },
      { $set: { password: hashedPassword, updated_at: new Date() } }
    );
    
    console.log(`✅ Password changed successfully for userId: ${userId}`);
    res.json({ success: true, message: 'Password changed successfully' });
    
  } catch (error) {
    console.error(`❌ Change password error for userId: ${req.params.userId}:`, error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// ========== ENHANCED ATTACHMENT ROUTES ==========

// Get attachment metadata and content for viewing
app.get('/api/tickets/:ticketId/attachment-meta', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    console.log(`📎 Fetching attachment metadata for ticket ${ticketId}`);
    
    const ticket = await db.collection('tickets').findOne({ 
      ticket_id: parseInt(ticketId) 
    });
    
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    if (!ticket.attachment) {
      return res.status(404).json({ success: false, message: 'No attachment found for this ticket' });
    }
    
    // Check permissions
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (req.user.role === 'senior' && ticket.team_id !== req.user.team_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const attachmentPath = ticket.attachment;
    const fullPath = path.join(__dirname, attachmentPath);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.log(`❌ Attachment file not found: ${fullPath}`);
      return res.status(404).json({ success: false, message: 'Attachment file not found on server' });
    }
    
    const stats = fs.statSync(fullPath);
    const fileExtension = path.extname(attachmentPath).toLowerCase();
    
    let fileType = 'unknown';
    let canPreview = false;
    
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(fileExtension)) {
      fileType = 'image';
      canPreview = true;
    } else if (fileExtension === '.pdf') {
      fileType = 'pdf';
      canPreview = true;
    } else if (['.doc', '.docx', '.txt'].includes(fileExtension)) {
      fileType = 'document';
      canPreview = false; // Can't preview in browser directly
    }
    
    const metadata = {
      filename: path.basename(attachmentPath),
      fileType: fileType,
      fileSize: stats.size,
      fileExtension: fileExtension,
      uploadDate: ticket.created_at,
      canPreview: canPreview,
      mimeType: getMimeType(fileExtension)
    };
    
    console.log(`✅ Attachment metadata found for ticket ${ticketId}:`, metadata);
    
    res.json({
      success: true,
      metadata: metadata
    });
    
  } catch (error) {
    console.error('❌ Attachment metadata error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch attachment metadata: ' + error.message 
    });
  }
});

// Get attachment data for viewing (returns base64 encoded file)
app.get('/api/tickets/:ticketId/attachment-view', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    console.log(`👀 Viewing attachment for ticket ${ticketId}`);
    
    const ticket = await db.collection('tickets').findOne({ 
      ticket_id: parseInt(ticketId) 
    });
    
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    if (!ticket.attachment) {
      return res.status(404).json({ success: false, message: 'No attachment found for this ticket' });
    }
    
    // Check permissions
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (req.user.role === 'senior' && ticket.team_id !== req.user.team_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const attachmentPath = ticket.attachment;
    const fullPath = path.join(__dirname, attachmentPath);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.log(`❌ Attachment file not found: ${fullPath}`);
      return res.status(404).json({ success: false, message: 'Attachment file not found on server' });
    }
    
    const fileExtension = path.extname(attachmentPath).toLowerCase();
    const mimeType = getMimeType(fileExtension);
    
    // Read file as base64 for easy display in frontend
    const fileBuffer = fs.readFileSync(fullPath);
    const base64Data = fileBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    
    console.log(`✅ Attachment prepared for viewing: ${fullPath}`);
    
    res.json({
      success: true,
      data: dataUrl,
      filename: path.basename(attachmentPath),
      mimeType: mimeType,
      fileExtension: fileExtension
    });
    
  } catch (error) {
    console.error('❌ Attachment view error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load attachment: ' + error.message 
    });
  }
});

// Download attachment file (original functionality)
app.get('/api/tickets/:ticketId/attachment', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    console.log(`📥 Downloading attachment for ticket ${ticketId}`);
    
    const ticket = await db.collection('tickets').findOne({ 
      ticket_id: parseInt(ticketId) 
    });
    
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    if (!ticket.attachment) {
      return res.status(404).json({ success: false, message: 'No attachment found for this ticket' });
    }
    
    // Check permissions
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (req.user.role === 'senior' && ticket.team_id !== req.user.team_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const attachmentPath = ticket.attachment;
    const fullPath = path.join(__dirname, attachmentPath);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.log(`❌ Attachment file not found: ${fullPath}`);
      return res.status(404).json({ success: false, message: 'Attachment file not found on server' });
    }
    
    const filename = path.basename(attachmentPath);
    const fileExtension = path.extname(attachmentPath).toLowerCase();
    const mimeType = getMimeType(fileExtension);
    
    console.log(`✅ Serving attachment file: ${fullPath}`);
    
    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', mimeType);
    
    // Stream the file to the client
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('❌ File stream error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error streaming file: ' + error.message 
      });
    });
    
  } catch (error) {
    console.error('❌ Attachment download error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to download attachment: ' + error.message 
    });
  }
});

// Helper function to get MIME type
function getMimeType(fileExtension) {
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain'
  };
  
  return mimeTypes[fileExtension] || 'application/octet-stream';
}

// ========== FIXED DELETE TICKET ROUTE (No Transactions) ==========




// Delete ticket - ENHANCED WITH EMAIL NOTIFICATIONS
app.delete('/api/tickets/:ticketId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    console.log(`🗑️ Delete ticket request: ${ticketId} by user ${req.user.id}`);

    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    const canDelete = req.user.role === 'admin' || 
                     ticket.user_id === req.user.id || 
                     (req.user.role === 'senior' && ticket.team_id === req.user.team_id);
    
    if (!canDelete) {
      console.log(`❌ Delete denied: User ${req.user.id} cannot delete ticket ${ticketId}`);
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only ticket owner, admin, or senior officer from the same team can delete tickets.' 
      });
    }

    try {
      // Delete comments without transaction
      const commentsResult = await db.collection('comments').deleteMany({ ticket_id: parseInt(ticketId) });
      console.log(`✅ Comments deleted for ticket ${ticketId}: ${commentsResult.deletedCount} comments`);
      
      // Delete logs without transaction
      const logsResult = await db.collection('ticket_logs').deleteMany({ ticket_id: parseInt(ticketId) });
      console.log(`✅ Logs deleted for ticket ${ticketId}: ${logsResult.deletedCount} logs`);
      
      // Delete notifications related to this ticket
      const notificationsResult = await db.collection('notifications').deleteMany({ related_ticket_id: parseInt(ticketId) });
      console.log(`✅ Notifications deleted for ticket ${ticketId}: ${notificationsResult.deletedCount} notifications`);
      
      // Delete the ticket
      const result = await db.collection('tickets').deleteOne({ ticket_id: parseInt(ticketId) });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      
      console.log(`✅ Ticket ${ticketId} deleted successfully`);

      // 🔔 SEND EMAIL NOTIFICATION FOR TICKET DELETION
      await createComprehensiveNotification({
        user_id: ticket.user_id,
        title: 'Ticket Deleted',
        message: `Your ticket #${ticketId} has been deleted by ${req.user.name}.`,
        type: 'ticket_deleted',
        related_ticket_id: parseInt(ticketId),
        priority: 'high'
      });

      // Notify assigned officer if exists
      if (ticket.assigned_to && ticket.assigned_to !== ticket.user_id) {
        await createComprehensiveNotification({
          user_id: ticket.assigned_to,
          title: 'Assigned Ticket Deleted',
          message: `Ticket #${ticketId} that was assigned to you has been deleted by ${req.user.name}.`,
          type: 'ticket_deleted',
          related_ticket_id: parseInt(ticketId),
          priority: 'medium'
        });
      }
      
      res.json({
        success: true,
        message: 'Ticket deleted successfully',
      });
    } catch (error) {
      console.error('❌ Error during ticket deletion:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Delete ticket error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during ticket deletion: ' + error.message 
    });
  }
});








// ========== FIXED DELETE ACCOUNT ROUTE ==========

// Delete user account endpoint - WITH EMAIL NOTIFICATIONS
// Delete user account endpoint - WITH EMAIL NOTIFICATIONS
app.delete('/api/profile/:userId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { userId } = req.params;
    const { confirmation } = req.body;
    
    console.log(`🗑️ Delete account request for userId: ${userId} by user ${req.user.id}`);
    
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (!confirmation || confirmation !== 'DELETE') {
      return res.status(400).json({ 
        success: false, 
        message: 'Confirmation required. Please type DELETE to confirm account deletion.' 
      });
    }
    
    const user = await db.collection('users').findOne({ user_id: parseInt(userId) });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (parseInt(userId) === req.user.id && req.user.role === 'admin') {
      return res.status(400).json({ 
        success: false, 
        message: 'Admin cannot delete their own account. Contact another admin.' 
      });
    }
    
    try {
      // Delete user's comments
      await db.collection('comments').deleteMany({ author_id: parseInt(userId) });
      
      // Delete user's ticket logs
      await db.collection('ticket_logs').deleteMany({ changed_by: parseInt(userId) });
      
      // Delete user's notifications
      await db.collection('notifications').deleteMany({ user_id: parseInt(userId) });
      
      // Unassign tickets assigned to this user
      await db.collection('tickets').updateMany(
        { assigned_to: parseInt(userId) }, 
        { $set: { assigned_to: null } }
      );
      
      // Delete tickets created by this user
      await db.collection('tickets').deleteMany({ user_id: parseInt(userId) });
      
      // Delete the user
      const result = await db.collection('users').deleteOne({ user_id: parseInt(userId) });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      // Delete user's avatar if exists
      if (user.avatar_path && user.avatar_path !== 'assets/default_avatar.png') {
        const avatarPath = path.join(__dirname, user.avatar_path);
        if (fs.existsSync(avatarPath)) {
          fs.unlinkSync(avatarPath);
        }
      }
      
      console.log(`✅ Account deleted successfully for userId: ${userId}`);

      // 🔥 SEND ACCOUNT DELETION EMAIL TO USER
      try {
        const deletionHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <div style="background: #dc3545; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">Account Deleted</h1>
            </div>
            <div style="padding: 20px;">
              <h2 style="color: #333;">Goodbye ${user.name},</h2>
              <p style="font-size: 16px; color: #555; line-height: 1.6;">
                Your account has been successfully deleted from the IT Help Desk System.
              </p>
              <p style="color: #888; font-size: 14px;">
                If you did not request this deletion, please contact the administrator immediately.
              </p>
            </div>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
              <p style="margin: 0; color: #666; font-size: 12px;">
                Ethiopian Statistical Service IT Help Desk
              </p>
            </div>
          </div>
        `;
        
        const mailOptions = {
          from: '"IT Help Desk" <hussenseid670@gmail.com>',
          to: user.email,
          subject: 'Account Deleted - IT Help Desk',
          html: deletionHtml
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`✅ Account deletion email sent to: ${user.email}`);
      } catch (emailError) {
        console.error('❌ Deletion email failed:', emailError.message);
      }

      // 🔥 NOTIFY ADMIN ABOUT ACCOUNT DELETION
      try {
        await notifyAdmin('User Account Deleted', 
          `A user account has been deleted from the IT Help Desk System.`, {
          userName: user.name,
          userEmail: user.email,
          action: 'account_deletion'
        });
        console.log(`✅ Admin notified about account deletion: ${user.name}`);
      } catch (adminEmailError) {
        console.error('❌ Admin notification failed:', adminEmailError.message);
      }
      
      res.json({ 
        success: true, 
        message: 'Account deleted successfully' 
      });
      
    } catch (error) {
      console.error('❌ Error during account deletion:', error);
      throw error;
    }
  } catch (error) {
    console.error(`❌ Delete account error for userId: ${req.params.userId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during account deletion: ' + error.message 
    });
  }
});



// ========== FIXED DELETE USER'S TICKETS ROUTE ==========

// Delete user's tickets endpoint - FIXED VERSION
app.delete('/api/tickets/user/:userId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { userId } = req.params;
    const { confirmation } = req.body;
    
    console.log(`🎫 Delete tickets request for userId: ${userId} by user ${req.user.id}`);
    
    // Check permissions - users can only delete their own tickets, admins can delete any
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      console.log(`❌ Access denied: User ${req.user.id} cannot delete tickets of user ${userId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (!confirmation || confirmation !== 'DELETE') {
      return res.status(400).json({ 
        success: false, 
        message: 'Confirmation required. Please type DELETE to confirm ticket deletion.' 
      });
    }
    
    const user = await db.collection('users').findOne({ user_id: parseInt(userId) });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    try {
      // Delete user's tickets
      const ticketsResult = await db.collection('tickets').deleteMany({ user_id: parseInt(userId) });
      
      console.log(`✅ ${ticketsResult.deletedCount} tickets deleted for userId: ${userId}`);
      
      // Also delete associated comments, logs, and notifications
      await db.collection('comments').deleteMany({ author_id: parseInt(userId) });
      await db.collection('ticket_logs').deleteMany({ changed_by: parseInt(userId) });
      await db.collection('notifications').deleteMany({ user_id: parseInt(userId) });
      
      res.json({ 
        success: true, 
        message: `${ticketsResult.deletedCount} tickets deleted successfully`,
        deletedCount: ticketsResult.deletedCount
      });
      
    } catch (error) {
      console.error('❌ Error during tickets deletion:', error);
      throw error;
    }
  } catch (error) {
    console.error(`❌ Delete tickets error for userId: ${req.params.userId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
});

// ========== ADMIN DASHBOARD ROUTES ==========

// Get system statistics for admin dashboard
app.get('/api/admin/system-stats', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    console.log('📊 Fetching system statistics for admin dashboard');
    
    // Get total counts
    const totalUsers = await db.collection('users').countDocuments();
    const totalTickets = await db.collection('tickets').countDocuments();
    const totalSeniorOfficers = await db.collection('users').countDocuments({ role: 'senior' });
    const totalNotifications = await db.collection('notifications').countDocuments();
    
    // Calculate average response time (simplified)
    const ticketsWithResponse = await db.collection('tickets').aggregate([
      { $match: { assigned_at: { $exists: true } } },
      {
        $project: {
          responseTime: { $subtract: ['$assigned_at', '$created_at'] }
        }
      }
    ]).toArray();
    
    const avgResponseMs = ticketsWithResponse.length > 0 
      ? ticketsWithResponse.reduce((sum, ticket) => sum + ticket.responseTime, 0) / ticketsWithResponse.length 
      : 0;
    
    const avgResponseTime = formatResponseTime(avgResponseMs);
    
    // Calculate SLA compliance (simplified - 95% of tickets responded within 2 hours)
    const slaCompliantTickets = await db.collection('tickets').countDocuments({
      assigned_at: { $exists: true },
      $expr: { $lte: [{ $subtract: ['$assigned_at', '$created_at'] }, 2 * 60 * 60 * 1000] } // 2 hours in milliseconds
    });
    
    const slaCompliance = totalTickets > 0 ? Math.round((slaCompliantTickets / totalTickets) * 100) : 100;
    
    // User satisfaction (placeholder - would come from ratings in a real system)
    const userSatisfaction = 92; // Placeholder percentage
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        totalTickets,
        totalSeniorOfficers,
        totalNotifications,
        avgResponseTime,
        slaCompliance,
        userSatisfaction,
        systemUptime: '99.9%',
        databasePerformance: 'Optimal'
      }
    });
  } catch (error) {
    console.error('❌ System stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch system statistics' });
  }
});

// Get recent system activity
app.get('/api/admin/recent-activity', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    console.log('📋 Fetching recent system activity');
    
    // Get recent ticket logs
    const recentLogs = await db.collection('ticket_logs')
      .find()
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();
    
    // Get recent user activity
    const recentUsers = await db.collection('users')
      .find({}, { projection: { name: 1, last_login: 1 } })
      .sort({ last_login: -1 })
      .limit(5)
      .toArray();
    
    // Get recent notifications
    const recentNotifications = await db.collection('notifications')
      .find()
      .sort({ created_at: -1 })
      .limit(5)
      .toArray();
    
    const activity = [
      ...recentLogs.map(log => ({
        type: 'update',
        description: `Ticket #${log.ticket_id}: ${log.change_description}`,
        timestamp: log.created_at
      })),
      ...recentUsers.filter(user => user.last_login).map(user => ({
        type: 'login',
        description: `${user.name} logged in`,
        timestamp: user.last_login
      })),
      ...recentNotifications.map(notification => ({
        type: 'notification',
        description: `Notification: ${notification.title}`,
        timestamp: notification.created_at
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);
    
    res.json({
      success: true,
      activity
    });
  } catch (error) {
    console.error('❌ Recent activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recent activity' });
  }
});

// Helper function to format response time
function formatResponseTime(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return '< 1m';
  }
}

// ========== ADMIN USER MANAGEMENT ROUTES ==========

// Update user by ID (for admin)
app.put('/api/admin/users/:userId', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone_number, role, team_id, password } = req.body;
    
    console.log(`🔄 [PUT] Update user ${userId} by admin ${req.user.id}:`, {
      name, email, phone_number, role, team_id, password: password ? '***' : 'not provided'
    });

    // Check if user exists
    const user = await db.collection('users').findOne({ user_id: parseInt(userId) });
    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updateFields = {
  name,
  email,
  phone_number: phone_number || null,
  role,
  department: req.body.department || '',   // ADD THIS LINE
  position: req.body.position || '',       // ADD THIS LINE
  team_id: team_id ? parseInt(team_id) : null,
  updated_at: new Date()
};

    // Check if email is already taken by another user
    if (email && email !== user.email) {
      const existingUser = await db.collection('users').findOne({ 
        email, 
        user_id: { $ne: parseInt(userId) } 
      });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already taken by another user' });
      }
    }

    // Update password if provided
    if (password && password.trim() !== '') {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.password = hashedPassword;
    }

    const result = await db.collection('users').updateOne(
      { user_id: parseInt(userId) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(`✅ User ${userId} updated successfully by admin ${req.user.id}`);

    // Get updated user
    const updatedUser = await db.collection('users').findOne(
      { user_id: parseInt(userId) },
      { projection: { password: 0 } }
    );

    res.json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});


































// // Delete user by ID (for admin) - FIXED VERSION without transactions
// // Delete user by ID (for admin) - WITH EMAIL TO BOTH USER AND ADMIN
// app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
//   try {
//     const { userId } = req.params;
    
//     console.log(`🗑️ [DELETE] Delete user ${userId} by admin ${req.user.id}`);

//     // Check if user exists
//     const user = await db.collection('users').findOne({ user_id: parseInt(userId) });
//     if (!user) {
//       console.log(`❌ User ${userId} not found`);
//       return res.status(404).json({ success: false, message: 'User not found' });
//     }

//     // Prevent admin from deleting themselves
//     if (parseInt(userId) === req.user.id) {
//       return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
//     }

//     // Store user info before deletion for email
//     const deletedUserName = user.name;
//     const deletedUserEmail = user.email;
//     const deletedUserRole = user.role;
//     const adminName = req.user.name;
//     const adminEmail = req.user.email;

//     try {
//       // Delete user's comments
//       await db.collection('comments').deleteMany({ author_id: parseInt(userId) });
//       console.log(`✅ Comments deleted for user ${userId}`);
      
//       // Delete user's ticket logs
//       await db.collection('ticket_logs').deleteMany({ changed_by: parseInt(userId) });
//       console.log(`✅ Logs deleted for user ${userId}`);
      
//       // Delete user's notifications
//       await db.collection('notifications').deleteMany({ user_id: parseInt(userId) });
//       console.log(`✅ Notifications deleted for user ${userId}`);
      
//       // Unassign tickets assigned to this user
//       await db.collection('tickets').updateMany(
//         { assigned_to: parseInt(userId) }, 
//         { $set: { assigned_to: null } }
//       );
//       console.log(`✅ Tickets unassigned from user ${userId}`);
      
//       // Delete tickets created by this user
//       await db.collection('tickets').deleteMany({ user_id: parseInt(userId) });
//       console.log(`✅ Tickets deleted for user ${userId}`);
      
//       // Delete the user
//       const result = await db.collection('users').deleteOne({ user_id: parseInt(userId) });
      
//       if (result.deletedCount === 0) {
//         throw new Error('User not found');
//       }
      
//       // Delete avatar file if exists
//       if (user.avatar_path && user.avatar_path !== 'assets/default_avatar.png') {
//         const avatarFullPath = path.join(__dirname, user.avatar_path);
//         if (fs.existsSync(avatarFullPath)) {
//           fs.unlinkSync(avatarFullPath);
//           console.log(`✅ Avatar file deleted: ${user.avatar_path}`);
//         }
//       }
      
//       console.log(`✅ User ${userId} deleted successfully`);

//       // 🔥 SEND EMAIL TO THE DELETED USER
//       try {
//         const deletionHtml = `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
//             <div style="background: #dc3545; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
//               <h1 style="color: white; margin: 0;">🗑️ Account Deleted</h1>
//             </div>
//             <div style="padding: 20px;">
//               <h2 style="color: #333;">Hello ${deletedUserName},</h2>
//               <p style="font-size: 16px; color: #555; line-height: 1.6;">
//                 Your account has been deleted from the IT Help Desk System by an administrator.
//               </p>
//               <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                 <p style="margin: 0; color: #666; font-size: 14px;">
//                   <strong>Deleted Account:</strong><br>
//                   <strong>Name:</strong> ${deletedUserName}<br>
//                   <strong>Email:</strong> ${deletedUserEmail}<br>
//                   <strong>Role:</strong> ${deletedUserRole}<br>
//                   <strong>Deleted By:</strong> ${adminName} (Admin)<br>
//                   <strong>Deleted At:</strong> ${new Date().toLocaleString()}
//                 </p>
//               </div>
//               <p style="color: #dc3545; font-size: 14px;">
//                 ⚠️ If you believe this was a mistake, please contact the IT Help Desk immediately.
//               </p>
//               <p style="color: #888; font-size: 14px;">
//                 All your tickets, comments, and data have been removed from the system.
//               </p>
//             </div>
//             <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
//               <p style="margin: 0; color: #666; font-size: 12px;">
//                 Ethiopian Statistical Service IT Help Desk
//               </p>
//             </div>
//           </div>
//         `;
        
//         const mailOptions = {
//           from: '"IT Help Desk" <hussenseid670@gmail.com>',
//           to: deletedUserEmail,
//           subject: '🗑️ Account Deleted - IT Help Desk',
//           html: deletionHtml
//         };
        
//         await transporter.sendMail(mailOptions);
//         console.log(`✅ Account deletion email sent to deleted user: ${deletedUserEmail}`);
//       } catch (emailError) {
//         console.error('❌ Deletion email to user failed:', emailError.message);
//       }

//       // 🔥 SEND EMAIL TO THE ADMIN WHO DELETED THE USER
//       try {
//         const adminNotificationHtml = `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
//             <div style="background: #dc3545; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
//               <h1 style="color: white; margin: 0;">🗑️ User Account Deleted</h1>
//             </div>
//             <div style="padding: 20px;">
//               <h2 style="color: #333;">Hello ${adminName},</h2>
//               <p style="font-size: 16px; color: #555; line-height: 1.6;">
//                 You have successfully deleted a user account from the IT Help Desk System.
//               </p>
//               <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                 <p style="margin: 0; color: #666; font-size: 14px;">
//                   <strong>Deleted User Details:</strong><br>
//                   <strong>Name:</strong> ${deletedUserName}<br>
//                   <strong>Email:</strong> ${deletedUserEmail}<br>
//                   <strong>Role:</strong> ${deletedUserRole}<br>
//                   <strong>User ID:</strong> ${userId}<br>
//                   <strong>Deleted By:</strong> ${adminName} (You)<br>
//                   <strong>Deleted At:</strong> ${new Date().toLocaleString()}
//                 </p>
//               </div>
//               <p style="color: #888; font-size: 14px;">
//                 All associated data (tickets, comments, logs) has been removed from the system.
//               </p>
//             </div>
//             <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
//               <p style="margin: 0; color: #666; font-size: 12px;">
//                 Ethiopian Statistical Service IT Help Desk - Admin Confirmation
//               </p>
//             </div>
//           </div>
//         `;
        
//         const adminMailOptions = {
//           from: '"IT Help Desk" <hussenseid670@gmail.com>',
//           to: adminEmail || 'seidhussen0729@gmail.com',
//           subject: `🗑️ User Deleted: ${deletedUserName} (${deletedUserEmail})`,
//           html: adminNotificationHtml
//         };
        
//         await transporter.sendMail(adminMailOptions);
//         console.log(`✅ Deletion confirmation email sent to admin: ${adminEmail}`);
//       } catch (emailError) {
//         console.error('❌ Admin deletion email failed:', emailError.message);
//       }

//       // 🔥 ALSO NOTIFY SUPER ADMIN (seidhussen0729@gmail.com)
//       try {
//         await notifyAdmin('🗑️ User Account Deleted by Admin', 
//           `Admin ${adminName} deleted user account: ${deletedUserName} (${deletedUserEmail}).`, {
//           userName: deletedUserName,
//           userEmail: deletedUserEmail,
//           action: 'admin_deleted_user'
//         });
//         console.log('✅ Super admin notified about user deletion');
//       } catch (superAdminEmailError) {
//         console.error('❌ Super admin notification failed:', superAdminEmailError.message);
//       }
      
//       res.json({
//         success: true,
//         message: 'User deleted successfully',
//       });
//     } catch (error) {
//       console.error('❌ Error during user deletion:', error);
//       throw error;
//     }
//   } catch (error) {
//     console.error('❌ Delete user error:', error);
//     res.status(500).json({ 
//       success: false, 
//       message: 'Server error during user deletion: ' + error.message 
//     });
//   }
// });



// Delete user by ID (for admin) - WITH BACKUP AND EMAIL
// Delete user by ID (for admin) - FAST VERSION WITH BACKUP
// Delete user by ID (for admin) - SUPER FAST VERSION
app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`🗑️ FAST DELETE: User ${userId} by admin ${req.user.name}`);

    const user = await db.collection('users').findOne({ user_id: parseInt(userId) });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    // 💾 Quick backup (non-blocking - do in background)
    backupUserDataFast(userId, req.user.id, req.user.name).catch(e => console.error('Backup error:', e));

    // 🗑️ DELETE ALL IN PARALLEL - SUPER FAST
    await Promise.all([
      db.collection('comments').deleteMany({ author_id: parseInt(userId) }),
      db.collection('ticket_logs').deleteMany({ changed_by: parseInt(userId) }),
      db.collection('notifications').deleteMany({ user_id: parseInt(userId) }),
      db.collection('tickets').updateMany({ assigned_to: parseInt(userId) }, { $set: { assigned_to: null } }),
      db.collection('tickets').deleteMany({ user_id: parseInt(userId) }),
      db.collection('procurement_requests').deleteMany({ requested_by: parseInt(userId).toString() }),
    ]);
    
    const result = await db.collection('users').deleteOne({ user_id: parseInt(userId) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found during deletion' });
    }
    
    // Delete avatar if exists (non-blocking)
    if (user.avatar_path && user.avatar_path !== 'assets/default_avatar.png') {
      const avatarFullPath = path.join(__dirname, user.avatar_path);
      if (fs.existsSync(avatarFullPath)) fs.unlinkSync(avatarFullPath);
    }
    
    console.log(`✅ User ${userId} deleted in milliseconds`);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// Quick backup function
async function backupUserDataFast(userId, deletedBy, deletedByName) {
  try {
    const user = await db.collection('users').findOne({ user_id: parseInt(userId) });
    if (!user) return;
    
    const backupDoc = {
      user_id: parseInt(userId),
      user_data: { ...user },
      deleted_by: deletedBy,
      deleted_by_name: deletedByName || 'Admin',
      deleted_at: new Date(),
      restored: false
    };
    
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    if (!collectionNames.includes('user_backups')) {
      await db.createCollection('user_backups');
    }
    
    await db.collection('user_backups').insertOne(backupDoc);
    console.log(`💾 Backup saved for user ${userId}`);
  } catch (error) {
    console.error('Quick backup error:', error);
  }
}

// Background email function
async function sendDeleteEmails(deletedUser, adminUser, backupId) {
  try {
    const mailOptions = {
      from: '"IT Help Desk" <hussenseid670@gmail.com>',
      to: deletedUser.email,
      subject: 'Account Deleted - IT Help Desk',
      html: `<h2>Account Deleted</h2><p>Hello ${deletedUser.name}, your account has been deleted. Backup ID: ${backupId}</p>`
    };
    await transporter.sendMail(mailOptions);
  } catch (e) { /* ignore */ }
}













// Get all users for admin with filtering
app.get('/api/admin/users', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
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

// ========== AUTHENTICATED ROUTES ==========

// Forgot Password endpoint
app.post('/api/auth/forgot-password', requireDatabase, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    console.log(`📧 Password reset requested for: ${email}`);

    // Check if user exists
    const user = await db.collection('users').findOne({ email });
    
    // For security, return same message whether user exists or not
    const successMessage = 'If an account with that email exists, password reset instructions have been sent to your email.';

    if (!user) {
      console.log(`❌ No user found with email: ${email}`);
      return res.json({ success: true, message: successMessage });
    }
    
    // Generate reset token
    const resetToken = jwt.sign(
      { 
        id: user.user_id, 
        email: user.email, 
        type: 'password_reset' 
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create reset link
    const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;

    // Email content
    const mailOptions = {
      from: '"IT Help Desk" <noreply@ethiopianstatisticalservice.com>',
      to: email,
      subject: 'Password Reset Request - IT Help Desk',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007bff;">Password Reset Request</h2>
          <p>Hello ${user.name},</p>
          <p>You requested to reset your password for the IT Help Desk system.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Your Password
            </a>
          </div>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this reset, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            Ethiopian Statistical Service IT Help Desk<br>
            This is an automated message, please do not reply.
          </p>
        </div>
      `
    };

    // Send email
    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Password reset email sent to: ${email}`);
      
      res.json({
        success: true,
        message: successMessage
      });
    } catch (emailError) {
      console.error('❌ Failed to send email:', emailError);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send reset email. Please try again later.' 
      });
    }

  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during password reset request' 
    });
  }
});

// Reset Password endpoint
app.post('/api/auth/reset-password', requireDatabase, async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Verify the token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    if (decoded.type !== 'password_reset') {
      return res.status(400).json({ success: false, message: 'Invalid token type' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await db.collection('users').updateOne(
      { user_id: decoded.id },
      { $set: { password: hashedPassword } }
    );

    console.log(`✅ Password reset successful for user ID: ${decoded.id}`);

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during password reset' 
    });
  }
});

// Test AI classification endpoint
app.post('/api/test-classification', async (req, res) => {
  const { description } = req.body;
  
  if (!description) {
    return res.status(400).json({ success: false, message: 'Description is required' });
  }

  try {
    const classifications = enhancedClassifier.getClassifications(description);
    const topCategory = classifications[0].label;
    const confidence = classifications[0].value;

    res.json({
      success: true,
      issue_type: topCategory,
      confidence: confidence,
      all_classifications: classifications
    });
  } catch (error) {
    console.error('Test classification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all teams
app.get('/api/teams', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const teams = await db.collection('teams').find().sort({ team_id: 1 }).toArray();
    res.json({ success: true, teams });
  } catch (error) {
    console.error('Get teams error at:', new Date().toISOString(), error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get available teams for senior officers
app.get('/api/teams/available', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const teams = await db.collection('teams').aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'team_id',
          foreignField: 'team_id',
          as: 'senior_officers'
        }
      },
      {
        $match: {
          'senior_officers.role': { $ne: 'senior' }
        }
      },
      {
        $project: {
          team_id: 1,
          team_name: 1
        }
      }
    ]).toArray();
    
    res.json({ success: true, teams });
  } catch (error) {
    console.error('Get available teams error at:', new Date().toISOString(), error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get tickets with proper team filtering
app.get('/api/tickets', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { user_id, team_id } = req.query;
    
    let matchStage = {};
    
    if (user_id && (req.user.id === parseInt(user_id) || req.user.role === 'admin' || req.user.role === 'senior')) {
      matchStage.user_id = parseInt(user_id);
    } else if (team_id && req.user.role === 'senior' && req.user.team_id === parseInt(team_id)) {
      matchStage.team_id = parseInt(team_id);
    } else if (req.user.role === 'senior') {
      matchStage.team_id = req.user.team_id;
    } else if (req.user.role === 'admin') {
      // No filter for admin
    } else {
      matchStage.user_id = req.user.id;
    }
    
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
          team_name: '$team_info.team_name'
        }
      },
      { $sort: { created_at: -1 } }
    ]).toArray();
    
    res.json({
      success: true,
      tickets: tickets,
    });
  } catch (error) {
    console.error('Fetch tickets error at:', new Date().toISOString(), error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single ticket
app.get('/api/tickets/:ticketId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    const tickets = await db.collection('tickets').aggregate([
      { $match: { ticket_id: parseInt(ticketId) } },
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
          team_name: '$team_info.team_name'
        }
      }
    ]).toArray();
    
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    const ticket = tickets[0];
    
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (req.user.role === 'senior' && ticket.team_id !== req.user.team_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    res.json({
      success: true,
      ticket: ticket,
    });
  } catch (error) {
    console.error('Fetch ticket error at:', new Date().toISOString(), error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});







// FIXED: Update ticket with comprehensive notifications
// FIXED: Update ticket with proper team reassignment
app.put('/api/tickets/:ticketId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { issue_type, description, priority, status, new_team_id, assigned_to, comment_text } = req.body;

    console.log(`🔄 [PUT] Update ticket ${ticketId} by user ${req.user.id}:`, {
      issue_type, 
      description: description ? description.substring(0, 50) + '...' : undefined, 
      priority, 
      status, 
      new_team_id,
      assigned_to,
      comment_text: comment_text ? comment_text.substring(0, 50) + '...' : undefined
    });

    // Check if ticket exists and user has permission
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      console.log(`❌ Ticket ${ticketId} not found`);
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    console.log(`📋 Current ticket state: Team ${ticket.team_id}, Assigned to: ${ticket.assigned_to}, Status: ${ticket.status}`);

    // Permission check
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      console.log(`❌ User ${req.user.id} cannot update ticket ${ticketId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (req.user.role === 'senior' && ticket.team_id !== req.user.team_id && req.user.role !== 'admin') {
      console.log(`❌ Senior officer from team ${req.user.team_id} cannot update ticket from team ${ticket.team_id}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const updateFields = {};
    let changeDescription = '';
    let hasChanges = false;

    // Handle team reassignment (CRITICAL FIX)
    if (new_team_id !== undefined && (req.user.role === 'admin' || req.user.role === 'senior')) {
      const currentTeamId = ticket.team_id ? ticket.team_id.toString() : '';
      const newTeamIdStr = new_team_id ? new_team_id.toString() : '';
      
      console.log(`🏢 Team reassignment: Current=${currentTeamId}, New=${newTeamIdStr}`);
      
      if (newTeamIdStr !== currentTeamId) {
        let newTeamId = null;
        let newTeamName = 'Unassigned';
        
        if (new_team_id) {
          const newTeamIdInt = parseInt(new_team_id);
          const team = await db.collection('teams').findOne({ team_id: newTeamIdInt });
          if (!team) {
            console.log(`❌ Invalid team: ${new_team_id}`);
            return res.status(400).json({ success: false, message: 'Invalid team selected' });
          }
          newTeamId = newTeamIdInt;
          newTeamName = team.team_name;
          console.log(`✅ Valid team found: ${newTeamName} (ID: ${newTeamId})`);
        }
        
        updateFields.team_id = newTeamId;
        
        // IMPORTANT: Clear assignment when changing teams
        updateFields.assigned_to = null;
        
        // Set status to Queued for the new team
        updateFields.status = 'Queued';
        updateFields.in_queue = true;
        updateFields.queue_position = null; // Will be recalculated
        updateFields.assigned_at = null;
        
        changeDescription = `Reassigned to ${newTeamName}`;
        hasChanges = true;
        
        console.log(`✅ Team reassignment: Ticket ${ticketId} moved to ${newTeamName}`);
      }
    }

    // Handle assignment (only if team is not changing or after team change)
    if (assigned_to !== undefined && !updateFields.hasOwnProperty('assigned_to')) {
      const currentAssignedTo = ticket.assigned_to ? ticket.assigned_to.toString() : '';
      const newAssignedToStr = assigned_to ? assigned_to.toString() : '';
      
      if (newAssignedToStr !== currentAssignedTo) {
        if (assigned_to) {
          const newAssignedToInt = parseInt(assigned_to);
          const officer = await db.collection('users').findOne({ 
            user_id: newAssignedToInt, 
            role: 'senior',
            team_id: ticket.team_id // Must be in same team
          });
          
          if (!officer) {
            console.log(`❌ Invalid officer: ${assigned_to} for team ${ticket.team_id}`);
            return res.status(400).json({ 
              success: false, 
              message: 'Invalid senior officer or officer not in this team' 
            });
          }
          
          updateFields.assigned_to = newAssignedToInt;
          updateFields.status = 'In Progress';
          updateFields.in_queue = false;
          updateFields.assigned_at = new Date();
          
          if (changeDescription) {
            changeDescription += ` and assigned to ${officer.name}`;
          } else {
            changeDescription = `Assigned to ${officer.name}`;
          }
          
          console.log(`✅ Assigned to officer: ${officer.name}`);
        } else {
          updateFields.assigned_to = null;
          updateFields.status = 'Queued';
          updateFields.in_queue = true;
          
          if (changeDescription) {
            changeDescription += ' and unassigned';
          } else {
            changeDescription = 'Unassigned';
          }
        }
        hasChanges = true;
      }
    }

    // Handle status update
    if (status && status !== ticket.status && (req.user.role === 'admin' || req.user.role === 'senior')) {
      updateFields.status = status;
      
      if (changeDescription) {
        changeDescription += ` and status changed to ${status}`;
      } else {
        changeDescription = `Status changed to ${status}`;
      }
      hasChanges = true;
      
      // Clear queue-related fields if no longer queued
      if (status !== 'Queued') {
        updateFields.in_queue = false;
        updateFields.queue_position = null;
        updateFields.estimated_wait_days = null;
      }
    }

    // Handle other updates (priority, issue_type, description)
    if (priority && priority !== ticket.priority) {
      updateFields.priority = priority;
      hasChanges = true;
      console.log(`📊 Priority change: ${ticket.priority} → ${priority}`);
    }

    if (issue_type && issue_type !== ticket.issue_type) {
      updateFields.issue_type = issue_type;
      hasChanges = true;
      console.log(`📝 Issue type change: ${ticket.issue_type} → ${issue_type}`);
    }

    if (description && description !== ticket.description) {
      updateFields.description = description;
      hasChanges = true;
      console.log(`📝 Description updated`);
    }

    // Update ticket if there are changes
    if (hasChanges) {
      updateFields.updated_at = new Date();
      
      console.log('📝 Update fields:', JSON.stringify(updateFields));
      
      const result = await db.collection('tickets').updateOne(
        { ticket_id: parseInt(ticketId) },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }

      console.log(`✅ Ticket ${ticketId} updated successfully`);

      // Log the change
      await db.collection('ticket_logs').insertOne({
        log_id: await getNextSequence('logId'),
        ticket_id: parseInt(ticketId),
        changed_by: req.user.id,
        change_description: changeDescription,
        created_at: new Date()
      });

      // Create notification for ticket owner
      await createComprehensiveNotification({
        user_id: ticket.user_id,
        title: 'Ticket Updated',
        message: `Your ticket #${ticketId} has been updated: ${changeDescription}`,
        type: 'ticket_updated',
        related_ticket_id: parseInt(ticketId),
        priority: 'medium'
      });

      // If team changed, notify the new team
      if (updateFields.team_id !== undefined && updateFields.team_id !== ticket.team_id) {
        console.log(`🔔 Notifying team ${updateFields.team_id} about reassigned ticket`);
        
        // Notify all senior officers in the new team
        const teamOfficers = await db.collection('users').find({
          team_id: updateFields.team_id,
          role: 'senior',
          is_active: true
        }).toArray();

        for (const officer of teamOfficers) {
          await createComprehensiveNotification({
            user_id: officer.user_id,
            title: 'New Ticket in Team Queue',
            message: `Ticket #${ticketId} has been reassigned to your team`,
            type: 'ticket_reassigned',
            related_ticket_id: parseInt(ticketId),
            priority: 'high'
          });
        }
      }
    }

    // Add comment if provided
    // Inside your PUT /api/tickets/:ticketId endpoint
// Add comment if provided - THIS IS THE KEY FIX
if (comment_text && comment_text.trim()) {
  const commentId = await getNextSequence('commentId');
  
  await db.collection('comments').insertOne({
    _id: commentId,
    comment_id: commentId,
    ticket_id: parseInt(ticketId),
    author_id: req.user.id,
    author_name: req.user.name, // IMPORTANT: Include author name
    comment_text: comment_text.trim(),
    created_at: new Date()
  });
  
  console.log(`💬 Comment added to ticket ${ticketId} by ${req.user.name}: "${comment_text.trim().substring(0, 50)}..."`);
  
  // Create notification for the comment
  await createCommentNotification(
    parseInt(ticketId), 
    req.user.id, 
    req.user.name, 
    comment_text.trim()
  );
}

    // If ticket was reassigned to a new team, try to auto-assign it
    if (updateFields.team_id !== undefined && updateFields.team_id !== ticket.team_id) {
      setTimeout(async () => {
        try {
          const assigned = await processTicketAssignment(parseInt(ticketId));
          if (assigned) {
            console.log(`🚀 Auto-assigned reassigned ticket ${ticketId}`);
          }
        } catch (error) {
          console.error('Auto-assignment error:', error);
        }
      }, 2000);
    }

    const finalMessage = hasChanges
      ? comment_text
        ? 'Ticket updated and comment added'
        : 'Ticket updated successfully'
      : comment_text
      ? 'Comment added successfully'
      : 'No changes made';

    res.json({
      success: true,
      message: finalMessage,
      changes_made: hasChanges,
    });
  } catch (error) {
    console.error('❌ Update ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});







// Enhanced ticket status update
app.put('/api/tickets/:ticketId/status', authenticateToken, requireSeniorOrAdmin, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;
    
    console.log(`🔄 [PUT] Status update for ticket ${ticketId} by user ${req.user.id}: ${status}`);
    
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    // Permission checks...
    
    const result = await db.collection('tickets').updateOne(
      { ticket_id: parseInt(ticketId) },
      { 
        $set: { 
          status: status,
          updated_at: new Date()
        }
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    // 🔔 ENHANCED NOTIFICATION FOR STATUS CHANGE
    await createComprehensiveNotification({
  user_id: ticket.user_id,
  title: `Ticket ${status}`,
  message: `Your ticket #${ticketId} status has been changed to ${status} by ${req.user.name}.`,
  type: 'ticket_status',
  related_ticket_id: parseInt(ticketId),
  priority: 'medium'
});
    
    await db.collection('ticket_logs').insertOne({
      log_id: await getNextSequence('logId'),
      ticket_id: parseInt(ticketId),
      changed_by: req.user.id,
      change_description: `Status changed from "${ticket.status}" to "${status}"`,
      created_at: new Date()
    });
    
    console.log(`✅ Status updated for ticket ${ticketId}: ${ticket.status} → ${status}`);
    
    res.json({
      success: true,
      message: 'Ticket status updated successfully',
    });
  } catch (error) {
    console.error('❌ Update ticket status error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});




// Close ticket endpoint
app.put('/api/tickets/:id/close', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const userId = req.user.id;

    console.log(`🔒 CLOSING ticket ${ticketId} by user ${userId}`);

    // Get ticket details first
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Check permissions
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Update ticket status to Closed
    await db.collection('tickets').updateOne(
      { ticket_id: parseInt(ticketId) },
      { 
        $set: { 
          status: "Closed", 
          updated_at: new Date() 
        } 
      }
    );

    // Create notification for ticket closure
    if (ticket.assigned_to) {
  await createComprehensiveNotification({
    user_id: ticket.assigned_to,
    title: 'Ticket Closed',
    message: `Ticket #${ticketId} has been closed by ${req.user.name}.`,
    type: 'ticket_closed',
    related_ticket_id: parseInt(ticketId),
    priority: 'medium'
  });
}

    // Log the closure
    await db.collection('ticket_logs').insertOne({
      log_id: await getNextSequence('logId'),
      ticket_id: parseInt(ticketId),
      changed_by: userId,
      change_description: `Ticket closed by ${req.user.role}`,
      created_at: new Date()
    });

    console.log(`✅ Ticket ${ticketId} closed successfully - removed from both dashboards`);

    // Process queued tickets after closing
    setTimeout(async () => {
      try {
        const assignedCount = await processAllQueuedTickets();
        console.log(`🚀 Auto-assigned ${assignedCount} tickets after closing`);
      } catch (error) {
        console.error('Post-closure assignment error:', error);
      }
    }, 1000);

    res.json({ 
      success: true, 
      message: 'Ticket closed successfully and removed from active lists' 
    });
  } catch (error) {
    console.error('Close ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to close ticket: ' + error.message });
  }
});

// Assign ticket to senior officer
app.put('/api/tickets/:ticketId/assign', authenticateToken, requireSeniorOrAdmin, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { assigned_to } = req.body;
    
    if (!assigned_to) {
      return res.status(400).json({ success: false, message: 'User ID to assign is required' });
    }
    
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    if (req.user.role === 'senior' && ticket.team_id !== req.user.team_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const user = await db.collection('users').findOne({ 
      user_id: parseInt(assigned_to), 
      role: "senior" 
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid senior officer' });
    }
    
    const result = await db.collection('tickets').updateOne(
      { ticket_id: parseInt(ticketId) },
      { $set: { assigned_to: parseInt(assigned_to) } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    // Create notification for the assigned officer
   // Create notification for the assigned officer - USE THE ACTUAL ticketId
await createComprehensiveNotification({
  user_id: availableOfficer.user_id,
  title: 'New Ticket Assigned',
  message: `You have been assigned a new ${issueType} ticket: "${description.substring(0, 100)}..."`,
  type: 'ticket_assigned',
  related_ticket_id: ticketId,  // ← Use the actual ticketId variable
  priority: 'high'
});
    await db.collection('ticket_logs').insertOne({
      log_id: await getNextSequence('logId'),
      ticket_id: parseInt(ticketId),
      changed_by: req.user.id,
      change_description: `Ticket assigned to user ${assigned_to}`,
      created_at: new Date()
    });
    
    res.json({
      success: true,
      message: 'Ticket assigned successfully',
    });
  } catch (error) {
    console.error('Assign ticket error at:', new Date().toISOString(), error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get user dashboard tickets
app.get('/api/user-tickets', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const tickets = await db.collection('tickets').aggregate([
      { $match: { user_id: userId } },
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
          team_name: '$team_info.team_name'
        }
      },
      { $sort: { created_at: -1 } }
    ]).toArray();
    
    console.log(`📋 Found ${tickets.length} tickets for user ${userId}`);
    
    res.json({ 
      success: true, 
      tickets 
    });
  } catch (error) {
    console.error('Fetch user tickets error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});












// Senior officer dashboard
// Senior officer dashboard - FIXED VERSION
app.get('/api/senior-dashboard', authenticateToken, requireSeniorOrAdmin, requireDatabase, async (req, res) => {
  try {
    console.log(`📊 Senior dashboard request from user: ${req.user.id}, role: ${req.user.role}, team: ${req.user.team_id}`);

    let matchStage = {};
    
    if (req.user.role === 'senior') {
      // FIXED: Show ALL tickets that belong to the officer's team, regardless of assignment status
      // This ensures reassigned tickets appear in the new team's dashboard
      matchStage = {
        team_id: req.user.team_id,
        status: { $nin: ['Closed'] } // Exclude only closed tickets
      };
    } else if (req.user.role === 'admin') {
      // Admin sees all non-closed tickets
      matchStage = {
        status: { $nin: ['Closed'] }
      };
    } else {
      // Regular users only see their own tickets
      matchStage = {
        user_id: req.user.id
      };
    }
    
    console.log('🔍 Match stage:', JSON.stringify(matchStage));
    
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
          steps_to_reproduce: 1,
          additional_notes: 1,
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

    console.log(`📋 Found ${tickets.length} tickets for team ${req.user.team_id}`);

    // Log each ticket's team assignment for debugging
    tickets.forEach(ticket => {
      console.log(`  Ticket #${ticket.ticket_id}: Team ${ticket.team_id}, Assigned to: ${ticket.assigned_to_name || 'Unassigned'}, Status: ${ticket.status}`);
    });

    let teamName = 'All Teams';
    if (req.user.role === 'senior' && req.user.team_id) {
      const team = await db.collection('teams').findOne({ team_id: req.user.team_id });
      if (team) {
        teamName = team.team_name;
      }
    }
    
    console.log(`✅ Sending ${tickets.length} tickets to dashboard for team: ${teamName}`);
    
    res.json({
      success: true,
      tickets,
      teamName,
      userRole: req.user.role,
      teamId: req.user.team_id
    });
  } catch (error) {
    console.error('❌ Senior dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});










// Add comment to ticket - UPDATED WITH NOTIFICATIONS
app.post('/api/tickets/:ticketId/comments', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { comment_text } = req.body;
    
    console.log(`💬 [POST] Adding comment to ticket ${ticketId} by user ${req.user.id}`);
    
    if (!comment_text || !comment_text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }
    
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    // Permission checks...
    
    await db.collection('comments').insertOne({
      comment_id: await getNextSequence('commentId'),
      ticket_id: parseInt(ticketId),
      author_id: req.user.id,
      comment_text: comment_text.trim(),
      created_at: new Date()
    });
    
    // 🔔 CREATE NOTIFICATION FOR COMMENT
    await createCommentNotification(
      parseInt(ticketId), 
      req.user.id, 
      req.user.name, 
      comment_text.trim()
    );
    
    console.log(`✅ Comment added to ticket ${ticketId}`);
    
    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
    });
  } catch (error) {
    console.error('❌ Add comment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
});





// Add comment to ticket
app.post('/api/tickets/:ticketId/comments', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { comment_text } = req.body;
    
    console.log(`💬 [POST] Adding comment to ticket ${ticketId} by user ${req.user.id}`);
    console.log(`📝 Comment text: ${comment_text}`);
    
    if (!comment_text || !comment_text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }
    
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      console.log(`❌ Ticket ${ticketId} not found`);
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      console.log(`❌ User ${req.user.id} cannot comment on ticket ${ticketId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (req.user.role === 'senior' && ticket.team_id !== req.user.team_id) {
      console.log(`❌ Senior officer from team ${req.user.team_id} cannot comment on ticket from team ${ticket.team_id}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    console.log(`✅ Permission granted, adding comment to ticket ${ticketId}`);
    
    await db.collection('comments').insertOne({
      comment_id: await getNextSequence('commentId'),
      ticket_id: parseInt(ticketId),
      author_id: req.user.id,
      comment_text: comment_text.trim(),
      created_at: new Date()
    });
    
    // Create notification for comment
    const notificationUserIds = [ticket.user_id];
    if (ticket.assigned_to && ticket.assigned_to !== req.user.id) {
      notificationUserIds.push(ticket.assigned_to);
    }
    
    for (const userId of notificationUserIds) {
      await createNotification({
        user_id: userId,
        title: 'New Comment on Ticket',
        message: `${req.user.name} added a comment to ticket #${ticketId}: "${comment_text.substring(0, 100)}..."`,
        type: 'comment_added',
        related_ticket_id: parseInt(ticketId)
      });
    }
    
    console.log(`✅ Comment added to ticket ${ticketId}`);
    
    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
    });
  } catch (error) {
    console.error('❌ Add comment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
});



// GET /api/tickets/:ticketId/comments endpoint
app.get('/api/tickets/:ticketId/comments', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    // Check permissions...
    
    // Fetch comments with author information
    const comments = await db.collection('comments').aggregate([
      { $match: { ticket_id: parseInt(ticketId) } },
      {
        $lookup: {
          from: 'users',
          localField: 'author_id',
          foreignField: 'user_id',
          as: 'author_info'
        }
      },
      {
        $unwind: { path: '$author_info', preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          _id: 1,
          comment_id: 1,
          ticket_id: 1,
          author_id: 1,
          comment_text: 1,
          created_at: 1,
          author_name: { 
            $ifNull: ['$author_info.name', '$author_name'] 
          }
        }
      },
      { $sort: { created_at: 1 } }
    ]).toArray();
    
    console.log(`✅ Found ${comments.length} comments for ticket ${ticketId}`);
    
    res.json({
      success: true,
      comments
    });
  } catch (error) {
    console.error('❌ Fetch comments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch comments: ' + error.message 
    });
  }
});


// Get ticket logs
app.get('/api/tickets/:ticketId/logs', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    console.log(`📋 [GET] Fetching logs for ticket ${ticketId} by user ${req.user.id}`);
    
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      console.log(`❌ Ticket ${ticketId} not found`);
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      console.log(`❌ User ${req.user.id} cannot access ticket ${ticketId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (req.user.role === 'senior' && ticket.team_id !== req.user.team_id) {
      console.log(`❌ Senior officer from team ${req.user.team_id} cannot access ticket from team ${ticket.team_id}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    console.log(`✅ Permission granted, fetching logs for ticket ${ticketId}`);
    
    const logs = await db.collection('ticket_logs').aggregate([
      { $match: { ticket_id: parseInt(ticketId) } },
      {
        $lookup: {
          from: 'users',
          localField: 'changed_by',
          foreignField: 'user_id',
          as: 'changed_by_info'
        }
      },
      {
        $unwind: { path: '$changed_by_info', preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          log_id: 1,
          change_description: 1,
          created_at: 1,
          changed_by_name: '$changed_by_info.name',
          changed_by_id: '$changed_by_info.user_id'
        }
      },
      { $sort: { created_at: 1 } }
    ]).toArray();
    
    console.log(`✅ Found ${logs.length} logs for ticket ${ticketId}`);
    
    res.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error('❌ Fetch ticket logs error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
});

// Enhanced queue info endpoint
app.get('/api/queue-info', authenticateToken, requireDatabase, async (req, res) => {
  try {
    console.log('📊 Fetching queue info...');
    
    // Get queued tickets count by team
    const queuedTickets = await db.collection('tickets').aggregate([
      { $match: { status: 'Queued' } },
      {
        $group: {
          _id: '$issue_type',
          queued_count: { $sum: 1 }
        }
      }
    ]).toArray();

    // Get total queued tickets
    const totalQueued = await db.collection('tickets').countDocuments({ status: 'Queued' });

    // Get senior officers workload
    const officers = await db.collection('users').aggregate([
      {
        $match: {
          role: 'senior',
          is_active: true
        }
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
          from: 'tickets',
          let: { user_id: '$user_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$assigned_to', '$$user_id'] },
                status: 'In Progress' // ONLY count "In Progress" tickets
              }
            }
          ],
          as: 'active_tickets'
        }
      },
      {
        $project: {
          user_id: 1,
          name: 1,
          team_type: '$team_info.team_type',
          active_tickets: { $size: '$active_tickets' },
          available: { $lt: [{ $size: '$active_tickets' }, 3] } // Available if <3 tickets
        }
      }
    ]).toArray();

    // Calculate team workload
    const teamWorkload = {};
    officers.forEach(officer => {
      const teamType = officer.team_type;
      if (!teamWorkload[teamType]) {
        teamWorkload[teamType] = {
          activeTickets: 0,
          availableOfficers: 0,
          totalOfficers: 0
        };
      }
      
      teamWorkload[teamType].activeTickets += parseInt(officer.active_tickets);
      teamWorkload[teamType].totalOfficers++;
      
      if (parseInt(officer.active_tickets) < 3) { // FIXED: Available if <3 tickets
        teamWorkload[teamType].availableOfficers++;
      }
    });

    // Add queued counts to team workload
    queuedTickets.forEach(queue => {
      const teamType = `${queue._id} Support Team`;
      if (teamWorkload[teamType]) {
        teamWorkload[teamType].queuedTickets = parseInt(queue.queued_count);
      }
    });

    console.log(`✅ Queue info: ${totalQueued} total pending tickets`);

    res.json({
      success: true,
      queueInfo: {
        totalPendingTickets: totalQueued,
        teamWorkload,
        queuedTickets: queuedTickets,
        assignmentRule: "Tickets auto-assign when officers have <3 active tickets"
      }
    });
  } catch (error) {
    console.error('❌ Queue info error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch queue info' });
  }
});

// ========== PUBLIC STATS ENDPOINTS ==========

// Public system statistics (available to everyone)
app.get('/api/public/stats', requireDatabase, async (req, res) => {
  try {
    console.log('📊 Fetching PUBLIC system statistics');
    
    // Get counts from database (these are safe to show publicly)
    const totalUsers = await db.collection('users').countDocuments();
    const totalTickets = await db.collection('tickets').countDocuments();
    const resolvedTickets = await db.collection('tickets').countDocuments({ status: 'Resolved' });
    const activeTickets = await db.collection('tickets').countDocuments({ 
      status: { $in: ['Open', 'In Progress', 'Queued'] } 
    });
    const seniorOfficers = await db.collection('users').countDocuments({ role: 'senior' });
    
    res.json({
      success: true,
      totalUsers,
      totalTickets,
      resolvedTickets,
      activeTickets,
      seniorOfficers,
      avgResponseTime: '2.3h', // You can calculate this from actual data
      systemUptime: '99.8%'
    });
  } catch (error) {
    console.error('Public stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch public statistics' });
  }
});

// Public tickets count (safe for landing page)
app.get('/api/public/tickets-count', requireDatabase, async (req, res) => {
  try {
    const totalTickets = await db.collection('tickets').countDocuments();
    const resolvedTickets = await db.collection('tickets').countDocuments({ status: 'Resolved' });
    
    res.json({
      success: true,
      totalTickets,
      resolvedTickets
    });
  } catch (error) {
    console.error('Public tickets count error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets count' });
  }
});

// Add this route to your server.js file
app.post('/api/admin/create-team-officers-safe', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    console.log('👮 Creating senior officers for all teams safely...');
    
    // Get the next available user_id
    const nextUserId = await getNextSequence('userId');
    
    const teams = await db.collection('teams').find().sort({ team_id: 1 }).toArray();
    const existingOfficers = await db.collection('users').find({ role: 'senior' }).toArray();
    
    const officersToCreate = [];
    let currentUserId = nextUserId;
    
    for (const team of teams) {
      // Check if this team already has a senior officer
      const hasOfficer = existingOfficers.some(officer => officer.team_id === team.team_id);
      
      if (!hasOfficer) {
        const hashedPassword = await bcrypt.hash('Password123!', 10);
        
        const officerDoc = {
          _id: currentUserId,
          user_id: currentUserId,
          name: `${team.team_type} Senior Officer`,
          email: `${team.team_type.toLowerCase().replace(/\s+/g, '')}.officer@ess.gov.et`,
          password: hashedPassword,
          role: 'senior',
          phone_number: '+251911223344',
          team_id: team.team_id,
          avatar_path: null,
          assigned_tickets_count: 0,
          is_active: true,
          created_at: new Date()
        };
        
        officersToCreate.push(officerDoc);
        currentUserId++;
        console.log(`✅ Will create officer for ${team.team_name}`);
      } else {
        console.log(`ℹ️  Team ${team.team_name} already has officer`);
      }
    }
    
    if (officersToCreate.length > 0) {
      await db.collection('users').insertMany(officersToCreate);
      
      // Update the counter
      await db.collection('counters').updateOne(
        { _id: 'userId' },
        { $set: { sequence_value: currentUserId } }
      );
      
      console.log(`🎉 Created ${officersToCreate.length} new senior officers`);
    }
    
    res.json({
      success: true,
      message: `Created ${officersToCreate.length} senior officers for all teams`,
      officers_created: officersToCreate.length,
      password_note: 'All officers have password: Password123!'
    });
    
  } catch (error) {
    console.error('❌ Create team officers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});






// Admin-only registration for senior officers
// Admin-only registration for senior officers - WITH EMAIL NOTIFICATIONS
// Admin-only registration for senior officers - WITH CREDENTIALS TO BOTH
app.post('/api/admin/register-senior', authenticateToken, requireAdmin, requireDatabase, upload.single('avatar'), async (req, res) => {
  try {
    const { name, email, password, confirm_password, phone_number, team_id, role = 'senior' } = req.body;
    console.log(`Senior officer register request: ${JSON.stringify({ name, email, team_id })} at ${new Date().toISOString()}`);
    
    if (!name || !email || !password || !confirm_password || !team_id) {
      return res.status(400).json({ success: false, message: 'Name, email, password, confirm password, and team are required' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }
    
    const team = await db.collection('teams').findOne({ team_id: parseInt(team_id) });
    if (!team) {
      return res.status(400).json({ success: false, message: 'Invalid team selected' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const avatar_path = req.file ? 'assets/avatars/' + req.file.filename : null;
    
    const userId = await getNextSequence('userId');
    const userDoc = {
      _id: userId,
      user_id: userId,
      name,
      email,
      password: hashedPassword,
      role,
      phone_number: phone_number || null,
      team_id: parseInt(team_id),
      avatar_path,
      assigned_tickets_count: 0,
      is_active: true,
      created_at: new Date()
    };
    
    await db.collection('users').insertOne(userDoc);
    
    const adminName = req.user.name;
    const adminEmail = req.user.email;

    // 🔥 SEND WELCOME EMAIL TO THE NEW SENIOR OFFICER (WITH CREDENTIALS)
    try {
      const welcomeHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">🎉 Welcome Senior Officer!</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">Hello ${name},</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              You have been registered as a Senior Officer in the IT Help Desk System.
            </p>
            <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">📋 Your Login Credentials:</h3>
              <p style="margin: 5px 0; color: #856404; font-size: 14px;">
                <strong>Email:</strong> ${email}<br>
                <strong>Password:</strong> ${password}<br>
                <strong>Login URL:</strong> <a href="http://localhost:3000/login" style="color: #007bff;">http://localhost:3000/login</a>
              </p>
              <p style="margin: 10px 0 0 0; color: #856404; font-size: 12px;">
                ⚠️ Please change your password after first login for security.
              </p>
            </div>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Name:</strong> ${name}<br>
                <strong>Email:</strong> ${email}<br>
                <strong>Role:</strong> Senior Officer<br>
                <strong>Team:</strong> ${team.team_name}<br>
                <strong>Created By:</strong> Admin (${adminName})<br>
                <strong>Account Created:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
            <p style="color: #888; font-size: 14px;">
              You can now log in and manage tickets assigned to your team.
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 12px;">
              Ethiopian Statistical Service IT Help Desk
            </p>
          </div>
        </div>
      `;
      
      const mailOptions = {
        from: '"IT Help Desk" <hussenseid670@gmail.com>',
        to: email,
        subject: '🎉 Welcome to IT Help Desk - Senior Officer Account',
        html: welcomeHtml
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`✅ Welcome email with credentials sent to senior officer: ${email}`);
    } catch (emailError) {
      console.error('❌ Welcome email to senior officer failed:', emailError.message);
    }

    // 🔥 SEND CONFIRMATION EMAIL TO THE ADMIN WITH THE PASSWORD
    try {
      const adminConfirmHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="background: #007bff; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">✅ Senior Officer Created</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">Hello ${adminName},</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              You have successfully created a new Senior Officer account.
            </p>
            <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">📋 Officer Credentials (for your records):</h3>
              <p style="margin: 5px 0; color: #856404; font-size: 14px;">
                <strong>Name:</strong> ${name}<br>
                <strong>Email:</strong> ${email}<br>
                <strong>Password Set:</strong> ${password}<br>
                <strong>Role:</strong> Senior Officer<br>
                <strong>Team:</strong> ${team.team_name}<br>
                <strong>User ID:</strong> ${userId}
              </p>
              <p style="margin: 10px 0 0 0; color: #856404; font-size: 12px;">
                📝 Please keep these credentials for your records.
              </p>
            </div>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Created By:</strong> ${adminName} (You)<br>
                <strong>Created At:</strong> ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 12px;">
              Ethiopian Statistical Service IT Help Desk - Admin Confirmation
            </p>
          </div>
        </div>
      `;
      
      const adminMailOptions = {
        from: '"IT Help Desk" <hussenseid670@gmail.com>',
        to: adminEmail || 'seidhussen0729@gmail.com',
        subject: `✅ Senior Officer Created: ${name} (${email}) - ${team.team_name}`,
        html: adminConfirmHtml
      };
      
      await transporter.sendMail(adminMailOptions);
      console.log(`✅ Confirmation email with credentials sent to admin: ${adminEmail}`);
    } catch (emailError) {
      console.error('❌ Admin confirmation email failed:', emailError.message);
    }

    // 🔥 ALSO NOTIFY SUPER ADMIN
    try {
      await notifyAdmin('👤 New Senior Officer Created', 
        `Admin ${adminName} created a new Senior Officer: ${name} (${email}) for ${team.team_name}. Password: ${password}`, {
        userName: name,
        userEmail: email,
        action: 'admin_created_senior'
      });
      console.log('✅ Super admin notified about new senior officer');
    } catch (superAdminEmailError) {
      console.error('❌ Super admin notification failed:', superAdminEmailError.message);
    }
    
    const newUser = await db.collection('users').findOne(
      { user_id: userId },
      { projection: { password: 0 } }
    );
    
    res.status(201).json({
      success: true,
      message: 'Senior officer registered successfully',
      user: newUser,
    });
  } catch (error) {
    console.error(`Senior officer registration error:`, error);
    res.status(500).json({ success: false, message: 'Server error during registration: ' + error.message });
  }
});

// Get senior officers
app.get('/api/senior-officers', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const officers = await db.collection('users').aggregate([
      { $match: { role: 'senior' } },
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
          user_id: 1,
          name: 1,
          email: 1,
          phone_number: 1,
          team_id: 1,
          team_name: '$team_info.team_name'
        }
      },
      { $sort: { name: 1 } }
    ]).toArray();
    
    res.json({ success: true, senior_officers: officers });
  } catch (error) {
    console.error('Get senior officers error at:', new Date().toISOString(), error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Contact senior officers
app.get('/api/contact-senior-officers', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const officers = await db.collection('users').aggregate([
      { $match: { role: 'senior' } },
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
          name: 1,
          email: 1,
          phone_number: 1,
          team_name: '$team_info.team_name'
        }
      },
      { $sort: { name: 1 } }
    ]).toArray();
    
    res.json({ 
      success: true, 
      senior_officers: officers 
    });
  } catch (error) {
    console.error('Get contact senior officers error at:', new Date().toISOString(), error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching senior officers contact information' 
    });
  }
});

// Update senior officer endpoint
app.put('/api/admin/senior-officers/:officerId', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { officerId } = req.params;
    const { name, email, phone_number, team_id, password } = req.body;
    
    console.log(`Updating senior officer ${officerId}:`, { name, email, phone_number, team_id });

    const existingUser = await db.collection('users').findOne({ 
      email, 
      user_id: { $ne: parseInt(officerId) } 
    });
    
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const updateFields = {
      name,
      email,
      phone_number: phone_number || null,
      team_id: team_id ? parseInt(team_id) : null
    };

    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.password = hashedPassword;
    }

    const result = await db.collection('users').updateOne(
      { user_id: parseInt(officerId), role: "senior" },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Senior officer not found' });
    }

    console.log(`✅ Senior officer ${officerId} updated successfully`);
    res.json({
      success: true,
      message: 'Senior officer updated successfully'
    });
  } catch (error) {
    console.error('Update senior officer error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// Get all senior officers for admin
app.get('/api/admin/senior-officers', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const officers = await db.collection('users').aggregate([
      { $match: { role: 'senior' } },
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
          user_id: 1,
          name: 1,
          email: 1,
          phone_number: 1,
          team_name: '$team_info.team_name'
        }
      }
    ]).toArray();
    
    res.json({ success: true, senior_officers: officers });
  } catch (error) {
    console.error('Get senior officers error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete senior officer
app.delete('/api/admin/senior-officers/:officerId', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { officerId } = req.params;
    
    const result = await db.collection('users').deleteOne({ 
      user_id: parseInt(officerId), 
      role: "senior" 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Senior officer not found' });
    }
    
    res.json({ success: true, message: 'Senior officer deleted successfully' });
  } catch (error) {
    console.error('Delete senior officer error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin dashboard statistics
app.get('/api/admin/dashboard', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    console.log('📊 Admin dashboard request');
    
    // Get total counts
    const totalUsers = await db.collection('users').countDocuments();
    const totalTickets = await db.collection('tickets').countDocuments();
    const openTickets = await db.collection('tickets').countDocuments({ status: 'In Progress' });
    const queuedTickets = await db.collection('tickets').countDocuments({ status: 'Queued' });
    const closedTickets = await db.collection('tickets').countDocuments({ status: 'Closed' });
    const totalNotifications = await db.collection('notifications').countDocuments();
    
    // Get tickets by issue type
    const ticketsByType = await db.collection('tickets').aggregate([
      {
        $group: {
          _id: '$issue_type',
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    
    // Get tickets by priority
    const ticketsByPriority = await db.collection('tickets').aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    
    // Get recent tickets
    const recentTickets = await db.collection('tickets').aggregate([
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
        $project: {
          ticket_id: 1,
          issue_type: 1,
          priority: 1,
          status: 1,
          created_at: 1,
          user_name: '$user_info.name'
        }
      },
      { $sort: { created_at: -1 } },
      { $limit: 10 }
    ]).toArray();
    
    // Get senior officer performance
    const officerPerformance = await db.collection('users').aggregate([
      { $match: { role: 'senior' } },
      {
        $lookup: {
          from: 'tickets',
          localField: 'user_id',
          foreignField: 'assigned_to',
          as: 'assigned_tickets'
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          total_tickets: { $size: '$assigned_tickets' },
          active_tickets: {
            $size: {
              $filter: {
                input: '$assigned_tickets',
                as: 'ticket',
                cond: { $eq: ['$$ticket.status', 'In Progress'] }
              }
            }
          },
          closed_tickets: {
            $size: {
              $filter: {
                input: '$assigned_tickets',
                as: 'ticket',
                cond: { $eq: ['$$ticket.status', 'Closed'] }
              }
            }
          }
        }
      }
    ]).toArray();
    
    res.json({
      success: true,
      dashboard: {
        totals: {
          users: totalUsers,
          tickets: totalTickets,
          open: openTickets,
          queued: queuedTickets,
          closed: closedTickets,
          notifications: totalNotifications
        },
        byType: ticketsByType,
        byPriority: ticketsByPriority,
        recentTickets: recentTickets,
        officerPerformance: officerPerformance
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard data' });
  }
});

// Get admin tickets with filtering
app.get('/api/admin/tickets', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
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

// Debug endpoint to check current team setup
app.get('/api/debug/team-mapping', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const teams = await db.collection('teams').find().sort({ team_id: 1 }).toArray();
    const tickets = await db.collection('tickets')
      .find()
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();
    
    const seniorOfficers = await db.collection('users').aggregate([
      { $match: { role: 'senior' } },
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
          user_id: 1,
          name: 1,
          email: 1,
          team_id: 1,
          team_name: '$team_info.team_name'
        }
      }
    ]).toArray();
    
    res.json({
      success: true,
      teams: teams,
      recent_tickets: tickets,
      senior_officers: seniorOfficers,
      mapping_used: enhancedTeamMap
    });
  } catch (error) {
    console.error('Team mapping debug error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Clean up teams and fix team names
app.post('/api/admin/cleanup-teams', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    console.log('🧹 Cleaning up teams and fixing names...');
    
    await db.collection('users').updateMany(
      { role: "senior" },
      { $set: { team_id: null } }
    );
    
    await db.collection('teams').deleteMany({});
    
    const teams = [
      { _id: 1, team_id: 1, team_name: 'Hardware Support Team', team_type: 'Hardware Support Team', created_at: new Date() },
      { _id: 2, team_id: 2, team_name: 'Software Support Team', team_type: 'Software Support Team', created_at: new Date() },
      { _id: 3, team_id: 3, team_name: 'Network Operations Team', team_type: 'Network Support Team', created_at: new Date() },
      { _id: 4, team_id: 4, team_name: 'Security Team', team_type: 'Security Support Team', created_at: new Date() },
      { _id: 5, team_id: 5, team_name: 'Account Management Team', team_type: 'Account Support Team', created_at: new Date() },
      { _id: 6, team_id: 6, team_name: 'Database Administration Team', team_type: 'Database Support Team', created_at: new Date() },
      { _id: 7, team_id: 7, team_name: 'Configuration Management Team', team_type: 'Configuration Support Team', created_at: new Date() },
      { _id: 8, team_id: 8, team_name: 'System Maintenance Team', team_type: 'Maintenance Support Team', created_at: new Date() },
      { _id: 9, team_id: 9, team_name: 'Other Issues Team', team_type: 'Other Support Team', created_at: new Date() }
    ];
    
    await db.collection('teams').insertMany(teams);
    
    // Reset team counter
    await db.collection('counters').updateOne(
      { _id: 'teamId' },
      { $set: { sequence_value: 10 } }
    );
    
    console.log('✅ Teams cleaned up and names fixed successfully');
    
    res.json({
      success: true,
      message: 'Teams cleaned up successfully with correct names'
    });
  } catch (error) {
    console.error('Team cleanup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Quick fix for team names without deleting data
app.post('/api/admin/fix-team-names', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    console.log('🔧 Fixing team names...');
    
    const updates = [
      { team_id: 1, name: 'Hardware Support Team', type: 'Hardware Support Team' },
      { team_id: 2, name: 'Software Support Team', type: 'Software Support Team' },
      { team_id: 3, name: 'Network Operations Team', type: 'Network Support Team' },
      { team_id: 4, name: 'Security Team', type: 'Security Support Team' },
      { team_id: 5, name: 'Account Management Team', type: 'Account Support Team' },
      { team_id: 6, name: 'Database Administration Team', type: 'Database Support Team' },
      { team_id: 7, name: 'Configuration Management Team', type: 'Configuration Support Team' },
      { team_id: 8, name: 'System Maintenance Team', type: 'Maintenance Support Team' },
      { team_id: 9, name: 'Other Issues Team', type: 'Other Support Team' }
    ];
    
    for (const update of updates) {
      await db.collection('teams').updateOne(
        { team_id: update.team_id },
        { 
          $set: { 
            team_name: update.name,
            team_type: update.type
          } 
        }
      );
    }
    
    console.log('✅ Team names fixed successfully');
    
    res.json({
      success: true,
      message: 'Team names updated to match frontend expectations'
    });
  } catch (error) {
    console.error('Team name fix error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reset auto-increment counters
app.post('/api/admin/reset-auto-increment', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    console.log('🔄 Resetting auto-increment counters...');
    
    await db.collection('counters').updateOne(
      { _id: 'userId' },
      { $set: { sequence_value: 1 } }
    );
    await db.collection('counters').updateOne(
      { _id: 'ticketId' },
      { $set: { sequence_value: 1 } }
    );
    await db.collection('counters').updateOne(
      { _id: 'commentId' },
      { $set: { sequence_value: 1 } }
    );
    await db.collection('counters').updateOne(
      { _id: 'logId' },
      { $set: { sequence_value: 1 } }
    );
    await db.collection('counters').updateOne(
      { _id: 'notificationId' },
      { $set: { sequence_value: 1 } }
    );
    await db.collection('counters').updateOne(
      { _id: 'teamId' },
      { $set: { sequence_value: 10 } }
    );
    
    console.log('✅ Auto-increment counters reset to 1');
    
    res.json({
      success: true,
      message: 'Auto-increment counters reset successfully'
    });
  } catch (error) {
    console.error('Reset auto-increment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test mapping endpoint
app.get('/api/test-mapping', requireDatabase, async (req, res) => {
  const teams = await db.collection('teams').find().sort({ team_id: 1 }).toArray();
  
  res.json({
    current_mapping: enhancedTeamMap,
    actual_teams: teams,
    expected: {
      'Hardware should go to': 'Team 1 - ' + (teams[0]?.team_name || 'Unknown'),
      'Software should go to': 'Team 2 - ' + (teams[1]?.team_name || 'Unknown'),
      'Database should go to': 'Team 6 - ' + (teams[5]?.team_name || 'Unknown'),
      'Configuration should go to': 'Team 7 - ' + (teams[6]?.team_name || 'Unknown'),
      'Maintenance should go to': 'Team 8 - ' + (teams[7]?.team_name || 'Unknown')
    }
  });
});

// Debug senior teams endpoint
app.get('/api/debug/senior-teams', authenticateToken, requireDatabase, async (req, res) => {
  try {
    console.log('🔍 DEBUG: Checking senior officer team assignments');
    
    const seniorOfficers = await db.collection('users').aggregate([
      { $match: { role: 'senior' } },
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
          user_id: 1,
          name: 1,
          email: 1,
          team_id: 1,
          team_name: '$team_info.team_name',
          role: 1
        }
      }
    ]).toArray();
    
    const currentUser = await db.collection('users').aggregate([
      { $match: { user_id: req.user.id } },
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
          user_id: 1,
          name: 1,
          role: 1,
          team_id: 1,
          team_name: '$team_info.team_name'
        }
      }
    ]).toArray();
    
    let teamTickets = [];
    if (currentUser[0]?.team_id) {
      teamTickets = await db.collection('tickets')
        .find({ team_id: currentUser[0].team_id })
        .sort({ created_at: -1 })
        .limit(5)
        .toArray();
    }
    
    res.json({
      success: true,
      current_user: currentUser[0] || {},
      all_senior_officers: seniorOfficers,
      team_tickets: teamTickets,
      message: `User ${req.user.id} is from team ${currentUser[0]?.team_id} (${currentUser[0]?.team_name})`
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Debug routes endpoint
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  res.json({ routes });
});






// Add this function after your email configuration
async function sendEmailNotification(email, subject, htmlContent) {
  try {
    const mailOptions = {
      from: '"IT Help Desk" <noreply@ethiopianstatisticalservice.com>',
      to: email,
      subject: subject,
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to: ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    return false;
  }
}





// ========== SYSTEM CONFIGURATION ROUTES ==========

// Get system configuration
app.get('/api/admin/system-config', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const config = await db.collection('system_config').findOne({ _id: 'main' });
    
    if (!config) {
      // Return default config
      const defaultConfig = {
        _id: 'main',
        system_name: 'Help Desk System',
        support_email: 'support@example.com',
        max_tickets_per_user: 5,
        auto_assign_tickets: true,
        ticket_timeout_hours: 168,
        notification_enabled: true,
        backup_enabled: true,
        backup_frequency: 'daily',
        sla_response_time: 2,
        sla_resolution_time: 48,
        updated_at: new Date()
      };
      return res.json({ success: true, config: defaultConfig });
    }
    
    res.json({ success: true, config });
  } catch (error) {
    console.error('Get system config error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update system configuration
app.put('/api/admin/system-config', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const configData = req.body;
    
    const result = await db.collection('system_config').updateOne(
      { _id: 'main' },
      { 
        $set: { 
          ...configData,
          updated_at: new Date(),
          updated_by: req.user.id
        } 
      },
      { upsert: true }
    );
    
    console.log('✅ System configuration updated by admin:', req.user.id);
    
    res.json({ 
      success: true, 
      message: 'System configuration saved successfully' 
    });
  } catch (error) {
    console.error('Update system config error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Manual backup endpoint
app.post('/api/admin/backup', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    // Create backup of essential collections
    const backup = {
      timestamp: new Date(),
      users: await db.collection('users').find({}, { projection: { password: 0 } }).toArray(),
      tickets: await db.collection('tickets').find().toArray(),
      teams: await db.collection('teams').find().toArray(),
      config: await db.collection('system_config').find().toArray()
    };
    
    // Save backup to backups collection
    await db.collection('backups').insertOne({
      backup_id: await getNextSequence('backupId'),
      backup_data: backup,
      created_by: req.user.id,
      created_at: new Date()
    });
    
    console.log('✅ Manual backup completed by admin:', req.user.id);
    
    res.json({ 
      success: true, 
      message: 'Backup completed successfully' 
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});






// CREATE procurement request - MUST come BEFORE parameterized routes
// CREATE procurement request - WITH EMAIL NOTIFICATIONS
// CREATE procurement request - FIXED WITH EMAIL NOTIFICATIONS
// CREATE procurement request - COMPLETELY FIXED WITH EMAIL NOTIFICATIONS
// CREATE procurement request - COMPLETELY FIXED
app.post('/api/procurement-requests', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const {
      ticket_id,
      item_name,
      category,
      quantity,
      urgency,
      estimated_cost,
      specifications,
      vendor_info,
      notes,
      requested_by,
      requested_by_name
    } = req.body;

    console.log('🛒 ========================================');
    console.log('🛒 PROCUREMENT REQUEST RECEIVED:');
    console.log('🛒 ticket_id:', ticket_id);
    console.log('🛒 item_name:', item_name);
    console.log('🛒 requested_by:', requested_by);
    console.log('🛒 requested_by_name:', requested_by_name);
    console.log('🛒 req.user:', { id: req.user.id, name: req.user.name, role: req.user.role });
    console.log('🛒 ========================================');

    if (!ticket_id || !item_name || !category || !quantity || !urgency) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: ticket_id, item_name, category, quantity, and urgency are required'
      });
    }

    // Get the ticket to find the ticket owner
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticket_id) });
    
    const procurementRequest = {
      ticket_id: ticket_id.toString(),
      item_name,
      category,
      quantity: parseInt(quantity),
      urgency,
      estimated_cost: estimated_cost || '',
      specifications: specifications || '',
      vendor_info: vendor_info || '',
      notes: notes || '',
      requested_by: requested_by || req.user.id,
      requested_by_name: requested_by_name || req.user.name,
      status: 'pending',
      messages: [],
      created_at: new Date(),
      updated_at: new Date()
    };

    const result = await db.collection('procurement_requests').insertOne(procurementRequest);
    console.log('✅ Procurement request saved:', result.insertedId);

    // 🔥 FIND TICKET OWNER AND SEND EMAIL
    if (ticket) {
      const ticketOwner = await db.collection('users').findOne({ user_id: ticket.user_id });
      
      if (ticketOwner && ticketOwner.email) {
        console.log(`📧 Found ticket owner: ${ticketOwner.name} (${ticketOwner.email})`);
        
        try {
          const equipmentHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
              <div style="background: #ffc107; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
                <h1 style="color: #333; margin: 0;">🛒 Equipment Request Submitted</h1>
              </div>
              <div style="padding: 20px;">
                <h2 style="color: #333;">Hello ${ticketOwner.name},</h2>
                <p style="font-size: 16px; color: #555; line-height: 1.6;">
                  An equipment request has been submitted for your ticket by ${req.user.name}.
                </p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <p style="margin: 0; color: #666; font-size: 14px;">
                    <strong>Ticket ID:</strong> #${ticket_id}<br>
                    <strong>Item:</strong> ${item_name}<br>
                    <strong>Category:</strong> ${category}<br>
                    <strong>Quantity:</strong> ${quantity}<br>
                    <strong>Urgency:</strong> ${urgency}<br>
                    <strong>Estimated Cost:</strong> ${estimated_cost || 'N/A'}<br>
                    <strong>Requested By:</strong> ${req.user.name} (${req.user.role})<br>
                    <strong>Status:</strong> Pending Approval<br>
                    <strong>Date:</strong> ${new Date().toLocaleString()}
                  </p>
                </div>
                ${specifications ? `<p style="font-size: 14px; color: #555;"><strong>Specifications:</strong> ${specifications}</p>` : ''}
                ${notes ? `<p style="font-size: 14px; color: #555;"><strong>Notes:</strong> ${notes}</p>` : ''}
                <p style="color: #888; font-size: 14px;">
                  You will be notified when the status of this request changes.
                </p>
              </div>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                  Ethiopian Statistical Service IT Help Desk
                </p>
              </div>
            </div>
          `;
          
          const mailOptions = {
            from: '"IT Help Desk" <hussenseid670@gmail.com>',
            to: ticketOwner.email,
            subject: `🛒 Equipment Request for Your Ticket #${ticket_id}: ${item_name}`,
            html: equipmentHtml
          };
          
          await transporter.sendMail(mailOptions);
          console.log(`✅ Equipment request email sent to ticket owner: ${ticketOwner.email}`);
        } catch (emailError) {
          console.error('❌ Equipment request email failed:', emailError.message);
        }
      } else {
        console.log('⚠️ Ticket owner not found or has no email');
      }
    } else {
      console.log('⚠️ Ticket not found for equipment request notification');
    }

    // 🔥 NOTIFY ADMIN
    try {
      await notifyAdmin('🛒 New Equipment Request', 
        `Equipment request for "${item_name}" in ticket #${ticket_id} by ${req.user.name}.`, {
        userName: req.user.name,
        userEmail: req.user.email || 'N/A',
        ticketId: ticket_id,
        action: 'equipment_request'
      });
      console.log('✅ Admin notified about equipment request');
    } catch (adminEmailError) {
      console.error('❌ Admin notification failed:', adminEmailError.message);
    }

    // Create database notification for ticket owner
    if (ticket) {
      await createComprehensiveNotification({
        user_id: ticket.user_id,
        title: '🛒 Equipment Request Submitted',
        message: `An equipment request for "${item_name}" has been submitted for your ticket #${ticket_id} by ${req.user.name}.`,
        type: 'procurement',
        related_ticket_id: parseInt(ticket_id),
        related_request_id: result.insertedId.toString(),
        priority: 'high'
      });
    }

    res.json({
      success: true,
      message: 'Procurement request submitted successfully',
      request: {
        _id: result.insertedId,
        ...procurementRequest
      }
    });

  } catch (error) {
    console.error('❌ Procurement request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit procurement request: ' + error.message
    });
  }
});








// FIXED: Update procurement request status with proper notification mapping
// FIXED: Update procurement request status WITH EMAIL TO USER
app.put('/api/procurement-requests/:requestId/status', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, admin_notes } = req.body;

    console.log('🔄 Updating procurement request status:', requestId, 'to:', status);

    const currentRequest = await db.collection('procurement_requests').findOne({
      _id: new ObjectId(requestId)
    });

    if (!currentRequest) {
      return res.status(404).json({
        success: false,
        message: 'Procurement request not found'
      });
    }

    const updateData = {
      status: status,
      updated_at: new Date()
    };

    if (admin_notes) {
      updateData.admin_notes = admin_notes;
    }

    const result = await db.collection('procurement_requests').updateOne(
      { _id: new ObjectId(requestId) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Procurement request not found'
      });
    }

    // 🔥 SEND EMAIL TO TICKET OWNER ABOUT STATUS CHANGE
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(currentRequest.ticket_id) });
    if (ticket) {
      const ticketOwner = await db.collection('users').findOne({ user_id: ticket.user_id });
      
      if (ticketOwner && ticketOwner.email) {
        const statusEmojis = {
          'approved': '✅',
          'rejected': '❌',
          'ordered': '📦',
          'delivered': '🎁',
          'cancelled': '🚫',
          'pending': '⏳'
        };
        
        const statusMessages = {
          'approved': 'Your equipment request has been approved!',
          'rejected': 'Your equipment request has been rejected.',
          'ordered': 'Your equipment has been ordered.',
          'delivered': 'Your equipment has been delivered!',
          'cancelled': 'Your equipment request has been cancelled.',
          'pending': 'Your equipment request is pending.'
        };

        const emoji = statusEmojis[status] || '📋';
        const statusMessage = statusMessages[status] || `Status updated to: ${status}`;

        try {
          const statusHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
              <div style="background: ${status === 'approved' ? '#28a745' : status === 'rejected' ? '#dc3545' : '#007bff'}; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0;">${emoji} Equipment Request Update</h1>
              </div>
              <div style="padding: 20px;">
                <h2 style="color: #333;">Hello ${ticketOwner.name},</h2>
                <p style="font-size: 16px; color: #555; line-height: 1.6;">${statusMessage}</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <p style="margin: 0; color: #666; font-size: 14px;">
                    <strong>Item:</strong> ${currentRequest.item_name}<br>
                    <strong>Ticket ID:</strong> #${currentRequest.ticket_id}<br>
                    <strong>New Status:</strong> ${status.toUpperCase()}<br>
                    <strong>Updated By:</strong> ${req.user.name}<br>
                    <strong>Date:</strong> ${new Date().toLocaleString()}
                    ${admin_notes ? `<br><strong>Notes:</strong> ${admin_notes}` : ''}
                  </p>
                </div>
              </div>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                  Ethiopian Statistical Service IT Help Desk
                </p>
              </div>
            </div>
          `;
          
          const mailOptions = {
            from: '"IT Help Desk" <hussenseid670@gmail.com>',
            to: ticketOwner.email,
            subject: `${emoji} Equipment Request ${status.toUpperCase()}: ${currentRequest.item_name} - Ticket #${currentRequest.ticket_id}`,
            html: statusHtml
          };
          
          await transporter.sendMail(mailOptions);
          console.log(`✅ Equipment status email sent to: ${ticketOwner.email}`);
        } catch (emailError) {
          console.error('❌ Status email failed:', emailError.message);
        }
      }
    }

    // Database notification
    const statusActionMap = {
      'approved': 'approved',
      'rejected': 'rejected',
      'ordered': 'ordered',
      'delivered': 'delivered',
      'cancelled': 'cancelled',
      'pending': 'created'
    };

    const action = statusActionMap[status];
    if (action) {
      await createProcurementNotification(requestId, action, req.user.name);
    }

    // Notify ticket owner in database
    if (ticket) {
      await createComprehensiveNotification({
        user_id: ticket.user_id,
        title: `🛒 Equipment Request ${status.toUpperCase()}`,
        message: `Your equipment request for "${currentRequest.item_name}" has been ${status} by ${req.user.name}.`,
        type: 'procurement_update',
        related_ticket_id: parseInt(currentRequest.ticket_id),
        related_request_id: requestId,
        priority: 'high'
      });
    }

    console.log('✅ Procurement request status updated');

    res.json({
      success: true,
      message: 'Procurement request status updated successfully'
    });

  } catch (error) {
    console.error('❌ Update procurement status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update procurement request status: ' + error.message
    });
  }
});

// FIXED: Add message to procurement request with notification
app.post('/api/procurement-requests/:requestId/messages', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { message, sender_id, sender_name, sender_role } = req.body;

    console.log('💬 Adding message to procurement request:', requestId, 'from:', sender_name);

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const newMessage = {
      message: message.trim(),
      sender_id,
      sender_name,
      sender_role,
      created_at: new Date()
    };

    // First get the procurement request to know who to notify
    const procurementRequest = await db.collection('procurement_requests').findOne({
      _id: new ObjectId(requestId)
    });

    if (!procurementRequest) {
      return res.status(404).json({
        success: false,
        message: 'Procurement request not found'
      });
    }

    // Add the message
    const result = await db.collection('procurement_requests').updateOne(
      { _id: new ObjectId(requestId) },
      { 
        $push: { messages: newMessage },
        $set: { updated_at: new Date() }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Procurement request not found'
      });
    }

    console.log('✅ Message added to procurement request');

    // 🔔 SEND PROCUREMENT MESSAGE NOTIFICATION
    await createProcurementMessageNotification(
      requestId, 
      sender_id, 
      sender_name, 
      message.trim()
    );

    res.json({
      success: true,
      message: 'Message added successfully'
    });

  } catch (error) {
    console.error('❌ Add message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add message: ' + error.message
    });
  }
});





// Delete procurement request - WITH EMAIL NOTIFICATIONS
app.delete('/api/procurement-requests/:requestId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { requestId } = req.params;

    console.log('🗑️ Deleting procurement request:', requestId);

    const procurementRequest = await db.collection('procurement_requests').findOne({
      _id: new ObjectId(requestId)
    });

    if (!procurementRequest) {
      return res.status(404).json({
        success: false,
        message: 'Procurement request not found'
      });
    }

    // Check permissions
    const canDelete = req.user.role === 'admin' || 
                     procurementRequest.requested_by === req.user.id;
    
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only request owner or admin can delete procurement requests.'
      });
    }

    const result = await db.collection('procurement_requests').deleteOne({
      _id: new ObjectId(requestId)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Procurement request not found'
      });
    }

    console.log('✅ Procurement request deleted');

    // 🔔 SEND EMAIL NOTIFICATION FOR PROCUREMENT DELETION
    await createComprehensiveNotification({
      user_id: procurementRequest.requested_by,
      title: 'Equipment Request Deleted',
      message: `Your equipment request for "${procurementRequest.item_name}" has been deleted.`,
      type: 'procurement_deleted',
      related_ticket_id: procurementRequest.ticket_id,
      priority: 'high'
    });

    // Notify assigned officer if exists
    const ticket = await db.collection('tickets').findOne({ 
      ticket_id: parseInt(procurementRequest.ticket_id) 
    });
    
    if (ticket && ticket.assigned_to && ticket.assigned_to !== procurementRequest.requested_by) {
      await createComprehensiveNotification({
        user_id: ticket.assigned_to,
        title: 'Equipment Request Deleted',
        message: `Equipment request for "${procurementRequest.item_name}" in ticket #${procurementRequest.ticket_id} has been deleted.`,
        type: 'procurement_deleted',
        related_ticket_id: procurementRequest.ticket_id,
        priority: 'medium'
      });
    }

    res.json({
      success: true,
      message: 'Procurement request deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete procurement request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete procurement request: ' + error.message
    });
  }
});

// Delete all messages for a procurement request
app.delete('/api/procurement-requests/:requestId/messages', async (req, res) => {
  try {
    const { requestId } = req.params;

    console.log('🗑️ Clearing messages for procurement request:', requestId);

    const db = getDB();
    await db.collection('procurement_requests').updateOne(
      { _id: new ObjectId(requestId) },
      { 
        $set: { 
          messages: [],
          updated_at: new Date()
        }
      }
    );

    console.log('✅ Messages cleared');

    res.json({
      success: true,
      message: 'Messages cleared successfully'
    });

  } catch (error) {
    console.error('❌ Clear messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear messages'
    });
  }
});

// Update procurement request status
app.put('/api/procurement-requests/:requestId/status', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, admin_notes } = req.body;

    console.log('🔄 Updating procurement request status:', requestId, 'to:', status);

    const db = getDB();
    const updateData = {
      status: status,
      updated_at: new Date()
    };

    if (admin_notes) {
      updateData.admin_notes = admin_notes;
    }

    const result = await db.collection('procurement_requests').updateOne(
      { _id: new ObjectId(requestId) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Procurement request not found'
      });
    }

    // Send notification to the requester
    try {
      const procurementRequest = await db.collection('procurement_requests').findOne({
        _id: new ObjectId(requestId)
      });

      if (procurementRequest) {
       await createComprehensiveNotification({
  user_id: procurementRequest.requested_by,
  title: 'Procurement Request Updated',
  message: `Your equipment request for ${procurementRequest.item_name} has been ${status}`,
  type: 'procurement_update',
  related_ticket_id: procurementRequest.ticket_id,
  related_request_id: requestId,
  priority: 'high'
});
      }
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
    }

    console.log('✅ Procurement request status updated');

    res.json({
      success: true,
      message: 'Procurement request status updated successfully'
    });

  } catch (error) {
    console.error('❌ Update procurement status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update procurement request status: ' + error.message
    });
  }
});



// ========== BACKUP SYSTEM ==========

// Create backup collection indexes
async function createBackupIndexes() {
  try {
    await db.collection('user_backups').createIndex({ user_id: 1 });
    await db.collection('user_backups').createIndex({ deleted_at: -1 });
    await db.collection('ticket_backups').createIndex({ ticket_id: 1 });
    await db.collection('ticket_backups').createIndex({ deleted_at: -1 });
    await db.collection('system_backups').createIndex({ created_at: -1 });
    console.log('✅ Backup indexes created');
  } catch (error) {
    console.error('❌ Backup index creation error:', error.message);
  }
}

// Call this after database initialization
// Add: await createBackupIndexes(); after initializeDatabase();

// ========== BACKUP USER BEFORE DELETION ==========
async function backupUserData(userId, deletedBy) {
  try {
    console.log(`💾 Creating backup for user ${userId}...`);
    
    // Get user data
    const user = await db.collection('users').findOne({ user_id: parseInt(userId) });
    if (!user) {
      console.log(`❌ User ${userId} not found for backup`);
      return null;
    }
    
    // Get user's tickets
    const userTickets = await db.collection('tickets').find({ user_id: parseInt(userId) }).toArray();
    
    // Get user's comments
    const userComments = await db.collection('comments').find({ author_id: parseInt(userId) }).toArray();
    
    // Get user's ticket logs
    const userLogs = await db.collection('ticket_logs').find({ changed_by: parseInt(userId) }).toArray();
    
    // Get user's notifications
    const userNotifications = await db.collection('notifications').find({ user_id: parseInt(userId) }).toArray();
    
    // Get user's procurement requests
    const userProcurement = await db.collection('procurement_requests').find({ requested_by: userId }).toArray();
    
    // Create backup document
    const backupDoc = {
      user_id: parseInt(userId),
      user_data: user,
      tickets: userTickets,
      comments: userComments,
      logs: userLogs,
      notifications: userNotifications,
      procurement_requests: userProcurement,
      deleted_by: deletedBy,
      deleted_by_name: 'Admin',
      deleted_at: new Date(),
      restored: false,
      restored_at: null,
      restored_by: null
    };
    
    // Save backup
    await db.collection('user_backups').insertOne(backupDoc);
    
    // Also backup each ticket individually
    for (const ticket of userTickets) {
      const ticketBackup = {
        ticket_id: ticket.ticket_id,
        ticket_data: ticket,
        comments: userComments.filter(c => c.ticket_id === ticket.ticket_id),
        logs: userLogs.filter(l => l.ticket_id === ticket.ticket_id),
        user_id: parseInt(userId),
        deleted_at: new Date(),
        restored: false
      };
      await db.collection('ticket_backups').insertOne(ticketBackup);
    }
    
    // Send backup email to admin
    try {
      const backupSummary = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #dc3545;">🗑️ Account Deleted - Backup Created</h2>
          <p><strong>Deleted User:</strong> ${user.name} (${user.email})</p>
          <p><strong>User ID:</strong> ${userId}</p>
          <p><strong>Role:</strong> ${user.role}</p>
          <p><strong>Deleted At:</strong> ${new Date().toLocaleString()}</p>
          <hr>
          <h3>📊 Backup Summary:</h3>
          <ul>
            <li><strong>Tickets:</strong> ${userTickets.length}</li>
            <li><strong>Comments:</strong> ${userComments.length}</li>
            <li><strong>Logs:</strong> ${userLogs.length}</li>
            <li><strong>Notifications:</strong> ${userNotifications.length}</li>
            <li><strong>Procurement Requests:</strong> ${userProcurement.length}</li>
          </ul>
          <hr>
          <p style="color: #28a745;"><strong>✅ All data has been backed up and can be restored.</strong></p>
          <p style="color: #888; font-size: 12px;">Backup ID: ${backupDoc._id}</p>
        </div>
      `;
      
      const mailOptions = {
        from: '"IT Help Desk Backup" <hussenseid670@gmail.com>',
        to: process.env.BACKUP_EMAIL || 'seidhussen0729@gmail.com',
        subject: `💾 Backup Created: ${user.name} (${user.email}) - Account Deleted`,
        html: backupSummary
      };
      
      await transporter.sendMail(mailOptions);
      console.log('✅ Backup email sent to admin');
    } catch (emailError) {
      console.error('❌ Backup email failed:', emailError.message);
    }
    
    console.log(`✅ Backup created for user ${userId} with ${userTickets.length} tickets`);
    return backupDoc._id;
    
  } catch (error) {
    console.error('❌ Backup user data error:', error);
    return null;
  }
}

// ========== BACKUP TICKET BEFORE DELETION ==========
async function backupTicketData(ticketId) {
  try {
    console.log(`💾 Creating backup for ticket ${ticketId}...`);
    
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) return null;
    
    const comments = await db.collection('comments').find({ ticket_id: parseInt(ticketId) }).toArray();
    const logs = await db.collection('ticket_logs').find({ ticket_id: parseInt(ticketId) }).toArray();
    
    const backupDoc = {
      ticket_id: parseInt(ticketId),
      ticket_data: ticket,
      comments: comments,
      logs: logs,
      deleted_at: new Date(),
      restored: false
    };
    
    await db.collection('ticket_backups').insertOne(backupDoc);
    console.log(`✅ Backup created for ticket ${ticketId}`);
    return backupDoc._id;
    
  } catch (error) {
    console.error('❌ Backup ticket error:', error);
    return null;
  }
}

// ========== SYSTEM-WIDE BACKUP ==========
async function createSystemBackup(createdBy) {
  try {
    console.log('💾 Creating system-wide backup...');
    
    const users = await db.collection('users').find({}, { projection: { password: 0 } }).toArray();
    const tickets = await db.collection('tickets').find({}).toArray();
    const teams = await db.collection('teams').find({}).toArray();
    const comments = await db.collection('comments').find({}).toArray();
    const logs = await db.collection('ticket_logs').find({}).toArray();
    const notifications = await db.collection('notifications').find({}).toArray();
    const procurement = await db.collection('procurement_requests').find({}).toArray();
    
    const backupDoc = {
      backup_type: 'full_system',
      created_by: createdBy,
      created_at: new Date(),
      data: {
        users: users,
        tickets: tickets,
        teams: teams,
        comments: comments,
        logs: logs,
        notifications: notifications,
        procurement_requests: procurement
      },
      stats: {
        users_count: users.length,
        tickets_count: tickets.length,
        teams_count: teams.length,
        comments_count: comments.length,
        logs_count: logs.length
      }
    };
    
    const result = await db.collection('system_backups').insertOne(backupDoc);
    console.log(`✅ System backup created: ${result.insertedId}`);
    
    // Send backup email
    try {
      const mailOptions = {
        from: '"IT Help Desk Backup" <hussenseid670@gmail.com>',
        to: process.env.BACKUP_EMAIL || 'seidhussen0729@gmail.com',
        subject: `💾 System Backup Created - ${new Date().toLocaleDateString()}`,
        html: `
          <h2>💾 System Backup Created</h2>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Created By:</strong> ${createdBy}</p>
          <hr>
          <h3>Backup Statistics:</h3>
          <ul>
            <li>Users: ${users.length}</li>
            <li>Tickets: ${tickets.length}</li>
            <li>Teams: ${teams.length}</li>
            <li>Comments: ${comments.length}</li>
            <li>Logs: ${logs.length}</li>
          </ul>
          <p><strong>Backup ID:</strong> ${result.insertedId}</p>
        `
      };
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('❌ Backup email failed:', emailError.message);
    }
    
    return result.insertedId;
    
  } catch (error) {
    console.error('❌ System backup error:', error);
    return null;
  }
}

// ========== BACKUP ROUTES ==========

// Get all user backups (Admin only)
app.get('/api/admin/backups/users', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const backups = await db.collection('user_backups')
      .find({})
      .sort({ deleted_at: -1 })
      .toArray();
    
    // Remove password from user data in backups
    const safeBackups = backups.map(backup => {
      if (backup.user_data && backup.user_data.password) {
        backup.user_data = { ...backup.user_data, password: '***HIDDEN***' };
      }
      return backup;
    });
    
    res.json({
      success: true,
      backups: safeBackups
    });
  } catch (error) {
    console.error('❌ Get user backups error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch backups' });
  }
});

// Get single user backup
app.get('/api/admin/backups/users/:backupId', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { backupId } = req.params;
    
    const backup = await db.collection('user_backups').findOne({ 
      _id: new ObjectId(backupId) 
    });
    
    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup not found' });
    }
    
    // Hide password
    if (backup.user_data && backup.user_data.password) {
      backup.user_data = { ...backup.user_data, password: '***HIDDEN***' };
    }
    
    res.json({
      success: true,
      backup: backup
    });
  } catch (error) {
    console.error('❌ Get backup error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch backup' });
  }
});

// Restore user from backup (Admin only)
// Restore user from backup - FAST VERSION
app.post('/api/admin/backups/users/:backupId/restore', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { backupId } = req.params;
    
    console.log(`🔄 FAST RESTORE: ${backupId}`);
    
    const backup = await db.collection('user_backups').findOne({ _id: new ObjectId(backupId) });
    
    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup not found' });
    }
    
    if (backup.restored) {
      return res.status(400).json({ success: false, message: 'This backup has already been restored' });
    }
    
    // Check if user email already exists
    const existingUser = await db.collection('users').findOne({ email: backup.user_data.email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: `User with email ${backup.user_data.email} already exists.` });
    }
    
    // 🔥 RESTORE ALL IN PARALLEL - SUPER FAST
    const restorePromises = [db.collection('users').insertOne(backup.user_data)];
    
    if (backup.tickets && backup.tickets.length > 0) {
      restorePromises.push(db.collection('tickets').insertMany(backup.tickets));
    }
    if (backup.comments && backup.comments.length > 0) {
      restorePromises.push(db.collection('comments').insertMany(backup.comments));
    }
    if (backup.logs && backup.logs.length > 0) {
      restorePromises.push(db.collection('ticket_logs').insertMany(backup.logs));
    }
    if (backup.notifications && backup.notifications.length > 0) {
      restorePromises.push(db.collection('notifications').insertMany(backup.notifications));
    }
    if (backup.procurement_requests && backup.procurement_requests.length > 0) {
      restorePromises.push(db.collection('procurement_requests').insertMany(backup.procurement_requests));
    }
    
    await Promise.all(restorePromises);
    
    // Mark backup as restored
    await db.collection('user_backups').updateOne(
      { _id: new ObjectId(backupId) },
      { $set: { restored: true, restored_at: new Date(), restored_by: req.user.id, restored_by_name: req.user.name } }
    );
    
    console.log(`✅ User ${backup.user_data.name} restored in milliseconds`);
    
    // Send response immediately
    res.json({
      success: true,
      message: `User ${backup.user_data.name} restored successfully!`
    });
    
    // Send email in background (non-blocking)
    try {
      if (backup.user_data.email) {
        transporter.sendMail({
          from: '"IT Help Desk" <hussenseid670@gmail.com>',
          to: backup.user_data.email,
          subject: '✅ Account Restored - IT Help Desk',
          html: `<h2>Account Restored</h2><p>Hello ${backup.user_data.name}, your account has been restored. You can now login.</p>`
        }).catch(e => console.error('Restore email failed:', e.message));
      }
    } catch (e) { /* ignore */ }
    
  } catch (error) {
    console.error('❌ Restore user error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore user: ' + error.message });
  }
});

// Delete backup (Admin only)
app.delete('/api/admin/backups/users/:backupId', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { backupId } = req.params;
    
    const result = await db.collection('user_backups').deleteOne({ 
      _id: new ObjectId(backupId) 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Backup not found' });
    }
    
    res.json({
      success: true,
      message: 'Backup deleted permanently'
    });
  } catch (error) {
    console.error('❌ Delete backup error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete backup' });
  }
});

// Create manual system backup (Admin only)
app.post('/api/admin/backups/system', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const backupId = await createSystemBackup(req.user.name);
    
    if (backupId) {
      res.json({
        success: true,
        message: 'System backup created successfully',
        backup_id: backupId
      });
    } else {
      res.status(500).json({ success: false, message: 'Failed to create backup' });
    }
  } catch (error) {
    console.error('❌ System backup error:', error);
    res.status(500).json({ success: false, message: 'Failed to create backup' });
  }
});

// Get system backups list
app.get('/api/admin/backups/system', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const backups = await db.collection('system_backups')
      .find({}, { projection: { data: 0 } }) // Exclude large data
      .sort({ created_at: -1 })
      .limit(20)
      .toArray();
    
    res.json({
      success: true,
      backups: backups
    });
  } catch (error) {
    console.error('❌ Get system backups error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch backups' });
  }
});

// Get ticket backups
app.get('/api/admin/backups/tickets', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const backups = await db.collection('ticket_backups')
      .find({})
      .sort({ deleted_at: -1 })
      .limit(50)
      .toArray();
    
    res.json({
      success: true,
      backups: backups
    });
  } catch (error) {
    console.error('❌ Get ticket backups error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch backups' });
  }
});

// Restore ticket from backup
app.post('/api/admin/backups/tickets/:backupId/restore', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { backupId } = req.params;
    
    const backup = await db.collection('ticket_backups').findOne({ 
      _id: new ObjectId(backupId) 
    });
    
    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup not found' });
    }
    
    // Check if ticket already exists
    const existingTicket = await db.collection('tickets').findOne({ 
      ticket_id: backup.ticket_id 
    });
    
    if (existingTicket) {
      return res.status(400).json({ 
        success: false, 
        message: `Ticket #${backup.ticket_id} already exists` 
      });
    }
    
    // Restore ticket
    await db.collection('tickets').insertOne(backup.ticket_data);
    
    // Restore comments
    if (backup.comments && backup.comments.length > 0) {
      await db.collection('comments').insertMany(backup.comments);
    }
    
    // Restore logs
    if (backup.logs && backup.logs.length > 0) {
      await db.collection('ticket_logs').insertMany(backup.logs);
    }
    
    // Mark as restored
    await db.collection('ticket_backups').updateOne(
      { _id: new ObjectId(backupId) },
      { $set: { restored: true, restored_at: new Date() } }
    );
    
    res.json({
      success: true,
      message: `Ticket #${backup.ticket_id} restored successfully`
    });
    
  } catch (error) {
    console.error('❌ Restore ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore ticket' });
  }
});



// ========== COMPREHENSIVE NOTIFICATION SYSTEM ==========

// Notification for ticket assignment
async function createTicketAssignmentNotification(ticketId, assignedOfficerId) {
  const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
  if (!ticket) return;

  // Notification for the assigned officer
  await createComprehensiveNotification({
  user_id: officer.user_id,
  title: 'New Ticket Assigned from Queue',
  message: `A ${ticket.issue_type} ticket has been automatically assigned to you from the queue: "${ticket.description.substring(0, 100)}..."`,
  type: 'ticket_assigned',
  related_ticket_id: ticketId,
  priority: 'high'
});

await createComprehensiveNotification({
  user_id: ticket.user_id,
  title: 'Ticket Assigned',
  message: `Your ticket has been assigned to ${officer.name} and is now in progress.`,
  type: 'ticket_updated',
  related_ticket_id: ticketId,
  priority: 'medium'
});
}

// Notification for ticket status changes
async function createTicketStatusNotification(ticketId, newStatus, changedByName) {
  const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
  if (!ticket) return;

  const statusMessages = {
    'In Progress': `Your ticket #${ticketId} is now being worked on by ${changedByName}.`,
    'Resolved': `Your ticket #${ticketId} has been resolved by ${changedByName}. Please review and close if satisfied.`,
    'Closed': `Your ticket #${ticketId} has been closed.`,
    'Queued': `Your ticket #${ticketId} has been placed in queue due to high workload.`
  };

  if (statusMessages[newStatus]) {
    await createNotification({
      user_id: ticket.user_id,
      title: `Ticket ${newStatus}`,
      message: statusMessages[newStatus],
      type: 'ticket_status',
      related_ticket_id: ticketId
    });
  }
}

// Notification for comments
async function createCommentNotification(ticketId, commenterId, commenterName, commentText) {
  const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
  if (!ticket) return;

  // Notify ticket owner (if commenter is not the owner)
  if (ticket.user_id !== commenterId) {
    await createNotification({
      user_id: ticket.user_id,
      title: 'New Comment on Your Ticket',
      message: `${commenterName} commented on ticket #${ticketId}: "${commentText.substring(0, 100)}..."`,
      type: 'comment_added',
      related_ticket_id: ticketId
    });
  }

  // Notify assigned officer (if different from commenter and ticket owner)
  if (ticket.assigned_to && ticket.assigned_to !== commenterId && ticket.assigned_to !== ticket.user_id) {
    await createNotification({
      user_id: ticket.assigned_to,
      title: 'New Comment on Assigned Ticket',
      message: `${commenterName} commented on ticket #${ticketId}: "${commentText.substring(0, 100)}..."`,
      type: 'comment_added',
      related_ticket_id: ticketId
    });
  }
}








// ========== FIXED PROCUREMENT NOTIFICATION FUNCTIONS ==========

// FIXED: Enhanced procurement notification function
async function createProcurementNotification(requestId, action, actionBy) {
  try {
    console.log(`🔔 Creating procurement notification for request: ${requestId}, action: ${action}`);
    
    const request = await db.collection('procurement_requests').findOne({ _id: new ObjectId(requestId) });
    if (!request) {
      console.log('❌ Procurement request not found for notification');
      return;
    }

    const actionConfig = {
      'created': {
        title: '🛒 New Equipment Request',
        message: `New equipment request submitted for "${request.item_name}" in ticket #${request.ticket_id}`,
        priority: 'high'
      },
      'approved': {
        title: '✅ Equipment Request Approved',
        message: `Your equipment request for "${request.item_name}" has been approved by ${actionBy}`,
        priority: 'high'
      },
      'rejected': {
        title: '❌ Equipment Request Rejected',
        message: `Your equipment request for "${request.item_name}" has been rejected by ${actionBy}`,
        priority: 'high'
      },
      'ordered': {
        title: '📦 Equipment Ordered',
        message: `Your equipment request for "${request.item_name}" has been ordered`,
        priority: 'medium'
      },
      'delivered': {
        title: '🎁 Equipment Delivered',
        message: `Your equipment request for "${request.item_name}" has been delivered`,
        priority: 'medium'
      },
      'cancelled': {
        title: '🚫 Request Cancelled',
        message: `Your equipment request for "${request.item_name}" has been cancelled by ${actionBy}`,
        priority: 'high'
      }
    };

    const config = actionConfig[action];
    if (config) {
      // Notify the requester
      await createComprehensiveNotification({
        user_id: request.requested_by,
        title: config.title,
        message: config.message,
        type: 'procurement',
        related_ticket_id: request.ticket_id,
        related_request_id: requestId,
        priority: config.priority
      });

      // Notify all senior officers in the team about new procurement requests
      if (action === 'created') {
        const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(request.ticket_id) });
        if (ticket && ticket.team_id) {
          const teamOfficers = await db.collection('users').find({
            team_id: ticket.team_id,
            role: 'senior',
            is_active: true
          }).toArray();

          for (const officer of teamOfficers) {
            if (officer.user_id !== request.requested_by) {
              await createComprehensiveNotification({
                user_id: officer.user_id,
                title: '🛒 New Equipment Request',
                message: `New equipment request for "${request.item_name}" in ticket #${request.ticket_id}`,
                type: 'procurement',
                related_ticket_id: request.ticket_id,
                related_request_id: requestId,
                priority: 'medium'
              });
            }
          }
        }
      }

      // Notify assigned officer about procurement updates
      const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(request.ticket_id) });
      if (ticket && ticket.assigned_to && ticket.assigned_to !== request.requested_by) {
        await createComprehensiveNotification({
          user_id: ticket.assigned_to,
          title: config.title,
          message: `Equipment request for ticket #${request.ticket_id}: ${config.message}`,
          type: 'procurement',
          related_ticket_id: request.ticket_id,
          related_request_id: requestId,
          priority: 'medium'
        });
      }
      
      console.log(`✅ Procurement notification sent for action: ${action}`);
    }
  } catch (error) {
    console.error('❌ Procurement notification error:', error);
  }
}

// FIXED: Enhanced procurement message notification
async function createProcurementMessageNotification(requestId, senderId, senderName, message) {
  try {
    console.log(`🔔 Creating procurement message notification for request: ${requestId}`);
    
    const request = await db.collection('procurement_requests').findOne({ _id: new ObjectId(requestId) });
    if (!request) {
      console.log('❌ Procurement request not found for notification');
      return;
    }

    const usersToNotify = new Set();

    // Notify the requester (if sender is not the requester)
    if (request.requested_by !== senderId) {
      usersToNotify.add(request.requested_by);
      console.log(`🔔 Will notify requester: ${request.requested_by}`);
    }

    // Notify assigned officer about procurement messages
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(request.ticket_id) });
    if (ticket && ticket.assigned_to && ticket.assigned_to !== senderId) {
      usersToNotify.add(ticket.assigned_to);
      console.log(`🔔 Will notify assigned officer: ${ticket.assigned_to}`);
    }

    // Notify all users who sent messages in this procurement request
    if (request.messages && request.messages.length > 0) {
      request.messages.forEach(msg => {
        if (msg.sender_id && msg.sender_id !== senderId) {
          usersToNotify.add(msg.sender_id);
          console.log(`🔔 Will notify message participant: ${msg.sender_id}`);
        }
      });
    }

    console.log(`🔔 Total users to notify: ${usersToNotify.size}`);

    // Create notifications for all relevant users
    for (const userId of usersToNotify) {
      await createComprehensiveNotification({
        user_id: userId,
        title: '💬 Equipment Message',
        message: `${senderName} sent a message about "${request.item_name}": "${message.substring(0, 100)}..."`,
        type: 'procurement_message',
        related_ticket_id: request.ticket_id,
        related_request_id: requestId,
        priority: 'medium'
      });
    }

    console.log(`✅ Procurement message notifications completed for request: ${requestId}`);

  } catch (error) {
    console.error('❌ Procurement message notification error:', error);
  }
}




// Test email endpoint
app.post('/api/test-email', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    
    const testHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">Test Email from IT Help Desk</h2>
        <p>This is a test email to verify email notifications are working.</p>
        <p>If you received this, email notifications are configured correctly!</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">
          Ethiopian Statistical Service IT Help Desk<br>
          Test Email - ${new Date().toISOString()}
        </p>
      </div>
    `;

    const result = await sendEmailNotification(email, 'Test Email - IT Help Desk', testHtml);
    
    if (result) {
      res.json({ success: true, message: 'Test email sent successfully!' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to send test email' });
    }
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, message: 'Email test failed: ' + error.message });
  }
});








// ========== EMAIL NOTIFICATION FUNCTIONS ==========

// Enhanced email notification function
async function sendEmailNotification(userId, title, message) {
  try {
    console.log(`📧 Attempting to send email to user ${userId}`);
    
    // Get user email from database
    const user = await db.collection('users').findOne({ user_id: userId });
    if (!user || !user.email) {
      console.log(`❌ User ${userId} not found or no email address`);
      return false;
    }

    console.log(`📧 Sending email to: ${user.email}`);

    const mailOptions = {
      from: '"IT Help Desk" <hussenseid670@gmail.com>',
      to: user.email,
      subject: `IT Help Desk: ${title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="background: #007bff; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">IT Help Desk Notification</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">${title}</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">${message}</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Time:</strong> ${new Date().toLocaleString()}<br>
                <strong>User:</strong> ${user.name}
              </p>
            </div>
            <p style="color: #888; font-size: 14px;">
              This is an automated notification from the IT Help Desk System.
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 12px;">
              Ethiopian Statistical Service IT Help Desk
            </p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email notification sent to: ${user.email}`);
    return true;
  } catch (error) {
    console.error('❌ Email notification failed:', error.message);
    return false;
  }
}

// Enhanced notification function with email for ALL events
async function createComprehensiveNotification(notificationData) {
  if (!isDatabaseConnected) {
    console.log('❌ Database not connected for notification creation');
    return false;
  }

  try {
    const notificationId = await getNextSequence('notificationId');
    
    const notificationDoc = {
      _id: notificationId,
      notification_id: notificationId,
      user_id: notificationData.user_id,
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.type || 'system',
      related_ticket_id: notificationData.related_ticket_id || null,
      related_request_id: notificationData.related_request_id || null,
      priority: notificationData.priority || 'medium',
      read: false,
      created_at: new Date(),
      updated_at: new Date()
    };

    await db.collection('notifications').insertOne(notificationDoc);
    console.log(`✅ Database notification created: ${notificationData.title} for user ${notificationData.user_id}`);

    // 🔥 SEND EMAIL NOTIFICATION FOR ALL EVENTS
    try {
      await sendEmailNotification(notificationData.user_id, notificationData.title, notificationData.message);
      console.log(`📧 Email notification sent for: ${notificationData.title}`);
    } catch (emailError) {
      console.error('❌ Email notification failed (non-critical):', emailError.message);
      // Continue even if email fails
    }

    return true;
  } catch (error) {
    console.error('❌ Create notification error:', error);
    return false;
  }
}


// Test email notification endpoint
app.post('/api/test-email-notification', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { userId, title, message } = req.body;
    
    console.log('🧪 Testing email notification for user:', userId);
    
    const success = await sendEmailNotification(userId, title, message);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Test email notification sent successfully!' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send test email notification' 
      });
    }
  } catch (error) {
    console.error('Test email notification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Email test failed: ' + error.message 
    });
  }
});

// Simple email test
app.post('/api/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    const mailOptions = {
      from: '"IT Help Desk Test" <hussenseid670@gmail.com>',
      to: email,
      subject: 'Test Email - IT Help Desk',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007bff;">✅ Test Email Successful!</h2>
          <p>This is a test email from your IT Help Desk system.</p>
          <p>If you received this, email notifications are working correctly!</p>
          <p><strong>Time:</strong> ${new Date().toString()}</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Test email sent to: ${email}`);
    
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send test email: ' + error.message });
  }
});



// ========== ADMIN NOTIFICATION FUNCTION ==========
// This function sends ALL notifications to the admin email
async function notifyAdmin(title, message, relatedData = {}) {
  try {
    const adminEmail = 'seidhussen0729@gmail.com';
    
    const mailOptions = {
      from: '"IT Help Desk System" <hussenseid670@gmail.com>',
      to: adminEmail,
      subject: `🔔 Admin Alert: ${title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="background: #dc3545; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0;">🔔 Admin Notification</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">${title}</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.6;">${message}</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                <strong>Time:</strong> ${new Date().toLocaleString()}<br>
                ${relatedData.ticketId ? `<strong>Ticket ID:</strong> #${relatedData.ticketId}<br>` : ''}
                ${relatedData.userName ? `<strong>User:</strong> ${relatedData.userName}<br>` : ''}
                ${relatedData.userEmail ? `<strong>Email:</strong> ${relatedData.userEmail}<br>` : ''}
                ${relatedData.action ? `<strong>Action:</strong> ${relatedData.action}<br>` : ''}
              </p>
            </div>
            <p style="color: #888; font-size: 14px;">
              This is an automated admin notification from the IT Help Desk System.
            </p>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 12px;">
              Ethiopian Statistical Service IT Help Desk - Admin Alert
            </p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Admin notification sent to: ${adminEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Admin notification failed:', error.message);
    return false;
  }
}



// ========== EMERGENCY FIX: Reset corrupted counters ==========
app.post('/api/admin/fix-counters', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    console.log('🔄 EMERGENCY: Fixing corrupted counters...');
    
    // Delete and recreate counters
    await db.collection('counters').deleteMany({});
    
    // Get current max values
    const maxUserId = await db.collection('users').find().sort({ user_id: -1 }).limit(1).toArray();
    const maxTicketId = await db.collection('tickets').find().sort({ ticket_id: -1 }).limit(1).toArray();
    const maxNotificationId = await db.collection('notifications').find().sort({ notification_id: -1 }).limit(1).toArray();
    
    // Reinitialize counters with proper values
    await db.collection('counters').insertMany([
      { 
        _id: 'userId', 
        sequence_value: maxUserId.length > 0 ? maxUserId[0].user_id + 1 : 3000 
      },
      { 
        _id: 'ticketId', 
        sequence_value: maxTicketId.length > 0 ? maxTicketId[0].ticket_id + 1 : 10000 
      },
      { 
        _id: 'notificationId', 
        sequence_value: maxNotificationId.length > 0 ? maxNotificationId[0].notification_id + 1 : 1 
      },
      { _id: 'teamId', sequence_value: 10 },
      { _id: 'commentId', sequence_value: 1 },
      { _id: 'logId', sequence_value: 1 }
    ]);
    
    console.log('✅ Counters reset successfully');
    
    res.json({
      success: true,
      message: 'Counters reset successfully. Server should work normally now.',
      new_values: {
        userId: maxUserId.length > 0 ? maxUserId[0].user_id + 1 : 3000,
        ticketId: maxTicketId.length > 0 ? maxTicketId[0].ticket_id + 1 : 10000,
        notificationId: maxNotificationId.length > 0 ? maxNotificationId[0].notification_id + 1 : 1
      }
    });
  } catch (error) {
    console.error('❌ Counter fix error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== ENHANCED getNextSequence Function ==========
async function getNextSequence(sequenceName) {
  if (!isDatabaseConnected) {
    console.error('Database not connected for sequence');
    return Math.floor(Math.random() * 10000) + 1;
  }

  try {
    // First, check if counter exists
    const existingCounter = await db.collection('counters').findOne({ _id: sequenceName });
    
    if (!existingCounter) {
      // Initialize the counter if it doesn't exist
      const initialValue = sequenceName === 'userId' ? 3000 : 
                          sequenceName === 'ticketId' ? 10000 : 1;
      
      await db.collection('counters').insertOne({
        _id: sequenceName,
        sequence_value: initialValue
      });
      return initialValue;
    }
    
    // Use findOneAndUpdate for atomic operation
    const result = await db.collection('counters').findOneAndUpdate(
      { _id: sequenceName },
      { $inc: { sequence_value: 1 } },
      { 
        returnDocument: 'after',
        upsert: true
      }
    );
    
    if (result && result.value) {
      return result.value.sequence_value;
    } else {
      // Fallback: manually increment
      const current = await db.collection('counters').findOne({ _id: sequenceName });
      const newValue = (current?.sequence_value || 0) + 1;
      await db.collection('counters').updateOne(
        { _id: sequenceName },
        { $set: { sequence_value: newValue } },
        { upsert: true }
      );
      return newValue;
    }
  } catch (error) {
    console.error('Sequence error for', sequenceName, ':', error);
    // Emergency fallback - generate random ID
    return Math.floor(Math.random() * 100000) + 1000;
  }
}

// ========== FIXED NOTIFICATION ROUTES ==========

// Get user notifications - FIXED VERSION
app.get('/api/notifications', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { limit = 50, unread_only = false } = req.query;
    
    console.log(`🔔 Fetching notifications for user ${req.user.id}`);
    
    let query = { user_id: req.user.id };
    if (unread_only === 'true') {
      query.read = false;
    }
    
    const notifications = await db.collection('notifications')
      .find(query)
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .toArray();

    // Get unread count
    const unreadCount = await db.collection('notifications').countDocuments({
      user_id: req.user.id,
      read: false
    });

    console.log(`✅ Found ${notifications.length} notifications for user ${req.user.id} (${unreadCount} unread)`);
    
    res.json({
      success: true,
      notifications,
      unread_count: unreadCount
    });
  } catch (error) {
    console.error('❌ Get notifications error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch notifications: ' + error.message 
    });
  }
});

// Mark notification as read - FIXED VERSION
app.put('/api/notifications/:notificationId/read', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    console.log(`📖 Marking notification ${notificationId} as read for user ${req.user.id}`);
    
    const result = await db.collection('notifications').updateOne(
      { 
        _id: new ObjectId(notificationId),
        user_id: req.user.id 
      },
      { 
        $set: { 
          read: true,
          updated_at: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found or access denied' 
      });
    }

    console.log(`✅ Notification ${notificationId} marked as read`);
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('❌ Mark notification as read error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark notification as read: ' + error.message 
    });
  }
});

// Mark all notifications as read - FIXED VERSION
app.put('/api/notifications/mark-all-read', authenticateToken, requireDatabase, async (req, res) => {
  try {
    console.log(`📖 Marking all notifications as read for user ${req.user.id}`);
    
    const result = await db.collection('notifications').updateMany(
      { 
        user_id: req.user.id,
        read: false
      },
      { 
        $set: { 
          read: true,
          updated_at: new Date()
        } 
      }
    );

    console.log(`✅ ${result.modifiedCount} notifications marked as read`);
    
    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
      marked_count: result.modifiedCount
    });
  } catch (error) {
    console.error('❌ Mark all notifications as read error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark notifications as read: ' + error.message 
    });
  }
});

// Delete notification - FIXED VERSION
app.delete('/api/notifications/:notificationId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    console.log(`🗑️ Deleting notification ${notificationId} for user ${req.user.id}`);
    
    const result = await db.collection('notifications').deleteOne({
      _id: new ObjectId(notificationId),
      user_id: req.user.id
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found or access denied' 
      });
    }

    console.log(`✅ Notification ${notificationId} deleted`);
    
    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete notification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete notification: ' + error.message 
    });
  }
});




// Initialize and start server
async function startServer() {
  try {
    console.log('🚀 Starting Ticket Management System Server...');
    
    // Connect to MongoDB (will continue even if connection fails)
    await connectToMongoDB();
    
    // Initialize database if connected
    if (isDatabaseConnected) {
  await initializeDatabase();
  
  // Create backup collections
  try {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    if (!collectionNames.includes('user_backups')) {
      await db.createCollection('user_backups');
      console.log('✅ Created user_backups collection');
    }
    if (!collectionNames.includes('ticket_backups')) {
      await db.createCollection('ticket_backups');
      console.log('✅ Created ticket_backups collection');
    }
    if (!collectionNames.includes('system_backups')) {
      await db.createCollection('system_backups');
      console.log('✅ Created system_backups collection');
    }
  } catch (err) {
    console.error('❌ Backup collection error:', err.message);
  }
} else {
      console.log('⚠️  Server starting without database connection');
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🎉 Server successfully started on port ${PORT}`);
      console.log(`📍 Local: http://localhost:${PORT}`);
      console.log(`📍 Network: http://0.0.0.0:${PORT}`);
      console.log(`📊 Test endpoint: http://localhost:${PORT}/api/test`);
      console.log(`❤️ Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔔 Notification endpoint: http://localhost:${PORT}/api/notifications`);
      console.log(`🤖 AI Categories: Hardware, Software, Network, Security, Account, Database, Configuration, Maintenance, Other`);
      console.log(`🎯 ENHANCED QUEUE SYSTEM: Tickets automatically queue when officers have ≥3 tickets`);
      console.log(`🔄 Auto-processing queue every 20 seconds`);
      console.log(`🗄️ Database: ${isDatabaseConnected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`⏰ Server started at: ${new Date().toISOString()}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  console.log(`⏰ Shutdown initiated at: ${new Date().toISOString()}`);
  
    if (client) {
    await client.close();
    console.log('📊 MongoDB connection closed');
  }
  
  console.log('👋 Server shutdown completed');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();