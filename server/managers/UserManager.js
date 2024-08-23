const express = require("express");
const bodyParser = require("body-parser");
const { Server } = require("socket.io");

const io = new Server({
  cors: true,
});
const app = express();

app.use(bodyParser.json());

const users = [];
const queue = [];

const addUser = (name, socket) => {
  users.push(name, socket);
  queue.push(socket.id);
  socket.emit("lobby");
  clearQueue();
  initHandlers(socket);
};
const removeUser = (socketId) => {
  const user = users.find((x) => x.socket.id === socketId);
  users = users.filter((x) => x.socket.id !== socketId);
  queue = queue.filter((x) => x === socketId);
};
const clearQueue = () => {
  console.log("inside clear queues");
  console.log(queue.length);
  if (queue.length < 2) {
    return;
  }
  const id2 = queue.pop();
  const id1 = queue.pop();
  console.log("id is " + id1 + " " + id2);
  const user1 = users.find((x) => x.socket.id === id1);
  const user2 = users.find((x) => x.socket.id === id2);
  if (!user1 || !user2) {
    return;
  }
  console.log("creating roonm");

  const room = roomManager.createRoom(user1, user2);
  clearQueue();
};
const initHandlers = (socket) => {
  socket.on("offer", ({ sdp, roomId }) => {
    roomManager.onOffer(roomId, sdp, socket.id);
  });

  socket.on("answer", ({ sdp, roomId }) => {
    roomManager.onAnswer(roomId, sdp, socket.id);
  });

  socket.on("add-ice-candidate", ({ candidate, roomId, type }) => {
    roomManager.onIceCandidates(roomId, socket.id, candidate, type);
  });
};
