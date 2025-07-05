// models/User.js - Updated User Schema with Google Auth support

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      // Password is required only if user is not a Google user
      return !this.isGoogleUser;
    },
    minlength: 6
  },
  name: {
    type: String,
    trim: true
  },
  // Google Auth fields
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows null values while maintaining uniqueness
  },
  isGoogleUser: {
    type: Boolean,
    default: false
  },
  profilePicture: {
    type: String
  },
  // App-specific fields
  withVideo: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  // For ID card signup
  generatedUserId: {
    type: String,
    sparse: true
  },
  // Add any other fields you need
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving (only for non-Google users)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false; // Google users don't have passwords
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

module.exports = mongoose.model('User', userSchema);