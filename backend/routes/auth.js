// Add this to your auth routes file (e.g., routes/auth.js)

const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User'); // Adjust path to your User model
const router = express.Router();
const bcrypt = require('bcrypt');
require('dotenv').config();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


function isValidEmailOrUserID(input) {
  return (
    input.endsWith("@adgitmdelhi.ac.in") || /^[a-z0-9]{5,}$/i.test(input)
  );
}
function normalize(input) {
  return input.trim().toLowerCase();
}
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
     console.log("signup attempt:", { email });

    const normalizedEmail = normalize(email);

    if (!isValidEmailOrUserID(normalizedEmail)) {
      return res.status(400).json({
        msg: "Signup is only allowed with an @adgitmdelhi.ac.in email or a valid user ID.",
      });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ msg: "Password must be at least 6 characters long." });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ msg: "User already exists." });
    }

    // const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ email: normalizedEmail, password: password });

    return res.status(201).json({ msg: "Signup successful." });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
     console.log("Login attempt:", { email });
    const normalizedEmail = normalize(email);

    if (!isValidEmailOrUserID(normalizedEmail)) {
      return res.status(400).json({
        msg: "Login is only allowed with an @adgitmdelhi.ac.in email or a valid user ID.",
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ msg: "Invalid credentials." });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(400).json({ msg: "Invalid credentials." });
    }

    if (!process.env.JWT_SECRET) {
      return res
        .status(500)
        .json({ error: "JWT_SECRET is not set in environment variables." });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.status(200).json({ token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});
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
    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({ 
        error: 'Email not provided by Google' 
      });
    }

    // Check if user exists
    let user = await User.findOne({ 
      $or: [
        { email: email },
        { googleId: googleId }
      ]
    });

    if (user) {
      // User exists - update Google info if needed
      if (!user.googleId) {
        user.googleId = googleId;
        user.name = user.name || name;
        user.profilePicture = user.profilePicture || picture;
        await user.save();
      }
    } else {
      // Create new user
      user = new User({
        email: email,
        name: name,
        googleId: googleId,
        profilePicture: picture,
        isGoogleUser: true,
        isVerified: true, // Google users are considered verified
        withVideo: withVideo || true
      });
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
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
        withVideo: user.withVideo
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