const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const authRoutes = require("./routes/auth.js");
const imageAuthRoute = require("./routes/imageAuth.js");

const app = express();
const server = http.createServer(app);

// Allow local + production origins
const allowedOrigins = [
  "http://localhost:5173",
  "https://www.meetmates.space"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error("Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());

// Connect MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected"))
.catch((err) => console.error("MongoDB connection error:", err));

// Register routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", imageAuthRoute);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

let waitingUsers = [];
let videoEnabledUsers = new Set();
let chatPairs = {};

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  socket.on("findChat", (collegeEmail, withVideo = false) => {
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
    matchUsers();
  });

  socket.on("sendMessage", (message) => {
    if (chatPairs[socket.id]) {
      io.to(chatPairs[socket.id].room).emit("message", {
        sender: socket.id,
        text: message
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
    console.log("User disconnected:", socket.id);
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

  console.log(`Matched ${user1} and ${user2} in room ${roomId}, video: ${withVideo}`);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
