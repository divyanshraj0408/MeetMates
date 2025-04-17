const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth");
const imageAuthRoute = require("./routes/imageAuth"); // ✅ New image login route
require("dotenv").config();

const app = express();
const server = http.createServer(app);

// ✅ CORS Setup
const CLIENT_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true
}));

// ✅ JSON body parsing
app.use(express.json());

// ✅ API Routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", imageAuthRoute); // ✅ Mount image-based login route

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

let waitingUsers = [];
let videoEnabledUsers = new Set();
let chatPairs = {};

io.on("connection", (socket) => {
  console.log("🟢 New user connected:", socket.id);

  socket.on("findChat", (collegeEmail, withVideo = false) => {
    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      const room = chatPairs[socket.id].room;
      io.to(partner).emit("partnerLeft");
      delete chatPairs[socket.id];
      delete chatPairs[partner];
    }

    waitingUsers.push(socket.id);
    withVideo ? videoEnabledUsers.add(socket.id) : videoEnabledUsers.delete(socket.id);
    socket.emit("waiting");
    matchUsers();
  });

  socket.on("sendMessage", (message) => {
    if (chatPairs[socket.id]) {
      io.to(chatPairs[socket.id].room).emit("message", {
        sender: socket.id,
        text: message,
      });
    }
  });

  socket.on("next", () => {
    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      const room = chatPairs[socket.id].room;

      io.to(partner).emit("partnerLeft");
      socket.leave(room);
      io.sockets.sockets.get(partner)?.leave(room);

      delete chatPairs[socket.id];
      delete chatPairs[partner];

      waitingUsers.push(socket.id);
      socket.emit("waiting");
      matchUsers();
    }
  });

  // ✅ WebRTC Signaling
  socket.on("webrtc-offer", (data) => {
    if (chatPairs[socket.id]) {
      io.to(chatPairs[socket.id].partner).emit("webrtc-offer", data);
    }
  });

  socket.on("webrtc-answer", (data) => {
    if (chatPairs[socket.id]) {
      io.to(chatPairs[socket.id].partner).emit("webrtc-answer", data);
    }
  });

  socket.on("ice-candidate", (data) => {
    if (chatPairs[socket.id]) {
      io.to(chatPairs[socket.id].partner).emit("ice-candidate", data);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
    videoEnabledUsers.delete(socket.id);

    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      io.to(partner).emit("partnerLeft");
      delete chatPairs[socket.id];
      delete chatPairs[partner];
    }
  });
});

// ✅ Matching logic
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
    const enableVideo = videoEnabledUsers.has(user1) || videoEnabledUsers.has(user2);
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

  console.log(`✅ Matched ${user1} and ${user2} in room ${roomId}, video: ${withVideo}`);
}

// ✅ Server listener
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
