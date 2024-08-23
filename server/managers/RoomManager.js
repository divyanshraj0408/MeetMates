const { User } = require("./UserManager");

let GLOBAL_ROOM_ID = 1;

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(user1, user2) {
    const roomId = this.generate().toString();
    this.rooms.set(roomId, {
      user1: user1,
      user2: user2,
    });

    user1.socket.emit("send-offer", {
      roomId: roomId,
    });

    user2.socket.emit("send-offer", {
      roomId: roomId,
    });
  }

  onOffer(roomId, sdp, senderSocketid) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const receivingUser =
      room.user1.socket.id === senderSocketid ? room.user2 : room.user1;
    receivingUser.socket.emit("offer", {
      sdp: sdp,
      roomId: roomId,
    });
  }

  onAnswer(roomId, sdp, senderSocketid) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const receivingUser =
      room.user1.socket.id === senderSocketid ? room.user2 : room.user1;
    receivingUser.socket.emit("answer", {
      sdp: sdp,
      roomId: roomId,
    });
  }

  onIceCandidates(roomId, senderSocketid, candidate, type) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const receivingUser =
      room.user1.socket.id === senderSocketid ? room.user2 : room.user1;
    receivingUser.socket.emit("add-ice-candidate", {
      candidate: candidate,
      type: type,
    });
  }

  generate() {
    return GLOBAL_ROOM_ID++;
  }
}
module.exports = RoomManager;
