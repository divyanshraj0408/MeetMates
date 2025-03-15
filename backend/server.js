// Updated server.js with WebRTC signaling
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);

// Set up CORS for development
app.use(cors());

// Socket.io server with CORS config
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173", // Use CORS_ORIGIN from environment or fallback to localhost
    methods: ["GET", "POST"],
  },
});

// Queue for waiting users
let waitingUsers = [];
// Users who want video
let videoEnabledUsers = new Set();
// Active chat pairs
let chatPairs = {};

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  // When user wants to find a chat
  socket.on("findChat", (collegeEmail, withVideo = false) => {
    console.log(
      `User ${socket.id} looking for chat with email: ${collegeEmail}, video: ${withVideo}`
    );

    // Verify college email domain
    if (!collegeEmail.endsWith("@yourcollege.edu")) {
      socket.emit("error", "Please use your college email");
      return;
    }

    // Remove from any existing chat if present
    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      const room = chatPairs[socket.id].room;

      // Notify the partner
      io.to(partner).emit("partnerLeft");

      // Clean up chat pairs
      delete chatPairs[socket.id];
      delete chatPairs[partner];
    }

    // Add user to waiting queue
    waitingUsers.push(socket.id);

    // Track if this user wants video
    if (withVideo) {
      videoEnabledUsers.add(socket.id);
    } else {
      videoEnabledUsers.delete(socket.id);
    }

    socket.emit("waiting");

    // Check if we can create a pair
    matchUsers();
  });

  // Handle chat messages
  socket.on("sendMessage", (message) => {
    if (chatPairs[socket.id]) {
      io.to(chatPairs[socket.id].room).emit("message", {
        sender: socket.id,
        text: message,
      });
    }
  });

  // Handle "next" button
  socket.on("next", () => {
    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      const room = chatPairs[socket.id].room;

      // Notify the partner
      io.to(partner).emit("partnerLeft");

      // Make both leave the room
      socket.leave(room);
      io.sockets.sockets.get(partner)?.leave(room);

      // Clean up chat pairs
      delete chatPairs[socket.id];
      delete chatPairs[partner];

      // Put the current user back in the queue
      waitingUsers.push(socket.id);
      socket.emit("waiting");

      // Try to match again
      matchUsers();
    }
  });

  // WebRTC signaling
  socket.on("webrtc-offer", (data) => {
    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      io.to(partner).emit("webrtc-offer", data);
    }
  });

  socket.on("webrtc-answer", (data) => {
    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      io.to(partner).emit("webrtc-answer", data);
    }
  });

  socket.on("ice-candidate", (data) => {
    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      io.to(partner).emit("ice-candidate", data);
    }
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Remove from waiting queue if present
    waitingUsers = waitingUsers.filter((id) => id !== socket.id);

    // Remove from video enabled set
    videoEnabledUsers.delete(socket.id);

    // Handle active chat disconnection
    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;

      // Notify the partner
      io.to(partner).emit("partnerLeft");

      // Clean up chat pairs
      delete chatPairs[socket.id];
      delete chatPairs[partner];
    }
  });
});

// Function to match users from the waiting queue
function matchUsers() {
  // First try to match users with the same video preference
  matchUsersByVideoPreference();

  // If there are still users waiting, try to match them regardless of preference
  if (waitingUsers.length >= 2) {
    matchRemainingUsers();
  }
}

function matchUsersByVideoPreference() {
  // Find users who want video
  const videoUsers = waitingUsers.filter((id) => videoEnabledUsers.has(id));
  // Find users who don't want video
  const textOnlyUsers = waitingUsers.filter((id) => !videoEnabledUsers.has(id));

  // Match video users with each other
  while (videoUsers.length >= 2) {
    const user1 = videoUsers.shift();
    const user2 = videoUsers.shift();

    // Remove them from the main waiting queue
    waitingUsers = waitingUsers.filter((id) => id !== user1 && id !== user2);

    createChatPair(user1, user2, true);
  }

  // Match text-only users with each other
  while (textOnlyUsers.length >= 2) {
    const user1 = textOnlyUsers.shift();
    const user2 = textOnlyUsers.shift();

    // Remove them from the main waiting queue
    waitingUsers = waitingUsers.filter((id) => id !== user1 && id !== user2);

    createChatPair(user1, user2, false);
  }
}

function matchRemainingUsers() {
  while (waitingUsers.length >= 2) {
    const user1 = waitingUsers.shift();
    const user2 = waitingUsers.shift();

    // Determine if video should be enabled (if either user wants video)
    const enableVideo =
      videoEnabledUsers.has(user1) || videoEnabledUsers.has(user2);

    createChatPair(user1, user2, enableVideo);
  }
}

function createChatPair(user1, user2, withVideo) {
  // Check if sockets still exist
  const socket1 = io.sockets.sockets.get(user1);
  const socket2 = io.sockets.sockets.get(user2);

  if (!socket1 || !socket2) {
    // If one of the sockets is gone, put the existing one back in queue
    if (socket1) waitingUsers.push(user1);
    if (socket2) waitingUsers.push(user2);
    return;
  }

  // Generate a unique room ID
  const roomId = uuidv4();

  // Add to active pairs
  chatPairs[user1] = {
    partner: user2,
    room: roomId,
    video: withVideo,
  };

  chatPairs[user2] = {
    partner: user1,
    room: roomId,
    video: withVideo,
  };

  // Make both users join the room
  socket1.join(roomId);
  socket2.join(roomId);

  // Notify both users
  io.to(user1).emit("chatStart", { withVideo });
  io.to(user2).emit("chatStart", { withVideo });

  console.log(
    `Matched users ${user1} and ${user2} in room ${roomId} with video: ${withVideo}`
  );
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
