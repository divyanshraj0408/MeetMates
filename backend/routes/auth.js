const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const User = require("../models/User");

const router = express.Router();

// ✅ Signup Route
router.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  console.log("Signup Request:", { email });

  try {
    // Validate email and password
    if (!validator.isEmail(email)) {
      return res.status(400).json({ msg: "Invalid email format" });
    }

    if (password.length < 6) {
      return res.status(400).json({ msg: "Password must be at least 6 characters long" });
    }

    // Check if user already exists
    const existing = await User.findOne({ email });
    if (existing) {
      console.log("User already exists:", email);
      return res.status(400).json({ msg: "User already exists" });
    }

    // Hash the password and create a new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({ email, password: hashedPassword });

    console.log("✅ Signup successful:", newUser._id);
    res.status(201).json({ msg: "Signup successful" });
  } catch (err) {
    console.error("❌ Signup error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Login Route
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Login Request:", { email });

  try {
    if (!validator.isEmail(email)) {
      return res.status(400).json({ msg: "Invalid email format" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.log("No user found with email:", email);
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log("Incorrect password for:", email);
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // ✅ Check if JWT_SECRET is defined
    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET not set in environment variables.");
      return res.status(500).json({ error: "Server misconfiguration: JWT_SECRET missing" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    console.log("✅ Login successful. Token generated.");
    res.json({ token });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
