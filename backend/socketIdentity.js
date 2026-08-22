// socketIdentity.js - resolve a socket's user from its JWT.
// Deliberately isolated from the commented-out io.use matchmaking middleware so
// chat auth cannot affect matchmaking.
const jwt = require("jsonwebtoken");
const User = require("./models/User.js");

// The in-flight promise is cached on the socket so a burst of events cannot fan
// out into concurrent database queries, and so a token that resolves to nothing
// is only looked up once per connection.
function resolveGlobalSender(socket) {
  if (socket.userEmail) return Promise.resolve(socket.userEmail);
  if (!socket.chatSenderLookup) {
    socket.chatSenderLookup = lookupGlobalSender(socket);
  }
  return socket.chatSenderLookup;
}

async function lookupGlobalSender(socket) {
  const raw =
    socket.handshake.auth?.token || socket.handshake.headers?.authorization;
  if (!raw) return null;
  const token = raw.startsWith("Bearer ") ? raw.substring(7) : raw;

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }

  if (decoded.email) {
    socket.userEmail = decoded.email;
    socket.userName = decoded.name || "";
    return decoded.email;
  }

  // Password-login tokens issued before the auth.js fix carry only an id and
  // stay in circulation for 7 days. Look the email up once for those.
  const id = decoded.id || decoded.userId;
  if (!id) return null;
  try {
    const user = await User.findById(id).select("email name");
    if (!user) return null;
    socket.userEmail = user.email;
    socket.userName = user.name || "";
    return user.email;
  } catch (err) {
    console.error("Failed to resolve chat sender from id:", err.message);
    return null;
  }
}

// Takes the socket, not an email: the display name now comes from the Google
// profile, with the email prefix only as a fallback. An email handle carries a
// surname and digits, so the first name actually reveals less.
function displayNameFor(socket) {
  const name = String(socket?.userName || "").trim();
  if (name) return name.split(/\s+/)[0];

  const email = String(socket?.userEmail || "");
  return email.split("@")[0] || "someone";
}

module.exports = { resolveGlobalSender, displayNameFor };
