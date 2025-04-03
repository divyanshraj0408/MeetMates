const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

// Register User
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email.endsWith("@adgitmdelhi.ac.in")) {
      return res.status(400).json({ error: "Please use your college email" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    res.status(201).json({ message: "User registered successfully", user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
};

// Login User
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token, userId: user.id, email: user.email });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
};
const authenticateSocketUser = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication error: Token required"));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded; // Attach user data to socket
    next();
  } catch (error) {
    return next(new Error("Authentication error: Invalid token"));
  }
};

module.exports = { registerUser, loginUser, authenticateSocketUser };
