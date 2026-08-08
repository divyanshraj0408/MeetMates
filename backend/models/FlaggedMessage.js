// models/FlaggedMessage.js - log of blocked global-chat messages for monitoring
const mongoose = require("mongoose");

const flaggedMessageSchema = new mongoose.Schema({
  email: { type: String, trim: true },
  text: { type: String, required: true },
  reason: { type: String },
  category: { type: String },
  socketId: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("FlaggedMessage", flaggedMessageSchema);
