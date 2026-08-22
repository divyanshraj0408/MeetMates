// models/User.js - Updated User Schema with Google Auth support

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  // Retained so documents created before Google-only auth stay readable.
  // Nothing writes it any more — there is no password login.
  password: {
    type: String,
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
  // The 18+ gate. A checkbox, not a date of birth: the gate does the enforcing,
  // so the exact number is never needed, and data not held cannot leak.
  isAdultConfirmed: {
    type: Boolean,
    default: false,
  },
  adultConfirmedAt: {
    type: Date,
  },

  // Shown to the person you are matched with. Deliberately contains nothing
  // that could be used to find you afterwards — see the design spec.
  profile: {
    ageBand: { type: String, default: "" },
    countryCode: { type: String, trim: true, maxlength: 2, default: "" },
    city: { type: String, trim: true, maxlength: 85, default: "" },
    gender: { type: String, default: "" },
    interests: { type: [String], default: [] },
    bio: { type: String, trim: true, maxlength: 200, default: "" },
    updatedAt: { type: Date },
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  // Left over from the ID-card signup flow, which was removed with password
  // auth. Kept, like `password`, so documents written before then stay
  // readable; nothing writes it any more.
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

// Method to update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

// Matchmaking is an in-memory FIFO today and queries none of this. These are
// for the matching sprint; adding them now costs almost nothing and removes a
// migration later. Deliberately no compound index beyond location — the query
// shape does not exist yet, and a wrong compound is worse than none.
userSchema.index({ "profile.interests": 1 });
userSchema.index({ "profile.ageBand": 1 });
userSchema.index({ "profile.gender": 1 });
userSchema.index({ "profile.countryCode": 1, "profile.city": 1 });

module.exports = mongoose.model('User', userSchema);