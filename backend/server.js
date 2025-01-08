const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

const waitingUsers = new Set();
const activeConnections = new Map();
const userPartners = new Map();

wss.on("connection", (ws) => {
  const userId = uuidv4();
  console.log(`New user connected: ${userId}`);

  // Send the user their ID
  ws.send(
    JSON.stringify({
      type: "userId",
      userId: userId,
    })
  );

  waitingUsers.add(userId);
  activeConnections.set(userId, ws);
  tryMatchUser(userId);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`Received message type: ${data.type} from: ${userId}`);
      handleMessage(userId, data);
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    console.log(`User disconnected: ${userId}`);
    handleDisconnect(userId);
  });
});

function tryMatchUser(userId) {
  for (const waitingUser of waitingUsers) {
    if (waitingUser !== userId) {
      console.log(`Matching users: ${userId} and ${waitingUser}`);

      waitingUsers.delete(waitingUser);
      waitingUsers.delete(userId);

      userPartners.set(userId, waitingUser);
      userPartners.set(waitingUser, userId);

      const user1Ws = activeConnections.get(userId);
      const user2Ws = activeConnections.get(waitingUser);

      if (user1Ws && user2Ws) {
        user1Ws.send(
          JSON.stringify({
            type: "matched",
            partnerId: waitingUser,
            initiator: true,
          })
        );

        user2Ws.send(
          JSON.stringify({
            type: "matched",
            partnerId: userId,
            initiator: false,
          })
        );
      }
      return;
    }
  }
}

function handleMessage(userId, data) {
  const { type, target, payload } = data;

  // For 'next' message type, handle differently
  if (type === "next") {
    handleNextRequest(userId);
    return;
  }

  const partnerId = userPartners.get(userId);
  const targetWs = activeConnections.get(partnerId);

  if (!targetWs) {
    console.log(`Partner not found for user ${userId}`);
    return;
  }

  console.log(`Forwarding ${type} from ${userId} to ${partnerId}`);
  targetWs.send(
    JSON.stringify({
      type,
      from: userId,
      payload,
    })
  );
}

function handleNextRequest(userId) {
  const oldPartnerId = userPartners.get(userId);

  // Clean up old partnership
  if (oldPartnerId) {
    userPartners.delete(oldPartnerId);
    userPartners.delete(userId);

    const oldPartnerWs = activeConnections.get(oldPartnerId);
    if (oldPartnerWs) {
      oldPartnerWs.send(JSON.stringify({ type: "partnerDisconnected" }));
    }
  }

  // Add user back to waiting pool
  waitingUsers.add(userId);
  tryMatchUser(userId);
}

function handleDisconnect(userId) {
  const partnerId = userPartners.get(userId);
  if (partnerId) {
    const partnerWs = activeConnections.get(partnerId);
    if (partnerWs) {
      partnerWs.send(JSON.stringify({ type: "partnerDisconnected" }));
    }
    userPartners.delete(partnerId);
  }

  waitingUsers.delete(userId);
  activeConnections.delete(userId);
  userPartners.delete(userId);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
