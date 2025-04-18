const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const User = require("../models/User.js");

const router = express.Router();

// Check if the input is a valid adgitm email or user ID pattern
function isValidEmailOrUserID(input) {
  return (
    input.endsWith("@adgitmdelhi.ac.in") || /^[a-z0-9]{5,}$/i.test(input)
  );
}

// Normalize and lowercase the input for consistency
function normalize(input) {
  return input.trim().toLowerCase();
}

// Signup Route
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
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

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ email: normalizedEmail, password: hashedPassword });

    return res.status(201).json({ msg: "Signup successful." });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
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

    const match = await bcrypt.compare(password, user.password);
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

module.exports = router;
