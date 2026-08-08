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
const { registerGlobalChat } = require("./globalchat.js");
const { registerPairChat } = require("./pairchat.js");

const app = express();
const server = http.createServer(app);

const allowedOrigins = ["http://localhost:5173", "https://www.meetmates.space", "https://meet-mates.vercel.app"];

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

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use("/api/auth", authRoutes);
app.use("/api/auth", imageAuthRoute);

app.get("/api/profile", authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      profilePicture: req.user.profilePicture,
      isGoogleUser: req.user.isGoogleUser,
    },
  });
});

app.get("/api/verify-token", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Token is valid",
    user: { id: req.user._id, email: req.user.email, name: req.user.name },
  });
});

const socketAuthMiddleware = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth.token || socket.handshake.headers.authorization;

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    const cleanToken = token.startsWith("Bearer ")
      ? token.substring(7)
      : token;
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);

    socket.userId = decoded.userId;
    socket.userEmail = decoded.email;
    socket.isGoogleUser = decoded.isGoogleUser;

    next();
  } catch (error) {
    console.error("Socket authentication error:", error);
    next(new Error("Authentication failed"));
  }
};

// io.use(socketAuthMiddleware); // uncomment to require auth

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
let rtcReadyUsers = new Set();
let authenticatedUsers = new Map();

// FIX 3: Track users that recently clicked "next" so they can't be immediately
// re-paired with the same person. The set is keyed by socketId and cleared
// after a short cooldown window.
const nextCooldownUsers = new Set();
const NEXT_COOLDOWN_MS = 1500;

// Derive onlineUsers from the actual connected socket count instead of a
// manually incremented integer that can drift.
const getOnlineCount = () => io.sockets.sockets.size;

io.on("connection", (socket) => {
  console.log(
    "New user connected:",
    socket.id,
    "Total online users:",
    getOnlineCount()
  );

  if (socket.userId) {
    authenticatedUsers.set(socket.id, {
      userId: socket.userId,
      email: socket.userEmail,
      isGoogleUser: socket.isGoogleUser,
    });
    console.log(`Authenticated user connected: ${socket.userEmail}`);
  }

  io.emit("onlineUsers", getOnlineCount());

  registerGlobalChat(io, socket);
  registerPairChat(io, socket, chatPairs);

  socket.on("findChat", (collegeEmail, withVideo = false) => {
    const userEmail = socket.userEmail || collegeEmail;

    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      if (partner && io.sockets.sockets.get(partner)) {
        io.to(partner).emit("partnerLeft", { partnerId: socket.id });
      }
      cleanupChatPair(socket.id);
    }

    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
    waitingUsers.push(socket.id);
    withVideo
      ? videoEnabledUsers.add(socket.id)
      : videoEnabledUsers.delete(socket.id);

    socket.emit("waiting");
    console.log(`User ${userEmail} looking for chat, video: ${withVideo}`);
    matchUsers();
  });

  socket.on("next", () => {
    console.log(`User ${socket.id} clicked next`);

    if (chatPairs[socket.id]) {
      const partnerId = chatPairs[socket.id].partner;

      if (partnerId && io.sockets.sockets.get(partnerId)) {
        io.to(partnerId).emit("partnerLeft", { partnerId: socket.id });
      }

      cleanupChatPair(socket.id);

      // FIX 3: Mark both users as "in cooldown" before re-adding them to the
      // waiting queue. matchUsers will skip pairing any two users that are
      // both still in cooldown — preventing them from being matched together
      // again immediately.
      nextCooldownUsers.add(socket.id);
      setTimeout(() => nextCooldownUsers.delete(socket.id), NEXT_COOLDOWN_MS);

      waitingUsers.push(socket.id);
      socket.emit("waiting");

      if (partnerId && io.sockets.sockets.get(partnerId)) {
        nextCooldownUsers.add(partnerId);
        setTimeout(
          () => nextCooldownUsers.delete(partnerId),
          NEXT_COOLDOWN_MS
        );

        waitingUsers.push(partnerId);
        io.to(partnerId).emit("waiting");
      }

      // Give both clients a moment to process "waiting" before we try to pair
      // them. The cooldown set ensures they won't be paired with each other
      // even if matchUsers runs before the timeout expires.
      setTimeout(() => matchUsers(), NEXT_COOLDOWN_MS);
    } else {
      if (!waitingUsers.includes(socket.id)) {
        waitingUsers.push(socket.id);
      }
      socket.emit("waiting");
      matchUsers();
    }
  });
  socket.on("leaveChat", () => {
    console.log(`User ${socket.id} ended the call (left permanently)`);

    if (chatPairs[socket.id]) {
      const partnerId = chatPairs[socket.id].partner;

      // Notify partner their match left
      if (partnerId && io.sockets.sockets.get(partnerId)) {
        io.to(partnerId).emit("partnerLeft", { partnerId: socket.id });
        // Put the PARTNER back in queue — they didn't leave
        waitingUsers.push(partnerId);
        io.to(partnerId).emit("waiting");
        setTimeout(() => matchUsers(), 100);
      }

      cleanupChatPair(socket.id);
    }

    // Remove from waiting queue entirely — do NOT requeue this user
    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
  });
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
      io.to(partnerId).emit("webrtc-offer", { offer: data.offer, from: socket.id });
    }
  });

  socket.on("webrtc-answer", (data) => {
    if (chatPairs[socket.id]) {
      const partnerId = chatPairs[socket.id].partner;
      io.to(partnerId).emit("webrtc-answer", { answer: data.answer, from: socket.id });
    }
  });

  socket.on("ice-candidate", (data) => {
    if (chatPairs[socket.id]) {
      const partnerId = chatPairs[socket.id].partner;
      io.to(partnerId).emit("ice-candidate", { candidate: data.candidate, from: socket.id });
    }
  });

  socket.on("disconnect", () => {
    console.log(
      `User ${socket.id} disconnected. Total online users: ${getOnlineCount() - 1}`
    );

    authenticatedUsers.delete(socket.id);
    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
    videoEnabledUsers.delete(socket.id);
    rtcReadyUsers.delete(socket.id);
    nextCooldownUsers.delete(socket.id);

    if (chatPairs[socket.id]) {
      const partnerId = chatPairs[socket.id].partner;
      if (partnerId && io.sockets.sockets.get(partnerId)) {
        io.to(partnerId).emit("partnerLeft", { partnerId: socket.id });
      }
      cleanupChatPair(socket.id);
    }

    io.emit("onlineUsers", getOnlineCount());
  });
});

function cleanupChatPair(socketId) {
  if (!chatPairs[socketId]) return;

  const partnerId = chatPairs[socketId].partner;
  const room = chatPairs[socketId].room;

  const socket = io.sockets.sockets.get(socketId);
  const partnerSocket = io.sockets.sockets.get(partnerId);

  if (socket) socket.leave(room);
  if (partnerSocket) partnerSocket.leave(room);

  rtcReadyUsers.delete(socketId);
  if (partnerId) rtcReadyUsers.delete(partnerId);

  delete chatPairs[socketId];
  if (partnerId) delete chatPairs[partnerId];

  console.log(`Cleaned up chat pair: ${socketId} and ${partnerId}`);
}

function matchUsers() {
  matchUsersByVideoPreference();
  if (waitingUsers.length >= 2) {
    matchRemainingUsers();
  }
}

// FIX 3 (cont): canPair returns false when both users are in the post-next
// cooldown window, preventing an immediate re-match of the same two people.
function canPair(id1, id2) {
  return !(nextCooldownUsers.has(id1) && nextCooldownUsers.has(id2));
}

function matchUsersByVideoPreference() {
  const videoUsers = waitingUsers.filter((id) => videoEnabledUsers.has(id));
  const textOnlyUsers = waitingUsers.filter((id) => !videoEnabledUsers.has(id));

  let i = 0;
  while (i < videoUsers.length - 1) {
    const user1 = videoUsers[i];
    let matched = false;
    for (let j = i + 1; j < videoUsers.length; j++) {
      const user2 = videoUsers[j];
      if (canPair(user1, user2)) {
        videoUsers.splice(j, 1);
        videoUsers.splice(i, 1);
        waitingUsers = waitingUsers.filter((id) => id !== user1 && id !== user2);
        createChatPair(user1, user2, true);
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }

  let k = 0;
  while (k < textOnlyUsers.length - 1) {
    const user1 = textOnlyUsers[k];
    let matched = false;
    for (let j = k + 1; j < textOnlyUsers.length; j++) {
      const user2 = textOnlyUsers[j];
      if (canPair(user1, user2)) {
        textOnlyUsers.splice(j, 1);
        textOnlyUsers.splice(k, 1);
        waitingUsers = waitingUsers.filter((id) => id !== user1 && id !== user2);
        createChatPair(user1, user2, false);
        matched = true;
        break;
      }
    }
    if (!matched) k++;
  }
}

function matchRemainingUsers() {
  let i = 0;
  while (i < waitingUsers.length - 1) {
    const user1 = waitingUsers[i];
    let matched = false;
    for (let j = i + 1; j < waitingUsers.length; j++) {
      const user2 = waitingUsers[j];
      if (canPair(user1, user2)) {
        waitingUsers.splice(j, 1);
        waitingUsers.splice(i, 1);
        const enableVideo =
          videoEnabledUsers.has(user1) || videoEnabledUsers.has(user2);
        createChatPair(user1, user2, enableVideo);
        matched = true;
        break;
      }
    }
    if (!matched) i++;
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

  io.to(user1).emit("chatStart", { withVideo, partnerId: user2 });
  io.to(user2).emit("chatStart", { withVideo, partnerId: user1 });

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