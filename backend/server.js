const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");

dotenv.config();

const authRoutes = require("./routes/auth.js");
const imageAuthRoute = require("./routes/imageAuth.js");
const { authMiddleware, optionalAuth } = require("./middleware/auth.js");

const app = express();
const server = http.createServer(app);

// Allow local + production origins
const allowedOrigins = ["http://localhost:5173", "https://www.meetmates.space"];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error("Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// Connect MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Register routes (auth routes don't need middleware since they handle their own auth)
app.use("/api/auth", authRoutes);
app.use("/api/auth", imageAuthRoute);

// Protected routes example (add these as you create more features)
app.get("/api/profile", authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      profilePicture: req.user.profilePicture,
      isGoogleUser: req.user.isGoogleUser
    }
  });
});

// Optional: Add a route to verify token validity
app.get("/api/verify-token", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Token is valid",
    user: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name
    }
  });
});

// Socket.IO Authentication Middleware
const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
    
    if (!token) {
      return next(new Error("Authentication token required"));
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
    
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
    
    // You could fetch user from database here if needed
    // const user = await User.findById(decoded.userId);
    
    socket.userId = decoded.userId;
    socket.userEmail = decoded.email;
    socket.isGoogleUser = decoded.isGoogleUser;
    
    next();
  } catch (error) {
    console.error("Socket authentication error:", error);
    next(new Error("Authentication failed"));
  }
};

// Apply authentication to socket connections
// Comment out the line below if you want to allow unauthenticated socket connections
// io.use(socketAuthMiddleware);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

let waitingUsers = [];
let videoEnabledUsers = new Set();
let chatPairs = {};
// Track users who are ready for WebRTC connection
let rtcReadyUsers = new Set();
// Track authenticated users
let authenticatedUsers = new Map(); // socketId -> user info
let onlineUsers = 0;
io.on("connection", (socket) => {

  console.log("New user connected:", socket.id);
  
  // Store user info if authenticated
  if (socket.userId) {
    authenticatedUsers.set(socket.id, {
      userId: socket.userId,
      email: socket.userEmail,
      isGoogleUser: socket.isGoogleUser
    });
    console.log(`Authenticated user connected: ${socket.userEmail}`);
  }
  io.on("connection", (socket) => {
  onlineUsers++;
  console.log("User connected:", socket.id, "Total online users:", onlineUsers);
  io.emit("onlineUsers", onlineUsers); // broadcast updated count

  socket.on("disconnect", () => {
    onlineUsers = Math.max(onlineUsers - 1, 0);
    io.emit("onlineUsers", onlineUsers);
  });
});

  // Enhanced findChat with authentication info
  socket.on("findChat", (collegeEmail, withVideo = false) => {
    // Use authenticated email if available, otherwise use provided email
    const userEmail = socket.userEmail || collegeEmail;
    
    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      io.to(partner).emit("partnerLeft");
      delete chatPairs[socket.id];
      delete chatPairs[partner];
    }

    waitingUsers.push(socket.id);
    withVideo
      ? videoEnabledUsers.add(socket.id)
      : videoEnabledUsers.delete(socket.id);

    socket.emit("waiting");
    console.log(`User ${userEmail} looking for chat, video: ${withVideo}`);
    matchUsers();
  });

  socket.on("sendMessage", (message) => {
    if (chatPairs[socket.id]) {
      const userInfo = authenticatedUsers.get(socket.id);
      io.to(chatPairs[socket.id].room).emit("message", {
        sender: socket.id,
        text: message,
        senderEmail: userInfo?.email || 'Anonymous',
        timestamp: new Date().toISOString()
      });
    }
  });

socket.on("next", () => {
  if (chatPairs[socket.id]) {
    const partner = chatPairs[socket.id].partner;
    const room = chatPairs[socket.id].room;

    // Notify both users their partner left
    io.to(partner).emit("partnerLeft");
    io.to(socket.id).emit("partnerLeft");

    // Both users leave the room
    socket.leave(room);
    io.sockets.sockets.get(partner)?.leave(room);

    // Clean up chatPairs
    delete chatPairs[socket.id];
    delete chatPairs[partner];

    // Push both back to waiting queue
    waitingUsers.push(socket.id);
    waitingUsers.push(partner);

    // Notify both users to show "waiting" screen
    socket.emit("waiting");
    io.sockets.sockets.get(partner)?.emit("waiting");

    // Attempt to match both users again
    matchUsers();
  }
});


  // WebRTC Signaling Handlers
  socket.on("ready-to-connect", () => {
    rtcReadyUsers.add(socket.id);

    if (chatPairs[socket.id]) {
      const partnerId = chatPairs[socket.id].partner;

      if (rtcReadyUsers.has(partnerId)) {
        if (socket.id < partnerId) {
          socket.emit("create-offer");
        }
      }
    }
  });

  socket.on("webrtc-offer", (data) => {
    if (chatPairs[socket.id]) {
      const partnerId = chatPairs[socket.id].partner;
      io.to(partnerId).emit("webrtc-offer", {
        offer: data.offer,
        from: socket.id,
      });
    }
  });

  socket.on("webrtc-answer", (data) => {
    if (chatPairs[socket.id]) {
      const partnerId = chatPairs[socket.id].partner;
      io.to(partnerId).emit("webrtc-answer", {
        answer: data.answer,
        from: socket.id,
      });
    }
  });

  socket.on("ice-candidate", (data) => {
    if (chatPairs[socket.id]) {
      const partnerId = chatPairs[socket.id].partner;
      io.to(partnerId).emit("ice-candidate", {
        candidate: data.candidate,
        from: socket.id,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    
    // Clean up user data
    authenticatedUsers.delete(socket.id);
    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
    videoEnabledUsers.delete(socket.id);
    rtcReadyUsers.delete(socket.id);

    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      io.to(partner).emit("partnerLeft");
      delete chatPairs[socket.id];
      delete chatPairs[partner];
    }
  });
});

function matchUsers() {
  matchUsersByVideoPreference();
  if (waitingUsers.length >= 2) {
    matchRemainingUsers();
  }
}

function matchUsersByVideoPreference() {
  const videoUsers = waitingUsers.filter((id) => videoEnabledUsers.has(id));
  const textOnlyUsers = waitingUsers.filter((id) => !videoEnabledUsers.has(id));

  while (videoUsers.length >= 2) {
    const user1 = videoUsers.shift();
    const user2 = videoUsers.shift();
    waitingUsers = waitingUsers.filter((id) => id !== user1 && id !== user2);
    createChatPair(user1, user2, true);
  }

  while (textOnlyUsers.length >= 2) {
    const user1 = textOnlyUsers.shift();
    const user2 = textOnlyUsers.shift();
    waitingUsers = waitingUsers.filter((id) => id !== user1 && id !== user2);
    createChatPair(user1, user2, false);
  }
}

function matchRemainingUsers() {
  while (waitingUsers.length >= 2) {
    const user1 = waitingUsers.shift();
    const user2 = waitingUsers.shift();
    const enableVideo =
      videoEnabledUsers.has(user1) || videoEnabledUsers.has(user2);
    createChatPair(user1, user2, enableVideo);
  }
}

function createChatPair(user1, user2, withVideo) {
  const socket1 = io.sockets.sockets.get(user1);
  const socket2 = io.sockets.sockets.get(user2);

  if (!socket1 || !socket2) {
    if (socket1) waitingUsers.push(user1);
    if (socket2) waitingUsers.push(user2);
    return;
  }

  const roomId = uuidv4();

  chatPairs[user1] = { partner: user2, room: roomId, video: withVideo };
  chatPairs[user2] = { partner: user1, room: roomId, video: withVideo };

  socket1.join(roomId);
  socket2.join(roomId);

  io.to(user1).emit("chatStart", { withVideo });
  io.to(user2).emit("chatStart", { withVideo });

  const user1Info = authenticatedUsers.get(user1);
  const user2Info = authenticatedUsers.get(user2);
  
  console.log(
    `Matched ${user1Info?.email || user1} and ${user2Info?.email || user2} in room ${roomId}, video: ${withVideo}`
  );
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});