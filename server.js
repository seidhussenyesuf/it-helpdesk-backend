const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcrypt');
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

async function connectToMongoDB() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    
    // Check if MongoDB URI is provided
    if (!MONGODB_URI || MONGODB_URI === 'mongodb://localhost:27017/ticket_system') {
      console.log('⚠️  Using default MongoDB URI. Make sure MongoDB is running locally.');
      console.log('💡 To use MongoDB Atlas, set MONGODB_URI in .env file');
    }
    
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    
    await client.connect();
    db = client.db(DB_NAME);
    isDatabaseConnected = true;
    
    console.log('✅ Connected to MongoDB successfully');
    
    // Create indexes
    await createIndexes();
    console.log('✅ Database indexes created');
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    isDatabaseConnected = false;
    
    console.log('\n💡 TROUBLESHOOTING TIPS:');
    console.log('1. Install MongoDB locally: https://www.mongodb.com/try/download/community');
    console.log('2. Or use MongoDB Atlas (cloud): https://www.mongodb.com/cloud/atlas');
    console.log('3. For local MongoDB, run: mongod --dbpath="C:\\data\\db"');
    console.log('4. Create .env file with MONGODB_URI=mongodb://localhost:27017/ticket_system');
    
    // Don't exit process, allow server to start without database
    return false;
  }
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
    
    const requiredCollections = ['users', 'teams', 'tickets', 'comments', 'ticket_logs', 'counters'];
    
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
        { _id: 'logId', sequence_value: 1 }
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

// Auto-increment sequence function
async function getNextSequence(sequenceName) {
  if (!isDatabaseConnected) {
    console.error('Database not connected for sequence');
    return Math.floor(Math.random() * 10000) + 1;
  }

  try {
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
      // If no result, initialize the counter
      await db.collection('counters').insertOne({
        _id: sequenceName,
        sequence_value: 1
      });
      return 1;
    }
  } catch (error) {
    console.error('Sequence error for', sequenceName, ':', error);
    return Math.floor(Math.random() * 10000) + 1;
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
    pass: process.env.EMAIL_PASSWORD || 'kluyzrmcjdovuvfu'
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

// ========== AI CLASSIFICATION FUNCTIONS ==========

// Enhanced ML training data
const enhancedClassifier = new natural.BayesClassifier();

// Extensive training data for better accuracy
const trainingData = [
  // Hardware issues (expanded)
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
  
  // Software issues (expanded)
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
  
  // Network issues (expanded)
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
  
  // Security issues (expanded)
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
  
  // Account issues (expanded)
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

  // Database issues (NEW)
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
  ['index fragmentation optimization needed', 'Database'],
  ['database security permissions access', 'Database'],
  ['data import export backup restore', 'Database'],
  ['database clustering high availability', 'Database'],
  
  // Configuration issues (NEW)
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
  ['firewall rule configuration changes', 'Configuration'],
  ['dns configuration domain name setup', 'Configuration'],
  ['email server configuration smtp imap', 'Configuration'],
  ['backup configuration schedule setup', 'Configuration'],
  ['security policy configuration settings', 'Configuration'],
  
  // Maintenance issues (NEW)
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
  ['hardware maintenance replacement parts', 'Maintenance'],
  ['software maintenance license renewal', 'Maintenance']
];

// Train the enhanced classifier
console.log('🤖 Training AI classifier with enhanced dataset...');
trainingData.forEach(([text, category]) => {
  enhancedClassifier.addDocument(text, category);
});
enhancedClassifier.train();
console.log('✅ AI classifier training completed');

// Enhanced AI classification with OpenAI
async function classifyTicketWithAI(description) {
  try {
    // First try the local classifier
    const localClassification = enhancedClassifier.getClassifications(description);
    const topLocalCategory = localClassification[0].label;
    const localConfidence = localClassification[0].value;
    
    console.log(`🤖 Local AI Classification: ${topLocalCategory} (${(localConfidence * 100).toFixed(1)}% confidence)`);
    
    // If local confidence is high enough, use it
    if (localConfidence > 0.7) {
      return { 
        issue_type: topLocalCategory, 
        confidence: localConfidence,
        method: 'local'
      };
    }

    // Otherwise try OpenAI if API key is available
    if (openai.apiKey && openai.apiKey !== 'your-openai-api-key-here') {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are an IT support ticket classification system. Classify the following ticket description into one of these categories: 
              Hardware, Software, Network, Security, Account, Database, Configuration, Maintenance, Other.
              
              Return JSON format: { "issue_type": "category", "confidence": 0.95 }
              
              Hardware: Issues with physical devices (computers, printers, monitors, keyboards, etc.)
              Software: Issues with applications, programs, operating systems
              Network: Internet, WiFi, connectivity, VPN issues
              Security: Viruses, malware, security breaches, access violations
              Account: Login, password, user account, permission issues
              Database: Data storage, retrieval, SQL, database performance
              Configuration: System settings, setup, configuration changes
              Maintenance: System updates, patches, routine maintenance
              Other: Anything that doesn't fit above categories`
            },
            {
              role: "user",
              content: `Classify this ticket: "${description}"`
            }
          ],
          response_format: { type: "json_object" }
        });

        const classification = JSON.parse(completion.choices[0].message.content);
        console.log(`🤖 OpenAI Classification: ${classification.issue_type} (${(classification.confidence * 100).toFixed(1)}% confidence)`);
        
        return {
          ...classification,
          method: 'openai'
        };
      } catch (openaiError) {
        console.error('OpenAI classification failed, using local:', openaiError);
        // Fallback to local classification
        return { 
          issue_type: topLocalCategory, 
          confidence: localConfidence,
          method: 'local_fallback'
        };
      }
    } else {
      console.log('🔑 OpenAI API key not configured, using local classifier');
      return { 
        issue_type: topLocalCategory, 
        confidence: localConfidence,
        method: 'local_only'
      };
    }
  } catch (error) {
    console.error('AI classification error:', error);
    // Fallback to rule-based classification
    return fallbackClassification(description);
  }
}

function fallbackClassification(description) {
  const desc = description.toLowerCase();
  const rules = [
    { type: 'Hardware', keywords: ['computer', 'laptop', 'printer', 'monitor', 'keyboard', 'mouse', 'hardware', 'device', 'cpu', 'ram', 'storage', 'drive'] },
    { type: 'Software', keywords: ['software', 'application', 'program', 'microsoft', 'word', 'excel', 'crash', 'error', 'install', 'update'] },
    { type: 'Network', keywords: ['internet', 'wifi', 'network', 'connection', 'vpn', 'online', 'connectivity', 'ethernet'] },
    { type: 'Security', keywords: ['virus', 'malware', 'security', 'hack', 'breach', 'password', 'security', 'antivirus'] },
    { type: 'Account', keywords: ['login', 'account', 'password', 'user', 'access', 'permission', 'credentials'] },
    { type: 'Database', keywords: ['database', 'data', 'sql', 'query', 'storage', 'backup'] },
    { type: 'Configuration', keywords: ['configure', 'setting', 'setup', 'configuration', 'options'] },
    { type: 'Maintenance', keywords: ['update', 'maintenance', 'patch', 'upgrade', 'cleanup'] }
  ];

  let bestMatch = { type: 'Other', confidence: 0.5 };
  let matchCount = 0;

  for (const rule of rules) {
    const matches = rule.keywords.filter(keyword => desc.includes(keyword)).length;
    if (matches > matchCount) {
      matchCount = matches;
      bestMatch = { 
        type: rule.type, 
        confidence: Math.min(0.3 + (matches * 0.1), 0.9) 
      };
    }
  }

  console.log(`🔧 Fallback Classification: ${bestMatch.type} (${(bestMatch.confidence * 100).toFixed(1)}% confidence)`);
  return { ...bestMatch, method: 'fallback' };
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






    // === REPLACE THIS PART IN YOUR SUBMIT TICKET ROUTE ===

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
    const ticketId = await getNextSequence('ticketId');
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

// Auto-process queue every 20 seconds
setInterval(async () => {
  try {
    if (isDatabaseConnected) {
      const assignedCount = await processAllQueuedTickets();
      if (assignedCount > 0) {
        console.log(`🔄 Background assignment: ${assignedCount} tickets assigned`);
      }
    }
  } catch (error) {
    console.error('Background queue processing error:', error);
  }
}, 20 * 1000);











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
app.post('/api/register', upload.single('avatar'), requireDatabase, async (req, res) => {
  try {
    const { name, email, password, confirm_password, phone_number, team_id, role = 'user' } = req.body;
    console.log(`Register request: ${JSON.stringify(req.body)} at ${new Date().toISOString()}`);
    
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
      team_id: team_id ? parseInt(team_id) : null,
      avatar_path,
      assigned_tickets_count: 0,
      is_active: true,
      created_at: new Date()
    };
    
    await db.collection('users').insertOne(userDoc);
    
    const newUser = await db.collection('users').findOne(
      { user_id: userId },
      { projection: { password: 0 } }
    );
    
    console.log(`User registered successfully: ${JSON.stringify(newUser)} at ${new Date().toISOString()}`);
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: newUser,
    });
  } catch (error) {
    console.error(`Registration error at ${new Date().toISOString()}:`, error);
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
app.post('/api/admin/register-user', authenticateToken, requireAdmin, requireDatabase, upload.single('avatar'), async (req, res) => {
  try {
    const { name, email, password, confirm_password, phone_number, team_id, role = 'user' } = req.body;
    console.log(`Admin user register request: ${JSON.stringify(req.body)} at ${new Date().toISOString()}`);
    
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
      team_id: team_id ? parseInt(team_id) : null,
      avatar_path,
      assigned_tickets_count: 0,
      is_active: true,
      created_at: new Date()
    };
    
    await db.collection('users').insertOne(userDoc);
    
    const newUser = await db.collection('users').findOne(
      { user_id: userId },
      { projection: { password: 0 } }
    );
    
    console.log(`User registered successfully by admin: ${JSON.stringify(newUser)} at ${new Date().toISOString()}`);
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: newUser,
    });
  } catch (error) {
    console.error(`Admin user registration error at ${new Date().toISOString()}:`, error);
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
app.put('/api/profile/:userId', authenticateToken, requireDatabase, upload.single('avatar'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone_number, team_id } = req.body;
    
    console.log(`🔄 Profile update for userId: ${userId} by user ${req.user.id}`, {
      name, email, phone_number, team_id, hasAvatar: !!req.file
    });
    
    // Check permissions
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      console.log(`❌ Access denied: User ${req.user.id} cannot update profile of user ${userId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }
    
    // Check if user exists
    const existingUser = await db.collection('users').findOne({ user_id: parseInt(userId) });
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Check if email is already taken by another user
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
      updated_at: new Date()
    };
    
    // Handle avatar upload
    if (req.file) {
      updateFields.avatar_path = 'assets/avatars/' + req.file.filename;
      
      // Delete old avatar if exists and not default
      if (existingUser.avatar_path && existingUser.avatar_path !== 'assets/default_avatar.png') {
        const oldAvatarPath = path.join(__dirname, existingUser.avatar_path);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
          console.log(`🗑️ Old avatar deleted: ${existingUser.avatar_path}`);
        }
      }
    }
    
    // Only allow admin/senior to change team_id
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
    console.error(`❌ Profile update error for userId: ${req.params.userId}:`, error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// Change password endpoint (FIXED ROUTE - BOTH VERSIONS FOR COMPATIBILITY)
app.put('/api/change-password', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { user_id, current_password, new_password, confirm_password } = req.body;
    
    console.log(`🔐 Change password request for userId: ${user_id} by user ${req.user.id}`);
    
    // Check permissions
    if (req.user.id !== parseInt(user_id)) {
      console.log(`❌ Access denied: User ${req.user.id} cannot change password for user ${user_id}`);
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
    
    console.log(`✅ Password changed successfully for userId: ${user_id}`);
    res.json({ success: true, message: 'Password changed successfully' });
    
  } catch (error) {
    console.error(`❌ Change password error for userId: ${req.body.user_id}:`, error);
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

// ========== FIXED DELETE TICKET ROUTE (No Transactions) ==========

// Delete ticket - FIXED VERSION without transactions
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
      
      // Delete the ticket
      const result = await db.collection('tickets').deleteOne({ ticket_id: parseInt(ticketId) });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      
      console.log(`✅ Ticket ${ticketId} deleted successfully`);
      
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

// Delete user account endpoint - FIXED VERSION
app.delete('/api/profile/:userId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { userId } = req.params;
    const { confirmation } = req.body;
    
    console.log(`🗑️ Delete account request for userId: ${userId} by user ${req.user.id}`);
    
    // Check permissions - users can only delete their own account, admins can delete any
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      console.log(`❌ Access denied: User ${req.user.id} cannot delete account of user ${userId}`);
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
    
    // Prevent admin from deleting themselves
    if (parseInt(userId) === req.user.id && req.user.role === 'admin') {
      return res.status(400).json({ 
        success: false, 
        message: 'Admin cannot delete their own account. Contact another admin.' 
      });
    }
    
    try {
      // Delete user's comments
      const commentsResult = await db.collection('comments').deleteMany({ author_id: parseInt(userId) });
      console.log(`✅ Comments deleted for user ${userId}: ${commentsResult.deletedCount} comments`);
      
      // Delete user's ticket logs
      const logsResult = await db.collection('ticket_logs').deleteMany({ changed_by: parseInt(userId) });
      console.log(`✅ Logs deleted for user ${userId}: ${logsResult.deletedCount} logs`);
      
      // Unassign tickets assigned to this user
      const unassignResult = await db.collection('tickets').updateMany(
        { assigned_to: parseInt(userId) }, 
        { $set: { assigned_to: null } }
      );
      console.log(`✅ Tickets unassigned from user ${userId}: ${unassignResult.modifiedCount} tickets`);
      
      // Delete tickets created by this user
      const ticketsResult = await db.collection('tickets').deleteMany({ user_id: parseInt(userId) });
      console.log(`✅ Tickets deleted for user ${userId}: ${ticketsResult.deletedCount} tickets`);
      
      // Delete the user
      const result = await db.collection('users').deleteOne({ user_id: parseInt(userId) });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      // Delete user's avatar if exists and not default
      if (user.avatar_path && user.avatar_path !== 'assets/default_avatar.png') {
        const avatarPath = path.join(__dirname, user.avatar_path);
        if (fs.existsSync(avatarPath)) {
          fs.unlinkSync(avatarPath);
          console.log(`🗑️ User avatar deleted: ${user.avatar_path}`);
        }
      }
      
      console.log(`✅ Account deleted successfully for userId: ${userId}`);
      
      // If user is deleting their own account, log them out
      if (parseInt(userId) === req.user.id) {
        console.log(`🚪 User ${userId} deleted their own account, logging out`);
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
      
      // Also delete associated comments and logs
      await db.collection('comments').deleteMany({ author_id: parseInt(userId) });
      await db.collection('ticket_logs').deleteMany({ changed_by: parseInt(userId) });
      
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

// Delete user by ID (for admin) - FIXED VERSION without transactions
app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, requireDatabase, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`🗑️ [DELETE] Delete user ${userId} by admin ${req.user.id}`);

    // Check if user exists
    const user = await db.collection('users').findOne({ user_id: parseInt(userId) });
    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent admin from deleting themselves
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    try {
      // Delete user's comments
      await db.collection('comments').deleteMany({ author_id: parseInt(userId) });
      console.log(`✅ Comments deleted for user ${userId}`);
      
      // Delete user's ticket logs
      await db.collection('ticket_logs').deleteMany({ changed_by: parseInt(userId) });
      console.log(`✅ Logs deleted for user ${userId}`);
      
      // Unassign tickets assigned to this user
      await db.collection('tickets').updateMany(
        { assigned_to: parseInt(userId) }, 
        { $set: { assigned_to: null } }
      );
      console.log(`✅ Tickets unassigned from user ${userId}`);
      
      // Delete tickets created by this user
      await db.collection('tickets').deleteMany({ user_id: parseInt(userId) });
      console.log(`✅ Tickets deleted for user ${userId}`);
      
      // Delete the user
      const result = await db.collection('users').deleteOne({ user_id: parseInt(userId) });
      
      if (result.deletedCount === 0) {
        throw new Error('User not found');
      }
      
      // Delete avatar file if exists
      if (user.avatar_path && user.avatar_path !== 'assets/default_avatar.png') {
        const avatarFullPath = path.join(__dirname, user.avatar_path);
        if (fs.existsSync(avatarFullPath)) {
          fs.unlinkSync(avatarFullPath);
          console.log(`✅ Avatar file deleted: ${user.avatar_path}`);
        }
      }
      
      console.log(`✅ User ${userId} deleted successfully`);
      
      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      console.error('❌ Error during user deletion:', error);
      throw error;
    }
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during user deletion: ' + error.message 
    });
  }
});

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

// Submit ticket endpoint
app.post('/api/submit-ticket', authenticateToken, requireDatabase, ticketUpload.single('attachment'), async (req, res) => {
  try {
    const { description, priority } = req.body;
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

    // Check if any officer in this team is available
    const availableOfficer = await checkOfficerAvailability(teamId);
    
    let assignedTo = null;
    let status = 'Queued';
    let queuePosition = null;
    let estimatedWaitTime = null;
    let assignmentMessage = '';

    if (availableOfficer) {
      // Direct assignment to available officer
      assignedTo = availableOfficer.user_id;
      status = 'In Progress';
      assignmentMessage = `Ticket submitted and assigned to ${availableOfficer.name}! 🎯`;
      console.log(`✅ Direct assignment to ${availableOfficer.name} (${availableOfficer.active_tickets}/3 tickets)`);
    } else {
      // Place in queue
      status = 'Queued';
      
      // Calculate queue position and wait time
      const queueCount = await db.collection('tickets').countDocuments({ 
        status: 'Queued', 
        issue_type: issueType 
      });
      
      queuePosition = queueCount + 1;
      estimatedWaitTime = calculateWaitTime(issueType, queuePosition);
      assignmentMessage = `Ticket submitted and placed in queue. Position: ${queuePosition}. Estimated wait: ${estimatedWaitTime} business days. ⏳`;
      console.log(`⏳ Ticket queued for ${issueType} team at position ${queuePosition} - NO officers available`);
    }

    // Insert ticket
    const ticketId = await getNextSequence('ticketId');
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
      ai_confidence: confidence,
      queue_position: queuePosition,
      estimated_wait_days: estimatedWaitTime,
      in_queue: status === 'Queued',
      assigned_at: assignedTo ? new Date() : null,
      created_at: new Date(),
      updated_at: new Date()
    };

    await db.collection('tickets').insertOne(ticketDoc);

    // Log ticket creation
    await db.collection('ticket_logs').insertOne({
      log_id: await getNextSequence('logId'),
      ticket_id: ticketId,
      changed_by: userId,
      change_description: `Ticket created: ${issueType} - Status: ${status}`,
      created_at: new Date()
    });

    console.log(`✅ Ticket ${ticketId} created with status: ${status}`);

    // If ticket was queued, try immediate assignment
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

// Update ticket
app.put('/api/tickets/:ticketId', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { issue_type, description, priority, status, new_team_id, comment_text } = req.body;

    console.log(`🔄 [PUT] Update ticket ${ticketId} by user ${req.user.id}:`, {
      issue_type,
      description,
      priority,
      status,
      new_team_id,
      comment_text: comment_text ? 'Comment provided' : 'No comment',
    });

    // Check if ticket exists and user has permission
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      console.log(`❌ Ticket ${ticketId} not found`);
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Permission check
    if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
      console.log(`❌ User ${req.user.id} cannot update ticket ${ticketId}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (req.user.role === 'senior' && ticket.team_id !== req.user.team_id) {
      console.log(`❌ Senior officer from team ${req.user.team_id} cannot update ticket from team ${ticket.team_id}`);
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Validate ticket is editable
    if (ticket.status !== 'Open' && ticket.status !== 'In Progress') {
      console.log(`❌ Ticket ${ticketId} is ${ticket.status}, cannot be edited`);
      return res.status(400).json({ success: false, message: 'Ticket cannot be edited as it is not Open or In Progress' });
    }

    const updateFields = {};
    let changeDescription = '';
    let hasChanges = false;

    // Handle issue_type update
    if (issue_type && issue_type !== ticket.issue_type) {
      const validIssueTypes = ['Hardware', 'Software', 'Network', 'Account', 'Database', 'Configuration', 'Maintenance', 'Other'];
      if (!validIssueTypes.includes(issue_type)) {
        return res.status(400).json({ success: false, message: 'Invalid issue type' });
      }
      updateFields.issue_type = issue_type;
      changeDescription += `Issue type changed from "${ticket.issue_type}" to "${issue_type}"`;
      hasChanges = true;
      console.log(`📝 Issue type change: ${ticket.issue_type} → ${issue_type}`);
    }

    // Handle description update
    if (description && description !== ticket.description) {
      if (!description.trim()) {
        return res.status(400).json({ success: false, message: 'Description cannot be empty' });
      }
      updateFields.description = description;
      if (changeDescription) {
        changeDescription += ` and description updated`;
      } else {
        changeDescription = `Description updated`;
      }
      hasChanges = true;
      console.log(`📝 Description updated`);
    }

    // Handle priority update
    if (priority && priority !== ticket.priority) {
      const validPriorities = ['Low', 'Medium', 'High'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ success: false, message: 'Invalid priority' });
      }
      updateFields.priority = priority;
      if (changeDescription) {
        changeDescription += ` and priority changed from "${ticket.priority}" to "${priority}"`;
      } else {
        changeDescription = `Priority changed from "${ticket.priority}" to "${priority}"`;
      }
      hasChanges = true;
      console.log(`📊 Priority change: ${ticket.priority} → ${priority}`);
    }

    // Handle status update (for admins/seniors)
    if (status && status !== ticket.status && (req.user.role === 'admin' || req.user.role === 'senior')) {
      updateFields.status = status;
      if (changeDescription) {
        changeDescription += ` and status changed from "${ticket.status}" to "${status}"`;
      } else {
        changeDescription = `Status changed from "${ticket.status}" to "${status}"`;
      }
      hasChanges = true;
      console.log(`📊 Status change: ${ticket.status} → ${status}`);
    }

    // Handle team reassignment (for admins/seniors)
    if (new_team_id !== undefined && (req.user.role === 'admin' || req.user.role === 'senior')) {
      const currentTeamId = ticket.team_id || '';
      if (new_team_id !== currentTeamId) {
        if (new_team_id === '') {
          updateFields.team_id = null;
          if (changeDescription) {
            changeDescription += ' and team unassigned';
          } else {
            changeDescription = 'Team unassigned';
          }
        } else {
          const team = await db.collection('teams').findOne({ team_id: parseInt(new_team_id) });
          if (!team) {
            return res.status(400).json({ success: false, message: 'Invalid team selected' });
          }
          updateFields.team_id = parseInt(new_team_id);
          const newTeamName = team.team_name;
          if (changeDescription) {
            changeDescription += ` and reassigned to ${newTeamName}`;
          } else {
            changeDescription = `Reassigned to ${newTeamName}`;
          }
        }
        hasChanges = true;
        console.log(`🏢 Team change: ${currentTeamId} → ${new_team_id}`);
      }
    }

    // Update ticket if there are changes
    if (hasChanges) {
      updateFields.updated_at = new Date();
      
      const result = await db.collection('tickets').updateOne(
        { ticket_id: parseInt(ticketId) },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }

      await db.collection('ticket_logs').insertOne({
        log_id: await getNextSequence('logId'),
        ticket_id: parseInt(ticketId),
        changed_by: req.user.id,
        change_description: changeDescription,
        created_at: new Date()
      });
      console.log(`📝 Log created: ${changeDescription}`);
    }

    // Add comment if provided
    if (comment_text && comment_text.trim()) {
      await db.collection('comments').insertOne({
        comment_id: await getNextSequence('commentId'),
        ticket_id: parseInt(ticketId),
        author_id: req.user.id,
        comment_text: comment_text.trim(),
        created_at: new Date()
      });
      console.log(`💬 Comment added: ${comment_text.trim()}`);
      hasChanges = true;
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

// Update ticket status
app.put('/api/tickets/:ticketId/status', authenticateToken, requireSeniorOrAdmin, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }
    
    console.log(`🔄 [PUT] Status update for ticket ${ticketId} by user ${req.user.id}: ${status}`);
    
    const ticket = await db.collection('tickets').findOne({ ticket_id: parseInt(ticketId) });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    if (req.user.role === 'senior' && ticket.team_id !== req.user.team_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (status === ticket.status) {
      return res.status(400).json({ success: false, message: 'Ticket already has this status' });
    }
    
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
app.get('/api/senior-dashboard', authenticateToken, requireSeniorOrAdmin, requireDatabase, async (req, res) => {
  try {
    console.log(`📊 Senior dashboard request from user: ${req.user.id}, role: ${req.user.role}, team: ${req.user.team_id}`);

    let matchStage = { 
      status: { $nin: ['Closed', 'Queued'] } 
    };
    
    if (req.user.role === 'senior') {
      matchStage.team_id = req.user.team_id;
      matchStage.assigned_to = req.user.id;
      console.log(`🔍 Filtering tickets for team ID: ${req.user.team_id} assigned to user: ${req.user.id}`);
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

    console.log(`📋 Found ${tickets.length} active tickets for senior officer`);

    let teamName = 'All Teams';
    if (req.user.role === 'senior' && req.user.team_id) {
      const team = await db.collection('teams').findOne({ team_id: req.user.team_id });
      if (team) {
        teamName = team.team_name;
      }
    }
    
    console.log(`✅ Sending ${tickets.length} tickets to dashboard`);
    
    res.json({
      success: true,
      tickets,
      teamName,
      userRole: req.user.role
    });
  } catch (error) {
    console.error('❌ Senior dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// Get ticket comments
app.get('/api/tickets/:ticketId/comments', authenticateToken, requireDatabase, async (req, res) => {
  try {
    const { ticketId } = req.params;
    console.log(`💬 [GET] Fetching comments for ticket ${ticketId} by user ${req.user.id}`);
    
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
    
    console.log(`✅ Permission granted, fetching comments for ticket ${ticketId}`);
    
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
          comment_id: 1,
          comment_text: 1,
          created_at: 1,
          author_name: '$author_info.name',
          author_id: '$author_info.user_id'
        }
      },
      { $sort: { created_at: 1 } }
    ]).toArray();
    
    console.log(`✅ Found ${comments.length} comments for ticket ${ticketId}`);
    
    res.json({
      success: true,
      comments,
    });
  } catch (error) {
    console.error('❌ Fetch ticket comments error:', error);
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
app.post('/api/admin/register-senior', authenticateToken, requireAdmin, requireDatabase, upload.single('avatar'), async (req, res) => {
  try {
    const { name, email, password, confirm_password, phone_number, team_id, role = 'senior' } = req.body;
    console.log(`Senior officer register request: ${JSON.stringify(req.body)} at ${new Date().toISOString()}`);
    
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
    
    const newUser = await db.collection('users').findOne(
      { user_id: userId },
      { projection: { password: 0 } }
    );
    
    console.log(`Senior officer registered successfully: ${JSON.stringify(newUser)} at ${new Date().toISOString()}`);
    res.status(201).json({
      success: true,
      message: 'Senior officer registered successfully',
      user: newUser,
    });
  } catch (error) {
    console.error(`Senior officer registration error at ${new Date().toISOString()}:`, error);
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
          closed: closedTickets
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

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large' });
    }
  }
  res.status(500).json({ success: false, message: error.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    method: req.method,
  });
});

// Auto-process queue every 20 seconds
setInterval(async () => {
  try {
    if (isDatabaseConnected) {
      const assignedCount = await processAllQueuedTickets();
      if (assignedCount > 0) {
        console.log(`🔄 Background assignment: ${assignedCount} tickets assigned`);
      }
    }
  } catch (error) {
    console.error('Background queue processing error:', error);
  }
}, 20 * 1000);








// ========== AUTO-PROCESS QUEUE EVERY 20 SECONDS ==========
setInterval(async () => {
  try {
    if (isDatabaseConnected) {
      const assignedCount = await processAllQueuedTickets();
      if (assignedCount > 0) {
        console.log(`🔄 Background assignment: ${assignedCount} tickets assigned`);
      }
    }
  } catch (error) {
    console.error('Background queue processing error:', error);
  }
}, 20 * 1000); // 20 seconds











// Initialize and start server
async function startServer() {
  try {
    console.log('🚀 Starting Ticket Management System Server...');
    
    // Connect to MongoDB (will continue even if connection fails)
    await connectToMongoDB();
    
    // Initialize database if connected
    if (isDatabaseConnected) {
      await initializeDatabase();
    } else {
      console.log('⚠️  Server starting without database connection');
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🎉 Server successfully started on port ${PORT}`);
      console.log(`📍 Local: http://localhost:${PORT}`);
      console.log(`📍 Network: http://0.0.0.0:${PORT}`);
      console.log(`📊 Test endpoint: http://localhost:${PORT}/api/test`);
      console.log(`❤️ Health check: http://localhost:${PORT}/api/health`);
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