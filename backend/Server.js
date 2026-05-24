const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    // Helper to check if origin is a local network IP (e.g. 192.168.X.X or 10.X.X.X)
    const isLocalNetwork = (url) => {
      if (!url) return false;
      try {
        const hostname = new URL(url).hostname;
        return (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
        );
      } catch (e) {
        return false;
      }
    };

    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'file://',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      `http://localhost:${PORT}`
    ].filter(Boolean);

    // Allow request if:
    // - No origin (e.g. mobile app, curl, backend-to-backend)
    // - Origin is in the allowed list
    // - Origin is a GitHub Pages deployment (*.github.io)
    // - Origin is a local network IP (for phone testing over Wi-Fi)
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.endsWith('.github.io') ||
      isLocalNetwork(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true
}));

// MongoDB Connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

connectDB();

// UPDATED Member Schema
const memberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^\+?[\d\s\-\(\)]{10,15}$/.test(v);
      },
      message: 'Please enter a valid phone number'
    }
  },
  admissionDate: {
    type: Date,
    required: [true, 'Admission date is required']
  },
  membershipType: {
    type: String,
    required: [true, 'Membership type is required'],
    enum: {
      values: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'],
      message: 'Invalid membership type'
    }
  },
  feeStatus: {
    type: String,
    enum: ['paid', 'unpaid'],
    default: 'paid'
  },
  nextPaymentDue: {
    type: Date
  },
  lastPaymentDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // NEW FIELDS FOR IMPROVED LOGIC
  actualExpiryDate: {
    type: Date // The actual membership expiry date
  },
  unpaidSince: {
    type: Date // When the status was changed to unpaid
  },
  smsReminderCount: {
    type: Number,
    default: 0
  },
  lastSmsReminderSentAt: {
    type: Date
  },
  autoUnpaidTriggered: {
    type: Boolean,
    default: false
  },
  // NEW: Track overdue status
  overdueStatus: {
    type: String,
    enum: ['current', 'overdue'],
    default: 'current'
  },
  overdueSince: {
    type: Date
  }
}, {
  timestamps: true
});

// UPDATED: Calculate next payment and expiry dates
memberSchema.methods.calculatePaymentDates = function(fromDate = null) {
  const baseDate = fromDate || new Date();
  const nextDue = new Date(baseDate);
  const actualExpiry = new Date(baseDate);
  
  switch (this.membershipType) {
    case 'Monthly':
      nextDue.setMonth(nextDue.getMonth() + 1);
      actualExpiry.setMonth(actualExpiry.getMonth() + 1);
      break;
    case 'Quarterly':
      nextDue.setMonth(nextDue.getMonth() + 3);
      actualExpiry.setMonth(actualExpiry.getMonth() + 3);
      break;
    case 'Half-Yearly':
      nextDue.setMonth(nextDue.getMonth() + 6);
      actualExpiry.setMonth(actualExpiry.getMonth() + 6);
      break;
    case 'Yearly':
      nextDue.setFullYear(nextDue.getFullYear() + 1);
      actualExpiry.setFullYear(actualExpiry.getFullYear() + 1);
      break;
    default:
      throw new Error(`Unknown membership type: ${this.membershipType}`);
  }
  
  return {
    nextPaymentDue: nextDue,
    actualExpiryDate: actualExpiry
  };
};

// NEW: Method to calculate overdue days
memberSchema.methods.getOverdueDays = function() {
  if (this.feeStatus === 'paid' || !this.actualExpiryDate) {
    return 0;
  }
  
  const today = new Date();
  const expiryDate = new Date(this.actualExpiryDate);
  
  if (today > expiryDate) {
    return Math.ceil((today - expiryDate) / (1000 * 60 * 60 * 24));
  }
  
  return 0;
};

// UPDATED: Pre-save middleware with overdue logic
memberSchema.pre('save', function(next) {
  try {
    const isNewMember = this.isNew;
    const isAdmissionDateChanged = this.isModified('admissionDate');
    const isMembershipTypeChanged = this.isModified('membershipType');
    const isFeeStatusChanged = this.isModified('feeStatus');
    
    console.log(`[${this.name}] Pre-save check:`, {
      isNewMember,
      isAdmissionDateChanged,
      isMembershipTypeChanged,
      isFeeStatusChanged,
      currentFeeStatus: this.feeStatus
    });
    
    // For new members, calculate from admission date
    if (isNewMember) {
      const dates = this.calculatePaymentDates(this.admissionDate);
      this.nextPaymentDue = dates.nextPaymentDue;
      this.actualExpiryDate = dates.actualExpiryDate;
      this.lastPaymentDate = this.admissionDate;
      this.feeStatus = 'paid';
      this.autoUnpaidTriggered = false;
      this.smsReminderCount = 0;
      this.overdueStatus = 'current';
      this.overdueSince = null;
      
      console.log(`[${this.name}] New member - Expiry: ${this.actualExpiryDate.toDateString()}, Next Due: ${this.nextPaymentDue.toDateString()}`);
    }
    
    // When fee status changes to paid (manual payment)
    if (isFeeStatusChanged && this.feeStatus === 'paid') {
      const paymentDate = new Date();
      const dates = this.calculatePaymentDates(paymentDate);
      
      this.lastPaymentDate = paymentDate;
      this.nextPaymentDue = dates.nextPaymentDue;
      this.actualExpiryDate = dates.actualExpiryDate;
      this.unpaidSince = null;
      this.autoUnpaidTriggered = false;
      this.smsReminderCount = 0; // Reset SMS count for new period
      this.lastSmsReminderSentAt = null;
      this.overdueStatus = 'current';
      this.overdueSince = null;
      
      console.log(`[${this.name}] Payment received - New expiry: ${this.actualExpiryDate.toDateString()}`);
    }
    
    // When fee status changes to unpaid
    if (isFeeStatusChanged && this.feeStatus === 'unpaid') {
      if (!this.unpaidSince) {
        this.unpaidSince = new Date();
      }
      // Note: overdueStatus will be updated by the cron job based on expiry date
    }
    
    // Recalculate if admission date or membership type changes
    if ((isAdmissionDateChanged || isMembershipTypeChanged) && !isNewMember) {
      if (this.feeStatus === 'paid') {
        const dates = this.calculatePaymentDates(this.lastPaymentDate || this.admissionDate);
        this.nextPaymentDue = dates.nextPaymentDue;
        this.actualExpiryDate = dates.actualExpiryDate;
      }
    }
    
    next();
  } catch (error) {
    console.error('Error in pre-save middleware:', error);
    next(error);
  }
});

const Member = mongoose.model('Member', memberSchema);

// SMS Utility Function
const sendSMS = async (phoneNumber, message) => {
  const authKey = process.env.MSG91_AUTH_KEY;
  const senderId = process.env.MSG91_SENDER_ID;

  if (!authKey || !senderId) {
    console.warn('⚠️ MSG91 API keys not configured. SMS will not be sent.');
    return false;
  }

  try {
    const response = await axios.post('https://api.msg91.com/api/v5/flow/', {
      flow_id: process.env.MSG91_FLOW_ID,
      sender: senderId,
      recipients: [{
        mobiles: `91${phoneNumber.replace(/\s|-|\(|\)|\+/g, '')}`,
        VAR1: message
      }]
    }, {
      headers: {
        'authkey': authKey,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.type === 'success') {
      console.log(`✔️ SMS sent successfully to ${phoneNumber}`);
      return true;
    } else {
      console.error(`❌ Failed to send SMS to ${phoneNumber}:`, response.data);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error sending SMS to ${phoneNumber}:`, error.message);
    return false;
  }
};

// NEW: Update overdue status for all members

    // CORRECTED: Update overdue status - starts day after expiry
const updateOverdueStatus = async () => {
  console.log('🔄 Updating overdue status...');
  
  try {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    // Find unpaid members whose expiry was yesterday or earlier (overdue)
    const newlyOverdueMembers = await Member.find({
      isActive: true,
      feeStatus: 'unpaid',
      overdueStatus: 'current',
      actualExpiryDate: { $lt: yesterday }
    });

    let overdueCount = 0;
    for (const member of newlyOverdueMembers) {
      await Member.findByIdAndUpdate(member._id, {
        overdueStatus: 'overdue',
        overdueSince: member.overdueSince || new Date()
      });
      
      const daysOverdue = Math.ceil((today - member.actualExpiryDate) / (1000 * 60 * 60 * 24));
      console.log(`🔴 Member now overdue: ${member.name} - ${daysOverdue} day(s) overdue`);
      overdueCount++;
    }

    // Update members who are paid but were previously overdue
    await Member.updateMany(
      {
        isActive: true,
        feeStatus: 'paid',
        overdueStatus: 'overdue'
      },
      {
        overdueStatus: 'current',
        overdueSince: null
      }
    );

    return { newOverdueCount: overdueCount };
  } catch (error) {
    console.error('❌ Error updating overdue status:', error);
    return { newOverdueCount: 0 };
  }
};

// UPDATED: Auto-unpaid function - triggers 2 days before actual expiry
const updateAutoUnpaid = async () => {
  console.log('🔄 Checking for members to auto-unpaid (on expiry date)...');
  
  try {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0); // Start of today

    // Find paid members whose expiry date is today or already passed
    const membersToUnpaid = await Member.find({
      isActive: true,
      feeStatus: 'paid',
      actualExpiryDate: { $lt: today } // Expired by end of today
    });

    console.log(`Found ${membersToUnpaid.length} members to auto-unpaid (expired)`);

    for (const member of membersToUnpaid) {
      await Member.findByIdAndUpdate(member._id, {
        feeStatus: 'unpaid',
        unpaidSince: new Date(),
        autoUnpaidTriggered: true,
        smsReminderCount: 0 // Reset SMS count for unpaid period
      });
      
      const daysOverdue = Math.ceil((today - member.actualExpiryDate) / (1000 * 60 * 60 * 24));
      console.log(`🔴 Auto-unpaid: ${member.name} - expired ${daysOverdue} day(s) ago (expiry: ${member.actualExpiryDate.toDateString()})`);
    }

    return { modifiedCount: membersToUnpaid.length };
  } catch (error) {
    console.error('❌ Error in auto-unpaid update:', error);
    return { modifiedCount: 0 };
  }
};

// UPDATED: SMS reminder function - sends for 3 days only, stops automatically
const sendSMSReminders = async () => {
  console.log('📱 Checking for SMS reminders (2 days before to 1 day after expiry)...');
  
  try {
    const today = new Date();
    const twoDaysBefore = new Date();
    twoDaysBefore.setDate(today.getDate() - 2);
    
    const oneDayAfter = new Date();
    oneDayAfter.setDate(today.getDate() + 1);
    
    // Set proper time boundaries
    today.setHours(23, 59, 59, 999);
    twoDaysBefore.setHours(0, 0, 0, 0);
    oneDayAfter.setHours(23, 59, 59, 999);

    // Find members whose expiry date is within the SMS window (2 days before to 1 day after)
    // AND haven't received SMS today yet
    const membersForSMS = await Member.find({
      isActive: true,
      actualExpiryDate: { 
        $gte: twoDaysBefore, // Expires 2+ days from now
        $lte: oneDayAfter    // Expired max 1 day ago
      },
      smsReminderCount: { $lt: 4 }, // Max 4 SMS (2 before + expiry day + 1 after)
      $or: [
        { lastSmsReminderSentAt: { $exists: false } },
        { lastSmsReminderSentAt: null },
        { 
          lastSmsReminderSentAt: { 
            $lt: new Date(Date.now() - 23 * 60 * 60 * 1000) // 23 hours ago (once daily)
          } 
        }
      ]
    });

    console.log(`Found ${membersForSMS.length} members eligible for SMS reminders`);

    let smsSentCount = 0;

    for (const member of membersForSMS) {
      const expiryDate = new Date(member.actualExpiryDate);
      const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      let message = '';
      let shouldSendSMS = false;

      if (daysUntilExpiry > 1) {
        // Before expiry (2 days before, 1 day before)
        message = `Hi ${member.name}, your gym membership expires on ${expiryDate.toDateString()} (in ${daysUntilExpiry} day${daysUntilExpiry > 1 ? 's' : ''}). Please renew to continue your service.`;
        shouldSendSMS = true;
      } else if (daysUntilExpiry === 1 || daysUntilExpiry === 0) {
        // Expiry day or day before
        const timeText = daysUntilExpiry === 1 ? 'tomorrow' : 'today';
        message = `Hi ${member.name}, your gym membership expires ${timeText} (${expiryDate.toDateString()}). Please renew immediately to avoid service interruption.`;
        shouldSendSMS = true;
      } else if (daysUntilExpiry === -1) {
        // 1 day after expiry (final reminder)
        message = `Hi ${member.name}, your gym membership expired yesterday (${expiryDate.toDateString()}). Please renew immediately to reactivate your service.`;
        shouldSendSMS = true;
      }

      if (shouldSendSMS) {
        const smsSent = await sendSMS(member.phone, message);
        
        if (smsSent) {
          await Member.findByIdAndUpdate(member._id, {
            $inc: { smsReminderCount: 1 },
            lastSmsReminderSentAt: new Date()
          });
          
          console.log(`✔️ SMS sent to ${member.name} (${daysUntilExpiry > 0 ? `${daysUntilExpiry} days until` : `${Math.abs(daysUntilExpiry)} days after`} expiry, Count: ${member.smsReminderCount + 1})`);
          smsSentCount++;
        }
      }
    }

    return { smsSent: smsSentCount };
  } catch (error) {
    console.error('❌ Error sending SMS reminders:', error);
    return { smsSent: 0 };
  }
};


// UPDATED: Daily maintenance task
const runDailyMaintenance = async () => {
  console.log('🔄 Running daily maintenance tasks...');
  
  try {
    // First: Update members to unpaid if they expired
    const unpaidResult = await updateAutoUnpaid();
    
    // Second: Update overdue status (day after expiry)
    const overdueResult = await updateOverdueStatus();
    
    // Third: Send SMS reminders (2 days before to 1 day after expiry)
    const smsResult = await sendSMSReminders();
    
    console.log('✅ Daily maintenance completed:', {
      newUnpaidMembers: unpaidResult.modifiedCount,
      newOverdueMembers: overdueResult.newOverdueCount,
      smsRemindersSent: smsResult.smsSent
    });
    
    return {
      unpaid: unpaidResult,
      overdue: overdueResult,
      sms: smsResult
    };
  } catch (error) {
    console.error('❌ Error in daily maintenance:', error);
    return null;
  }
};

// UPDATED: Schedule tasks - runs every 6 hours AND daily at midnight
cron.schedule('0 */6 * * *', async () => {
  console.log('🕐 Running scheduled tasks every 6 hours...');
  await runDailyMaintenance();
});

// Additional daily task at midnight for comprehensive check
cron.schedule('0 0 * * *', async () => {
  console.log('🌙 Running comprehensive daily maintenance at midnight...');
  await runDailyMaintenance();
});

// Routes

// Root route
app.get('/', (req, res) => {
  res.json({
    message: '💪 Gym Management System API is running!',
    version: '1.0.0',
    endpoints: {
      members: '/api/members',
      stats: '/api/stats',
      health: '/api/health'
    }
  });
});

// Get all members with overdue information
app.get('/api/members', async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search, overdueOnly } = req.query;
    const query = { isActive: true };

    if (status && ['paid', 'unpaid'].includes(status)) {
      query.feeStatus = status;
    }

    if (overdueOnly === 'true') {
      query.overdueStatus = 'overdue';
      query.feeStatus = 'unpaid';
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const members = await Member.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit), 100))
      .skip((page - 1) * limit);

    // Add overdue days to each member
    const membersWithOverdue = members.map(member => {
      const memberObj = member.toObject();
      memberObj.overdueDays = member.getOverdueDays();
      return memberObj;
    });

    const total = await Member.countDocuments(query);

    res.json({
      members: membersWithOverdue,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get member by ID
app.get('/api/members/:id', async (req, res) => {
  try {
    const member = await Member.findOne({ _id: req.params.id, isActive: true });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const memberObj = member.toObject();
    memberObj.overdueDays = member.getOverdueDays();
    
    res.json(memberObj);
  } catch (error) {
    console.error('Error fetching member:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATED: Create new member
app.post('/api/members', async (req, res) => {
  try {
    const admissionDate = new Date(req.body.admissionDate);
    
    if (isNaN(admissionDate.getTime())) {
      return res.status(400).json({ error: 'Invalid admission date' });
    }
    
    console.log('Creating new member with admission date:', admissionDate);
    
    const memberData = {
      ...req.body,
      admissionDate: admissionDate,
      isActive: true
    };

    const member = new Member(memberData);
    await member.save();

    // Send welcome SMS
    const message = `Welcome to the gym, ${member.name}! Your membership is active until ${member.actualExpiryDate.toDateString()}. Thank you for joining us!`;
    await sendSMS(member.phone, message);

    console.log(`✅ New member created: ${member.name}`);
    console.log(`📅 Admission date: ${member.admissionDate.toDateString()}`);
    console.log(`📅 Actual expiry: ${member.actualExpiryDate.toDateString()}`);
    console.log(`📅 Next payment due: ${member.nextPaymentDue.toDateString()}`);
    
    const memberObj = member.toObject();
    memberObj.overdueDays = member.getOverdueDays();
    
    res.status(201).json(memberObj);
  } catch (error) {
    console.error('Error creating member:', error);
    res.status(400).json({ error: error.message });
  }
});

// UPDATED: Update member
app.put('/api/members/:id', async (req, res) => {
  try {
    const member = await Member.findOne({ _id: req.params.id, isActive: true });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const updateData = {
      ...req.body,
      admissionDate: new Date(req.body.admissionDate)
    };

    if (isNaN(updateData.admissionDate.getTime())) {
      return res.status(400).json({ error: 'Invalid admission date' });
    }

    Object.assign(member, updateData);
    await member.save();

    console.log(`📝 Member updated: ${member.name}`);
    
    const memberObj = member.toObject();
    memberObj.overdueDays = member.getOverdueDays();
    
    res.json(memberObj);
  } catch (error) {
    console.error('Error updating member:', error);
    res.status(400).json({ error: error.message });
  }
});

// UPDATED: Update fee status
app.patch('/api/members/:id/fee-status', async (req, res) => {
  try {
    const { feeStatus } = req.body;

    if (!['paid', 'unpaid'].includes(feeStatus)) {
      return res.status(400).json({ error: 'Invalid fee status' });
    }

    const member = await Member.findOne({ _id: req.params.id, isActive: true });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const wasUnpaid = member.feeStatus === 'unpaid';
    member.feeStatus = feeStatus;
    
    await member.save();

    // Send payment confirmation SMS
    if (wasUnpaid && member.feeStatus === 'paid') {
      const message = `Hi ${member.name}, your payment has been received. Thank you! Your membership is now active until ${member.actualExpiryDate.toDateString()}.`;
      await sendSMS(member.phone, message);
    }

    console.log(`💰 Fee status updated for ${member.name}: ${feeStatus}`);
    console.log(`📅 New expiry date: ${member.actualExpiryDate?.toDateString()}`);
    
    const memberObj = member.toObject();
    memberObj.overdueDays = member.getOverdueDays();
    
    res.json(memberObj);
  } catch (error) {
    console.error('Error updating fee status:', error);
    res.status(400).json({ error: error.message });
  }
});

// NEW: Get overdue members
app.get('/api/members/overdue', async (req, res) => {
  try {
    const { page = 1, limit = 50, minDays = 0 } = req.query;
    
    const overdueMembers = await Member.find({
      isActive: true,
      feeStatus: 'unpaid',
      overdueStatus: 'overdue'
    })
    .sort({ overdueSince: 1 }) // Oldest overdue first
    .limit(Math.min(parseInt(limit), 100))
    .skip((page - 1) * limit);

    const membersWithDays = overdueMembers
      .map(member => {
        const memberObj = member.toObject();
        memberObj.overdueDays = member.getOverdueDays();
        return memberObj;
      })
      .filter(member => member.overdueDays >= parseInt(minDays));

    const total = await Member.countDocuments({
      isActive: true,
      feeStatus: 'unpaid',
      overdueStatus: 'overdue'
    });

    res.json({
      members: membersWithDays,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Error fetching overdue members:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual trigger for daily maintenance
app.post('/api/trigger-maintenance', async (req, res) => {
  try {
    const result = await runDailyMaintenance();
    res.json({
      message: 'Daily maintenance completed',
      result
    });
  } catch (error) {
    console.error('Error in manual maintenance trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

// Alias for backwards compatibility
app.post('/api/update-overdue', async (req, res) => {
  try {
    const result = await runDailyMaintenance();
    res.json({
      message: 'Overdue status check completed',
      result
    });
  } catch (error) {
    console.error('Error in update-overdue trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual trigger for auto-unpaid (for testing)
app.post('/api/trigger-auto-unpaid', async (req, res) => {
  try {
    const result = await updateAutoUnpaid();
    res.json({
      message: 'Auto-unpaid check completed',
      membersUpdated: result.modifiedCount
    });
  } catch (error) {
    console.error('Error in manual auto-unpaid trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual trigger for SMS reminders (for testing)
app.post('/api/trigger-sms-reminders', async (req, res) => {
  try {
    const result = await sendSMSReminders();
    res.json({
      message: 'SMS reminders check completed',
      result
    });
  } catch (error) {
    console.error('Error in manual SMS trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete member (soft delete)
app.delete('/api/members/:id', async (req, res) => {
  try {
    const member = await Member.findOneAndUpdate(
      { _id: req.params.id, isActive: true },
      { isActive: false },
      { new: true }
    );

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    console.log(`🗑️ Member deleted: ${member.name}`);
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATED: Get dashboard statistics with overdue information
app.get('/api/stats', async (req, res) => {
  try {
    const totalMembers = await Member.countDocuments({ isActive: true });
    const paidMembers = await Member.countDocuments({ isActive: true, feeStatus: 'paid' });
    const unpaidMembers = await Member.countDocuments({ isActive: true, feeStatus: 'unpaid' });

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);
    
    // Overdue members (unpaid and expired more than 1 day ago)
    const overdueMembers = await Member.countDocuments({
      isActive: true,
      feeStatus: 'unpaid',
      actualExpiryDate: { $lt: yesterday }
    });

    // Members expiring in next 2 days (will start getting SMS)
    const expiringIn2Days = await Member.countDocuments({
      isActive: true,
      feeStatus: 'paid',
      actualExpiryDate: { 
        $gte: today, 
        $lte: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000) 
      }
    });

    // Members in SMS reminder window (2 days before to 1 day after expiry)
    const inSMSWindow = await Member.countDocuments({
      isActive: true,
      actualExpiryDate: {
        $gte: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        $lte: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000)  // 1 day from now
      },
      smsReminderCount: { $lt: 4 }
    });

    res.json({
      totalMembers,
      paidMembers,
      unpaidMembers,
      overdueMembers,
      expiringIn2Days,
      inSMSWindow
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  mongoose.connection.close(() => {
    console.log('💾 MongoDB connection closed');
    process.exit(0);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);

  // Run initial checks after server starts
  setTimeout(async () => {
    console.log('🔍 Running initial system checks...');
    await runDailyMaintenance();
  }, 5000);
});