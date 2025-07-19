const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5000']
}));
app.use(express.json());

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

// Member Schema
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
  lastExpiryReminderSentAt: {
    type: Date
  },
  lastUnpaidReminderSentAt: {
    type: Date
  }
}, {
  timestamps: true
});

// FIXED: Improved calculateNextPaymentDue method
memberSchema.methods.calculateNextPaymentDue = function() {
  let baseDate;
  
  // Determine the base date for calculation
  if (this.feeStatus === 'paid' && this.lastPaymentDate) {
    // For paid members, use the last payment date
    baseDate = new Date(this.lastPaymentDate);
  } else if (this.nextPaymentDue && this.feeStatus === 'unpaid') {
    // For unpaid members, keep the existing due date (don't recalculate)
    return new Date(this.nextPaymentDue);
  } else {
    // For new members or when no payment history exists, use admission date
    baseDate = new Date(this.admissionDate);
  }
  
  console.log(`[${this.name}] Base date for calculation:`, baseDate);
  console.log(`[${this.name}] Fee status:`, this.feeStatus);
  console.log(`[${this.name}] Membership type:`, this.membershipType);
  
  // Create next due date based on membership type
  const nextDue = new Date(baseDate);
  
  switch (this.membershipType) {
    case 'Monthly':
      nextDue.setMonth(nextDue.getMonth() + 1);
      break;
    case 'Quarterly':
      nextDue.setMonth(nextDue.getMonth() + 3);
      break;
    case 'Half-Yearly':
      nextDue.setMonth(nextDue.getMonth() + 6);
      break;
    case 'Yearly':
      nextDue.setFullYear(nextDue.getFullYear() + 1);
      break;
    default:
      throw new Error(`Unknown membership type: ${this.membershipType}`);
  }
  
  console.log(`[${this.name}] Calculated next due date:`, nextDue);
  return nextDue;
};

// FIXED: Pre-save middleware with better logic
memberSchema.pre('save', function(next) {
  try {
    const isNewMember = this.isNew;
    const isAdmissionDateChanged = this.isModified('admissionDate');
    const isMembershipTypeChanged = this.isModified('membershipType');
    const isFeeStatusChanged = this.isModified('feeStatus');
    const isLastPaymentDateChanged = this.isModified('lastPaymentDate');
    
    console.log(`[${this.name}] Pre-save check:`, {
      isNewMember,
      isAdmissionDateChanged,
      isMembershipTypeChanged,
      isFeeStatusChanged,
      isLastPaymentDateChanged
    });
    
    // Calculate next payment due for new members or when relevant fields change
    if (isNewMember || isAdmissionDateChanged || isMembershipTypeChanged || 
        (isFeeStatusChanged && this.feeStatus === 'paid') || isLastPaymentDateChanged) {
      
      if (this.membershipType && this.admissionDate) {
        this.nextPaymentDue = this.calculateNextPaymentDue();
        
        // For new members, determine initial fee status based on calculated due date
        if (isNewMember) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const dueDate = new Date(this.nextPaymentDue);
          dueDate.setHours(0, 0, 0, 0);
          
          if (dueDate < today) {
            this.feeStatus = 'unpaid';
            console.log(`[${this.name}] Set as unpaid due to past due date`);
          } else {
            this.feeStatus = 'paid';
            console.log(`[${this.name}] Set as paid - due date is in future`);
          }
        }
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
    return;
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
      console.log(`✔️ SMS sent successfully to ${phoneNumber}: ${message}`);
    } else {
      console.error(`❌ Failed to send SMS to ${phoneNumber}:`, response.data);
    }
  } catch (error) {
    console.error(`❌ Error sending SMS to ${phoneNumber}:`, error.message);
  }
};

// FIXED: Improved expiry reminder function
const scheduleExpiryReminders = async () => {
  console.log('🔔 Running daily expiry reminder check...');
  const today = new Date();
  const twoDaysLater = new Date();
  twoDaysLater.setDate(today.getDate() + 2);

  // Set to start and end of day for accurate comparison
  today.setHours(0, 0, 0, 0);
  twoDaysLater.setHours(23, 59, 59, 999);

  try {
    const membersToRemind = await Member.find({
      isActive: true,
      feeStatus: 'paid',
      nextPaymentDue: { $gte: today, $lte: twoDaysLater },
      $or: [
        { lastExpiryReminderSentAt: { $exists: false } },
        { lastExpiryReminderSentAt: null },
        { lastExpiryReminderSentAt: { $lt: today } }
      ]
    });

    console.log(`Found ${membersToRemind.length} members to remind about expiry`);

    for (const member of membersToRemind) {
      const dueDate = new Date(member.nextPaymentDue);
      const message = `Hi ${member.name}, your gym membership is due on ${dueDate.toDateString()}. Please pay to continue service.`;
      await sendSMS(member.phone, message);
      
      // Update reminder timestamp
      await Member.findByIdAndUpdate(member._id, { 
        lastExpiryReminderSentAt: new Date() 
      });
      
      console.log(`✔️ Sent expiry reminder to ${member.name}`);
    }
  } catch (error) {
    console.error('❌ Error scheduling expiry reminders:', error);
  }
};

// FIXED: Improved unpaid reminder function
const scheduleUnpaidReminders = async () => {
  console.log('💸 Running daily unpaid reminder check...');
  const today = new Date();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  today.setHours(0, 0, 0, 0);

  try {
    const unpaidMembers = await Member.find({
      isActive: true,
      feeStatus: 'unpaid',
      nextPaymentDue: { $lt: today }, // Actually overdue
      $or: [
        { lastUnpaidReminderSentAt: { $exists: false } },
        { lastUnpaidReminderSentAt: null },
        { lastUnpaidReminderSentAt: { $lt: twentyFourHoursAgo } }
      ]
    });

    console.log(`Found ${unpaidMembers.length} unpaid members to remind`);

    for (const member of unpaidMembers) {
      const dueDate = new Date(member.nextPaymentDue);
      const message = `Hi ${member.name}, your gym membership fee is overdue since ${dueDate.toDateString()}. Please make your payment as soon as possible.`;
      await sendSMS(member.phone, message);
      
      // Update reminder timestamp
      await Member.findByIdAndUpdate(member._id, { 
        lastUnpaidReminderSentAt: new Date() 
      });
      
      console.log(`✔️ Sent unpaid reminder to ${member.name}`);
    }
  } catch (error) {
    console.error('❌ Error scheduling unpaid reminders:', error);
  }
};

// FIXED: Improved overdue function with better logic
const updateOverdueMembers = async () => {
  console.log('🔄 Checking for overdue members...');
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find members whose payment is due before today but are still marked as paid
    const overdueMembers = await Member.find({
      nextPaymentDue: { $lt: today },
      feeStatus: 'paid',
      isActive: true
    });

    console.log(`Found ${overdueMembers.length} members who are overdue`);

    let updated = 0;
    for (const member of overdueMembers) {
      console.log(`Marking ${member.name} as unpaid - due date was ${member.nextPaymentDue.toDateString()}`);
      
      await Member.findByIdAndUpdate(member._id, {
        feeStatus: 'unpaid'
      });
      
      updated++;
    }

    console.log(`✅ Updated ${updated} overdue members to unpaid status`);
    return { modifiedCount: updated };
    
  } catch (error) {
    console.error('❌ Error updating overdue members:', error);
    return { modifiedCount: 0 };
  }
};

// Schedule daily tasks
cron.schedule('0 0 * * *', async () => {
  console.log('🕐 Running daily tasks at midnight...');
  await updateOverdueMembers();
  await scheduleExpiryReminders();
  await scheduleUnpaidReminders();
});

// Routes

// Get all members
app.get('/api/members', async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const query = { isActive: true };

    if (status && ['paid', 'unpaid'].includes(status)) {
      query.feeStatus = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const members = await Member.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Member.countDocuments(query);

    res.json({
      members,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
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
    res.json(member);
  } catch (error) {
    console.error('Error fetching member:', error);
    res.status(500).json({ error: error.message });
  }
});

// FIXED: Create new member with proper date handling
app.post('/api/members', async (req, res) => {
  try {
    const admissionDate = new Date(req.body.admissionDate);
    
    console.log('Creating new member with admission date:', admissionDate);
    
    const memberData = {
      ...req.body,
      admissionDate: admissionDate,
      lastPaymentDate: admissionDate, // Use admission date as first payment date
      isActive: true
    };

    const member = new Member(memberData);
    await member.save(); // This will trigger the pre-save middleware

    // Send welcome SMS
    const message = member.feeStatus === 'paid' 
      ? `Welcome to the gym, ${member.name}! Your membership is active until ${member.nextPaymentDue.toDateString()}.`
      : `Welcome to the gym, ${member.name}! Your payment is overdue since ${member.nextPaymentDue.toDateString()}. Please pay to continue service.`;
    
    await sendSMS(member.phone, message);

    console.log(`✅ New member created: ${member.name}`);
    console.log(`📅 Admission date: ${member.admissionDate.toDateString()}`);
    console.log(`📅 Next payment due: ${member.nextPaymentDue.toDateString()}`);
    console.log(`💰 Fee status: ${member.feeStatus}`);
    
    res.status(201).json(member);
  } catch (error) {
    console.error('Error creating member:', error);
    res.status(400).json({ error: error.message });
  }
});

// FIXED: Update member with proper date handling
app.put('/api/members/:id', async (req, res) => {
  try {
    const member = await Member.findOne({ _id: req.params.id, isActive: true });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Update fields
    const updateData = {
      ...req.body,
      admissionDate: new Date(req.body.admissionDate)
    };

    // Apply updates
    Object.assign(member, updateData);
    
    // Save will trigger pre-save middleware for recalculation
    await member.save();

    console.log(`📝 Member updated: ${member.name}`);
    console.log(`📅 New admission date: ${member.admissionDate.toDateString()}`);
    console.log(`📅 Recalculated due date: ${member.nextPaymentDue.toDateString()}`);
    
    res.json(member);
  } catch (error) {
    console.error('Error updating member:', error);
    res.status(400).json({ error: error.message });
  }
});

// FIXED: Update fee status with proper logic
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
    
    if (feeStatus === 'paid') {
      member.lastPaymentDate = new Date(); // Update last payment date
      // Reset reminder timestamps
      member.lastExpiryReminderSentAt = null;
      member.lastUnpaidReminderSentAt = null;
    }
    
    await member.save(); // This will recalculate next due date

    // Send payment confirmation SMS
    if (wasUnpaid && member.feeStatus === 'paid') {
      const message = `Hi ${member.name}, your payment has been received. Thank you! Your next payment is due on ${member.nextPaymentDue.toDateString()}.`;
      await sendSMS(member.phone, message);
    }

    console.log(`💰 Fee status updated for ${member.name}: ${feeStatus}`);
    console.log(`📅 Next due date: ${member.nextPaymentDue.toDateString()}`);
    
    res.json(member);
  } catch (error) {
    console.error('Error updating fee status:', error);
    res.status(400).json({ error: error.message });
  }
});

// Utility route to recalculate due dates
app.post('/api/recalculate-due-dates', async (req, res) => {
  try {
    const members = await Member.find({ isActive: true });
    let updated = 0;
    
    for (const member of members) {
      const oldDueDate = member.nextPaymentDue;
      
      // Force recalculation by triggering save
      await member.save();
      
      console.log(`${member.name}: ${oldDueDate?.toDateString()} -> ${member.nextPaymentDue?.toDateString()}`);
      updated++;
    }
    
    res.json({ 
      message: `Recalculated due dates for ${updated} members`,
      updated 
    });
  } catch (error) {
    console.error('Error recalculating due dates:', error);
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

// Manual overdue update trigger
app.post('/api/update-overdue', async (req, res) => {
  try {
    const result = await updateOverdueMembers();
    res.json({
      message: 'Overdue members updated successfully',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error in manual overdue update:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    const totalMembers = await Member.countDocuments({ isActive: true });
    const paidMembers = await Member.countDocuments({ isActive: true, feeStatus: 'paid' });
    const unpaidMembers = await Member.countDocuments({ isActive: true, feeStatus: 'unpaid' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overdueMembers = await Member.countDocuments({
      isActive: true,
      nextPaymentDue: { $lt: today },
      feeStatus: 'unpaid'
    });

    res.json({
      totalMembers,
      paidMembers,
      unpaidMembers,
      overdueMembers
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
    await updateOverdueMembers();
    await scheduleExpiryReminders();
    await scheduleUnpaidReminders();
  }, 5000);
});