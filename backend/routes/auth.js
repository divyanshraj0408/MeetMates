// Add this to your auth routes file (e.g., routes/auth.js)

const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User'); // Adjust path to your User model
const router = express.Router();
require('dotenv').config();
const { buildUserFieldsFromGooglePayload } = require("../googleIdentity.js");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google Login/Signup Route
router.post('/google-login', async (req, res) => {
  try {
    const { credential, withVideo } = req.body;

    if (!credential) {
      return res.status(400).json({
        error: 'Google credential is required'
      });
    }

    // Verify the Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const built = buildUserFieldsFromGooglePayload(payload, { withVideo });
    if (!built.ok) {
      return res.status(400).json({ error: built.reason });
    }
    const fields = built.fields;

    let user = await User.findOne({
      $or: [{ email: fields.email }, { googleId: fields.googleId }],
    });

    if (user) {
      // Linking an existing account. isGoogleUser was previously left false
      // here, which contradicts the model's own password-required rule.
      if (!user.googleId) {
        user.googleId = fields.googleId;
        user.name = user.name || fields.name;
        user.profilePicture = user.profilePicture || fields.profilePicture;
        user.isGoogleUser = true;
        await user.save();
      }
    } else {
      user = new User(fields);
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        name: user.name || "",
        isGoogleUser: user.isGoogleUser
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } // Token expires in 7 days
    );

    res.status(200).json({
      success: true,
      message: user.isGoogleUser && !user.password ? 'Google signup successful' : 'Google login successful',
      token: token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profilePicture: user.profilePicture,
        isGoogleUser: user.isGoogleUser,
        withVideo: user.withVideo,
        isAdultConfirmed: Boolean(user.isAdultConfirmed)
      }
    });

  } catch (error) {
    console.error('Google auth error:', error);

    if (error.message.includes('Token used too early')) {
      return res.status(400).json({
        error: 'Invalid token timing. Please try again.'
      });
    }

    if (error.message.includes('Invalid token')) {
      return res.status(400).json({
        error: 'Invalid Google token. Please try again.'
      });
    }

    res.status(500).json({
      error: 'Google authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
