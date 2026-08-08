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
    return decoded.email;
  }

  // Password-login tokens issued before the auth.js fix carry only an id and
  // stay in circulation for 7 days. Look the email up once for those.
  const id = decoded.id || decoded.userId;
  if (!id) return null;
  try {
    const user = await User.findById(id).select("email");
    if (!user) return null;
    socket.userEmail = user.email;
    return user.email;
  } catch (err) {
    console.error("Failed to resolve chat sender from id:", err.message);
    return null;
  }
}

function displayNameFor(email) {
  return String(email).split("@")[0];
}

module.exports = { resolveGlobalSender, displayNameFor };
