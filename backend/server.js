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
const profileRoutes = require("./routes/profile.js");
const { authMiddleware, optionalAuth } = require("./middleware/auth.js");
const { registerGlobalChat } = require("./globalchat.js");
const { registerPairChat } = require("./pairchat.js");
const UserModel = require("./models/User.js");
const { resolveGlobalSender } = require("./socketIdentity.js");
const { buildPartnerPayload } = require("./partnerPayload.js");
const { buildMatchAttrs } = require("./matchAttrs.js");
const {
  sanitizeFilters,
  canPairByFilters,
  LOCATION_WORLDWIDE,
  NO_GENDER_FILTER,
} = require("./matchFilters.js");
const {
  TIERS,
  tierForRound,
  sharedInterests,
  generateStatements,
} = require("./neverHaveIEver.js");

// The profile a partner is allowed to see. Explicitly built field by field
// rather than spread from the document: a spread here is how name, email and
// googleId would quietly reach a stranger.
async function visibleProfileFor(socket) {
  try {
    const email = await resolveGlobalSender(socket);
    if (!email) return null;
    const user = await UserModel.findOne({ email }).select("profile");
    const p = user?.profile;
    if (!p) return null;
    return buildPartnerPayload(p);
  } catch (err) {
    console.error("Failed to load partner profile:", err.message);
    return null;
  }
}

const app = express();
const server = http.createServer(app);

// Origins allowed to call this API, for both Express and Socket.IO.
//
// CORS_ORIGIN was being set in the Render dashboard while this list stayed
// hardcoded, so the deployed frontend was blocked by a value nobody could see
// in the config. Read it here, and accept a comma-separated list for the sites
// reachable at more than one hostname (apex and www are different origins).
//
// Trailing slashes are stripped because an Origin header never carries one, so
// "https://example.com/" in the dashboard would match nothing and look like a
// server bug rather than a typo.
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "https://www.meetmates.space",
  "https://meet-mates.vercel.app",
];

const allowedOrigins = [
  ...new Set([
    ...DEFAULT_ORIGINS,
    ...String(process.env.CORS_ORIGIN || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  ]),
];

console.log("CORS allowed origins:", allowedOrigins.join(", "));

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
app.use("/api/profile", profileRoutes);

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

// What each waiting socket asked for, and the two profile fields matching is
// allowed to know about them. Both are keyed by socket id and cleared on
// disconnect. Filters are a session choice and are never persisted.
// Two filter maps, deliberately. chosenFilters is what the user picked and only
// findChat writes it. waitingFilters is what matching actually runs on, and the
// relax timer and widenSearch rewrite it as one search wears on.
//
// Collapsing them made relaxation permanent: fifteen seconds of bad luck, then
// every later "next" in that session silently kept the widened filter while the
// chips on screen still showed the original. A filter the UI and the server
// disagree about is the worst thing this feature could ship.
const chosenFilters = new Map();
const waitingFilters = new Map();
const waitingAttrs = new Map();

// matchUsers only ever runs in response to an event, so a filtered user whose
// criteria nobody in the queue meets waits until somebody else happens to act.
//
// This timer is the escape hatch for that. It is not a general retry loop: it
// fires once per queue entry, and for a user already searching worldwide it
// widens nothing and stops. That is deliberate rather than an oversight —
// gender never auto-relaxes, so a plain retry would rescan a queue it has
// already rejected. What actually unsticks two incompatible waiters is a third
// arrival, or either one's own relax firing.
const relaxTimers = new Map();
const RELAX_AFTER_MS = 15000;

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

  socket.on("findChat", async (collegeEmail, withVideo = false, filters) => {
    const userEmail = socket.userEmail || collegeEmail;

    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      if (partner && io.sockets.sockets.get(partner)) {
        io.to(partner).emit("partnerLeft", { partnerId: socket.id });
      }
      cleanupChatPair(socket.id);
    }

    // What the user actually picked, kept apart from the filters matching runs
    // on. Relaxing and widening rewrite the active copy; this one stays put, so
    // re-entering the queue restores the choice the chips still display.
    chosenFilters.set(socket.id, sanitizeFilters(filters));

    // One read per queue entry. Failure is non-fatal: empty attributes are
    // wildcards, so a database hiccup widens the match rather than blocking it.
    const profile = await visibleProfileFor(socket).catch(() => null);

    // The socket can disconnect during the await, and a second findChat that
    // started before this one can have paired it in the meantime. Before the
    // handler was async neither could happen between the check above and the
    // push below; now both can. Re-queueing an already-paired socket lets
    // matchUsers pair it twice, which silently orphans the first partner.
    //
    // Nothing may write per-socket state above this line: disconnect cleanup
    // can run during the await, and a write after it resurrects the entry it
    // just deleted. waitingAttrs leaked exactly one entry per abandoned search
    // that way, which is most of them when the database is slow enough to make
    // people give up.
    if (!io.sockets.sockets.get(socket.id)) return;
    if (chatPairs[socket.id]) return;

    waitingAttrs.set(socket.id, buildMatchAttrs(profile));

    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
    enqueue(socket.id);
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

      enqueue(socket.id);
      socket.emit("waiting");

      if (partnerId && io.sockets.sockets.get(partnerId)) {
        nextCooldownUsers.add(partnerId);
        setTimeout(
          () => nextCooldownUsers.delete(partnerId),
          NEXT_COOLDOWN_MS
        );

        enqueue(partnerId);
        io.to(partnerId).emit("waiting");
      }

      // Give both clients a moment to process "waiting" before we try to pair
      // them. The cooldown set ensures they won't be paired with each other
      // even if matchUsers runs before the timeout expires.
      setTimeout(() => matchUsers(), NEXT_COOLDOWN_MS);
    } else {
      enqueue(socket.id);
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
        enqueue(partnerId);
        io.to(partnerId).emit("waiting");
        setTimeout(() => matchUsers(), 100);
      }

      cleanupChatPair(socket.id);
    }

    // Remove from waiting queue entirely — do NOT requeue this user
    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
    clearRelaxTimer(socket.id);
  });

  // The user asked to widen the search themselves. This is the only thing that
  // clears a gender filter — nothing on the server does it behind their back.
  socket.on("widenSearch", () => {
    // Queue membership, not map membership. waitingFilters deliberately
    // outlives pairing, so testing it let a socket already in a call widen a
    // search it was not running and get a searchWidened event for it.
    if (!waitingUsers.includes(socket.id)) return;

    const current = waitingFilters.get(socket.id);
    if (!current) return;

    waitingFilters.set(socket.id, {
      gender: NO_GENDER_FILTER,
      location: LOCATION_WORLDWIDE,
    });
    socket.emit("searchWidened", { gender: true, location: true });
    matchUsers();
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

  // "Never Have I Ever" game state. Deliberately kept on chatPairs[id].game
  // rather than a module-level Map: it lives and dies with the pair, so
  // cleanupChatPair (which deletes both pair entries wholesale) tears the
  // game down for free. A second Map here is exactly the shape of the last
  // two leaks this project shipped.
  //
  // Both sockets' pair entries hold the SAME game object by reference, so
  // either side reads/writes one shared state. That also means "does a game
  // exist" and "is this the game I started" can both be answered by identity
  // (chatPairs[id].game === someReference) without a separate id or flag.
  socket.on("gameStart", async () => {
    const pair = chatPairs[socket.id];
    if (!pair || pair.game) return;

    const partnerId = pair.partner;
    const partnerPair = chatPairs[partnerId];
    if (!partnerPair || partnerPair.game) return;

    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (!partnerSocket) return;

    // Reserve the slot on both entries synchronously, before any await, so a
    // near-simultaneous gameStart from the other side (either player may
    // start) can't also pass the checks above and race to build a second,
    // competing game. Every step after this mutates the same object in
    // place rather than replacing it - that's what makes "is chatPairs[id]
    // .game still this object" a meaningful check after each await below.
    const game = {
      statements: [],
      current: null,
      answers: {},
      completedRounds: 0,
      tier: TIERS[0],
      interests: [],
      nextBatch: null,
      prefetching: false,
    };
    pair.game = game;
    partnerPair.game = game;

    const [selfProfile, partnerProfile] = await Promise.all([
      visibleProfileFor(socket),
      visibleProfileFor(partnerSocket),
    ]);

    // The pair can vanish, or get replaced by a brand new one, while those
    // profile reads are in flight - disconnect, "next", partner leaving.
    // Re-check the live entry and that it's still this exact game before
    // touching anything else.
    let current = chatPairs[socket.id];
    if (!current || current.game !== game) return;

    game.interests = sharedInterests(
      (selfProfile && selfProfile.interests) || [],
      (partnerProfile && partnerProfile.interests) || []
    );

    const statements = await generateStatements(game.tier, game.interests);

    // Second await, second window for the pair to disappear underneath us.
    current = chatPairs[socket.id];
    if (!current || current.game !== game) return;

    if (statements.length === 0) {
      io.to(current.room).emit("gameOver", { reason: "no-questions" });
      // Clear the reservation so a retry via gameStart isn't blocked forever
      // by a game that never got off the ground.
      delete current.game;
      const stillPartnerPair = chatPairs[current.partner];
      if (stillPartnerPair) delete stillPartnerPair.game;
      return;
    }

    game.statements = statements;
    game.current = game.statements.shift();

    io.to(current.room).emit("gameStatement", {
      statement: game.current,
      tier: game.tier,
      completedRounds: game.completedRounds,
    });
  });

  socket.on("gameAnswer", (payload) => {
    const pair = chatPairs[socket.id];
    if (!pair || !pair.game || !pair.game.current) return;

    const answer = payload && payload.answer;
    if (answer !== "have" && answer !== "never") return;

    const game = pair.game;
    if (Object.prototype.hasOwnProperty.call(game.answers, socket.id)) return; // first answer wins

    game.answers[socket.id] = answer;

    const partnerId = pair.partner;
    if (partnerId) io.to(partnerId).emit("gameAnswered", {});

    if (partnerId && Object.prototype.hasOwnProperty.call(game.answers, partnerId)) {
      game.completedRounds += 1;

      // Computed per socket rather than sent as one shared payload, so
      // neither side's message ever needs to carry the other's socket id.
      socket.emit("gameReveal", {
        answers: { you: game.answers[socket.id], them: game.answers[partnerId] },
      });
      io.to(partnerId).emit("gameReveal", {
        answers: { you: game.answers[partnerId], them: game.answers[socket.id] },
      });
    }
  });

  socket.on("gameNext", async () => {
    const pair = chatPairs[socket.id];
    if (!pair || !pair.game) return;
    const game = pair.game;
    const partnerId = pair.partner;
    if (!partnerId) return;

    // Both players must have answered the statement on screen - otherwise
    // one person could keep clicking through the deck alone.
    if (
      !Object.prototype.hasOwnProperty.call(game.answers, socket.id) ||
      !Object.prototype.hasOwnProperty.call(game.answers, partnerId)
    ) {
      return;
    }

    game.answers = {};

    const nextTier = tierForRound(game.completedRounds);
    if (nextTier !== game.tier) {
      game.tier = nextTier;
      if (game.nextBatch) {
        game.statements = game.nextBatch;
        game.nextBatch = null;
      } else {
        const fresh = await generateStatements(game.tier, game.interests);

        // The pair, or this exact game, can be gone by the time Groq answers
        // - re-check identity before mutating or emitting into it.
        const afterGenerate = chatPairs[socket.id];
        if (!afterGenerate || afterGenerate.game !== game) return;

        if (fresh.length === 0) {
          io.to(afterGenerate.room).emit("gameOver", { reason: "no-questions" });
          delete afterGenerate.game;
          const partnerPair = chatPairs[afterGenerate.partner];
          if (partnerPair) delete partnerPair.game;
          return;
        }
        game.statements = fresh;
      }
    }

    // No await happens above in the common case (tier unchanged, or a
    // pre-fetched batch was ready), but re-check anyway rather than branch on
    // which path was taken - it costs nothing when nothing changed underneath.
    const current = chatPairs[socket.id];
    if (!current || current.game !== game) return;

    game.current = game.statements.shift() || null;

    // Predict whether the round after this one crosses into a new tier and,
    // if so, get ahead of it now instead of making a future tier swap block
    // on Groq. Deliberately not awaited - hiding that latency behind the
    // round the players are looking at right now is the entire point.
    // Guarded by "prefetching" so a low remaining count doesn't fire this on
    // every single gameNext while the batch is still in flight.
    const upcomingTier = tierForRound(game.completedRounds + 1);
    if (
      game.statements.length < 2 &&
      upcomingTier !== game.tier &&
      !game.nextBatch &&
      !game.prefetching
    ) {
      game.prefetching = true;
      generateStatements(upcomingTier, game.interests)
        .then((batch) => {
          game.prefetching = false;
          // Only store it if this exact game is still the live one - a torn
          // down pair has nothing left to hand the batch to.
          const stillCurrent = chatPairs[socket.id];
          if (stillCurrent && stillCurrent.game === game) {
            game.nextBatch = batch;
          }
        })
        .catch(() => {
          game.prefetching = false;
        });
    }

    if (!game.current && !game.nextBatch) {
      io.to(current.room).emit("gameOver", { reason: "no-questions" });
      delete current.game;
      const partnerPair = chatPairs[current.partner];
      if (partnerPair) delete partnerPair.game;
      return;
    }

    io.to(current.room).emit("gameStatement", {
      statement: game.current,
      tier: game.tier,
      completedRounds: game.completedRounds,
    });
  });

  socket.on("gameEnd", () => {
    const pair = chatPairs[socket.id];
    if (!pair || !pair.game) return;

    const room = pair.room;
    const partnerPair = chatPairs[pair.partner];

    delete pair.game;
    if (partnerPair) delete partnerPair.game;

    io.to(room).emit("gameOver", { reason: "ended" });
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
    clearRelaxTimer(socket.id);
    chosenFilters.delete(socket.id);
    waitingFilters.delete(socket.id);
    waitingAttrs.delete(socket.id);

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

// One loop. There used to be two: matchUsersByVideoPreference split the queue
// into video and text-only users, then matchRemainingUsers paired whatever was
// left. WITH_VIDEO has been hardcoded true in Login.jsx since the opt-out
// checkbox was removed, so every user landed in the video bucket and
// matchRemainingUsers never ran. Two near-identical loops would mean writing
// every future pairing rule twice and keeping the copies in step.
// Bridges the socket-keyed maps to the pure predicate. A socket with no entry
// yet — its profile read has not resolved — is treated as unfiltered and
// attribute-less, which makes it matchable rather than stuck.
// Every route into the waiting queue goes through here, so nobody can be left
// waiting without a timer attached.
function enqueue(socketId) {
  // Every entry into the queue is a fresh search, so it starts from what the
  // user chose rather than from however far the last search had been widened.
  // This runs for the person who pressed next AND for the partner the server
  // requeues without them touching anything.
  const chosen = chosenFilters.get(socketId);
  if (chosen) waitingFilters.set(socketId, { ...chosen });

  if (!waitingUsers.includes(socketId)) waitingUsers.push(socketId);
  startRelaxTimer(socketId);
}

function startRelaxTimer(socketId) {
  clearRelaxTimer(socketId);
  relaxTimers.set(
    socketId,
    setTimeout(() => {
      relaxTimers.delete(socketId);

      const current = waitingFilters.get(socketId);
      // Gender is deliberately untouched: location is the preference people
      // hold weakly, and silently handing someone the gender they filtered out
      // is worse than a longer wait.
      if (!current || current.location === LOCATION_WORLDWIDE) return;

      waitingFilters.set(socketId, { ...current, location: LOCATION_WORLDWIDE });
      // Booleans meaning "this got widened", not the new filter values. The
      // widened gender value is "" — falsy — so a client testing the value
      // could never tell "gender was widened" from "gender was never set".
      io.to(socketId).emit("searchWidened", { location: true });
      matchUsers();
    }, RELAX_AFTER_MS)
  );
}

function clearRelaxTimer(socketId) {
  const timer = relaxTimers.get(socketId);
  if (timer) clearTimeout(timer);
  relaxTimers.delete(socketId);
}

function filtersAllowPair(id1, id2) {
  return canPairByFilters(
    { filter: waitingFilters.get(id1), attrs: waitingAttrs.get(id1) },
    { filter: waitingFilters.get(id2), attrs: waitingAttrs.get(id2) }
  );
}

function matchUsers() {
  let i = 0;
  while (i < waitingUsers.length - 1) {
    const user1 = waitingUsers[i];
    let matched = false;

    for (let j = i + 1; j < waitingUsers.length; j++) {
      const user2 = waitingUsers[j];
      if (!canPair(user1, user2)) continue;
      if (!filtersAllowPair(user1, user2)) continue;

      waitingUsers.splice(j, 1);
      waitingUsers.splice(i, 1);
      clearRelaxTimer(user1);
      clearRelaxTimer(user2);
      createChatPair(
        user1,
        user2,
        videoEnabledUsers.has(user1) || videoEnabledUsers.has(user2)
      );
      matched = true;
      break;
    }

    if (!matched) i++;
  }
}

// FIX 3 (cont): canPair returns false when both users are in the post-next
// cooldown window, preventing an immediate re-match of the same two people.
function canPair(id1, id2) {
  return !(nextCooldownUsers.has(id1) && nextCooldownUsers.has(id2));
}

function createChatPair(user1, user2, withVideo) {
  const socket1 = io.sockets.sockets.get(user1);
  const socket2 = io.sockets.sockets.get(user2);

  if (!socket1 || !socket2) {
    // The survivor of a partner that vanished mid-pair goes back to waiting, so
    // it needs a relax timer like any other queue entry. A plain push here left
    // it as the one way into the queue with no timer attached, which meant a
    // filtered survivor could wait indefinitely.
    if (socket1) enqueue(user1);
    if (socket2) enqueue(user2);
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

  // Each side gets the other's profile. Failure is non-fatal: a call with no
  // profile panel is fine, a call that never starts is not.
  Promise.all([visibleProfileFor(socket1), visibleProfileFor(socket2)])
    .then(([p1, p2]) => {
      if (p2) socket1.emit("partnerProfile", p2);
      if (p1) socket2.emit("partnerProfile", p1);
    })
    .catch((err) => console.error("partnerProfile emit failed:", err.message));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});