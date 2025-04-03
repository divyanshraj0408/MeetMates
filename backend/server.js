require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { authenticateUser } = require("./config/auth"); // Ensure auth logic is correct

const app = express();
const server = http.createServer(app);

app.use(cors());

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

let waitingUsers = [];
let videoEnabledUsers = new Set();
let chatPairs = {};

io.on("connection", (socket) => {
  console.log(`New user connected: ${socket.id}`);

  socket.on("findChat", (collegeEmail, withVideo = false) => {
    console.log(`User ${socket.id} is searching for a chat.`);

    if (!authenticateUser(socket, collegeEmail)) {
      console.log(`Authentication failed for ${socket.id}`);
      return;
    }

    // Remove from existing chat if already paired
    removeUserFromChat(socket.id);

    // Add user to queue
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
        text: message,
      });
    }
  });

  socket.on("next", () => {
    removeUserFromChat(socket.id);
    waitingUsers.push(socket.id);
    socket.emit("waiting");
    matchUsers();
  });

  // WebRTC signaling events
  ["webrtc-offer", "webrtc-answer", "ice-candidate"].forEach((event) => {
    socket.on(event, (data) => {
      if (chatPairs[socket.id]) {
        io.to(chatPairs[socket.id].partner).emit(event, data);
      }
    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    removeUserFromChat(socket.id);
    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
    videoEnabledUsers.delete(socket.id);
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
  const textUsers = waitingUsers.filter((id) => !videoEnabledUsers.has(id));

  while (videoUsers.length >= 2)
    createChatPair(videoUsers.shift(), videoUsers.shift(), true);
  while (textUsers.length >= 2)
    createChatPair(textUsers.shift(), textUsers.shift(), false);
}

function matchRemainingUsers() {
  while (waitingUsers.length >= 2) {
    const user1 = waitingUsers.shift();
    const user2 = waitingUsers.shift();
    createChatPair(
      user1,
      user2,
      videoEnabledUsers.has(user1) || videoEnabledUsers.has(user2)
    );
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

  console.log(
    `Matched users ${user1} and ${user2} in room ${roomId} (Video: ${withVideo})`
  );
}

function removeUserFromChat(userId) {
  if (chatPairs[userId]) {
    const partner = chatPairs[userId].partner;
    const room = chatPairs[userId].room;
    io.to(partner).emit("partnerLeft");

    io.sockets.sockets.get(userId)?.leave(room);
    io.sockets.sockets.get(partner)?.leave(room);

    delete chatPairs[userId];
    delete chatPairs[partner];
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
