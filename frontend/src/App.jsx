import { useState, useEffect, useRef } from "react";
import HomePage from "./components/HomePage";
import Login from "./components/Login";
import StartPage from "./components/StartingPage";
import WaitingRoom from "./components/WaitingRoom";
import ChatRoom from "./components/ChatRoom";
import Onboarding from "./components/profile/Onboarding";
import EditProfile from "./components/profile/EditProfile";
import socket from "./Socket";
import "./App.css";

// The key was renamed from collegeEmail when Pingo stopped being college-only.
// Reading the old one keeps existing sessions signed in through the rename.
const EMAIL_KEY = "userEmail";
function readStoredEmail() {
  return (
    localStorage.getItem(EMAIL_KEY) ||
    localStorage.getItem("collegeEmail") ||
    ""
  );
}
function storeEmail(email) {
  localStorage.setItem(EMAIL_KEY, email);
  localStorage.removeItem("collegeEmail");
}

function App() {
  const [currentScreen, setCurrentScreen] = useState("home");
  const [messages, setMessages] = useState([]);
  const [mediaPermission, setMediaPermission] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [onlineUserCount, setOnlineUserCount] = useState(0);
  const [currentPartnerId, setCurrentPartnerId] = useState(null);
  const [isVideoChat, setIsVideoChat] = useState(false);
  const [globalMessages, setGlobalMessages] = useState([]);
  const [myUid, setMyUid] = useState(null);
  const [typingNames, setTypingNames] = useState([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerProfile, setPartnerProfile] = useState(null);
  const [searchWidened, setSearchWidened] = useState(null);

  // FIX: Track when the user intentionally ends the call so that the
  // partnerLeft handler doesn't auto-rejoin them into matchmaking.
  const userLeftIntentionally = useRef(false);

  // Remember the filters from the most recent findChat so the automatic
  // re-queue after a partner disconnect (below) can reuse them instead of
  // silently reverting the user's gender/location choice to "no filter".
  const lastFiltersRef = useRef(undefined);

  useEffect(() => {
    const checkTokenAndAutoLogin = async () => {
      const token = localStorage.getItem("token");
      const email = readStoredEmail();
      const withVideo = localStorage.getItem("withVideo") === "true";

      if (token && email) {
        try {
          const apiUrl = import.meta.env.VITE_BACKEND_URL;
          if (!apiUrl) {
            console.error("API URL is not defined.");
            localStorage.clear();
            return;
          }

          const res = await fetch(`${apiUrl}/api/verify-token`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          const data = await res.json();

          if (data.success) {
            console.log("Token is valid, auto-login...");
            socket.auth = { token };
            if (!socket.connected) {
              socket.connect();
            }
            setCurrentScreen("start");
          } else {
            localStorage.clear();
          }
        } catch (err) {
          console.error("Token check failed:", err);
        }
      }
    };

    checkTokenAndAutoLogin();

    socket.on("onlineUsers", (count) => {
      console.log("Online users count:", count);
      setOnlineUserCount(count);
    });

    socket.on("waiting", () => {
      setCurrentScreen("waiting");
      setCurrentPartnerId(null);
      setIsVideoChat(false);
      // The server puts people back in the queue who pressed nothing — when a
      // partner leaves or hits next, this fires for the person left behind. So
      // clearing the notice in the click handlers is not enough: it describes
      // the previous search, and they are now in a new one.
      setSearchWidened(null);
    });

    socket.on("chatStart", (data) => {
      const { withVideo } = data || {};
      // Reset the intentional leave flag whenever a new chat starts
      userLeftIntentionally.current = false;
      setCurrentScreen("chat");
      setIsVideoChat(withVideo);
      setCurrentPartnerId(null);
      console.log("✅ Chat started, Video:", withVideo);
      setMessages([
        {
          id: `sys-${Date.now()}`,
          sender: "__system__",
          system: true,
          text: "Connected to chat partner",
          timestamp: new Date().toISOString(),
          reactions: {},
        },
      ]);
      setPartnerTyping(false);
      setPartnerProfile(null);
      socket.emit("ready-to-connect");
    });

    socket.on("message", (msg) => {
      setMessages((prev) => {
        // Drop our own optimistic copy, then append the server's canonical one.
        const withoutOptimistic = prev.filter(
          (m) => !(m.clientId && m.clientId === msg.clientId)
        );
        return [...withoutOptimistic, { ...msg, status: "delivered" }];
      });
    });

    socket.on("pairMessageBlocked", ({ clientId, reason }) => {
      if (!clientId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId
            ? { ...m, status: "blocked", blockReason: reason }
            : m
        )
      );
    });

    socket.on("pairReaction", ({ messageId, emoji, from }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          // Both clients receive this event and apply the identical toggle, so
          // they converge without the server storing anything.
          const reactions = { ...(m.reactions || {}) };
          const list = reactions[emoji] ? [...reactions[emoji]] : [];
          const at = list.indexOf(from);
          if (at === -1) list.push(from);
          else list.splice(at, 1);
          if (list.length === 0) delete reactions[emoji];
          else reactions[emoji] = list;
          return { ...m, reactions };
        })
      );
    });

    socket.on("pairTyping", ({ typing }) => setPartnerTyping(Boolean(typing)));

    socket.on("partnerProfile", (profile) => setPartnerProfile(profile));
    socket.on("searchWidened", (what) => setSearchWidened(what));

    socket.on("globalIdentity", ({ uid }) => setMyUid(uid));

    socket.on("globalHistory", (history) => {
      const list = Array.isArray(history) ? history : [];
      setGlobalMessages((prev) => {
        // A reconnect re-sends history. Keep any message we sent that the
        // server has not acknowledged yet, so it is not silently dropped —
        // unless this snapshot already contains it.
        const acked = new Set(list.map((m) => m.clientId).filter(Boolean));
        const pending = prev.filter(
          (m) => m.status === "sending" && m.clientId && !acked.has(m.clientId)
        );
        return [...list, ...pending];
      });
    });

    socket.on("globalMessage", (msg) => {
      setGlobalMessages((prev) => {
        // Drop our own optimistic copy, then append the server's canonical one.
        const withoutOptimistic = prev.filter(
          (m) => !(m.clientId && m.clientId === msg.clientId)
        );
        const next = [...withoutOptimistic, { ...msg, status: "delivered" }];
        // Match the server's 50-message cap so a long session cannot grow the
        // list (and the DOM) without bound.
        return next.length > 50 ? next.slice(-50) : next;
      });
    });

    socket.on("globalMessageBlocked", ({ clientId, reason }) => {
      if (!clientId) return;
      setGlobalMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId
            ? { ...m, status: "blocked", blockReason: reason }
            : m
        )
      );
    });

    socket.on("globalReaction", ({ messageId, reactions }) => {
      setGlobalMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    });

    socket.on("globalTypingUsers", ({ names }) => {
      setTypingNames(Array.isArray(names) ? names : []);
    });

    socket.on("partnerLeft", (data) => {
      console.log("Partner left:", data);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          sender: "__system__",
          system: true,
          text: "Your chat partner disconnected. Finding a new user...",
          timestamp: new Date().toISOString(),
          reactions: {},
        },
      ]);

      setCurrentPartnerId(null);
      setIsVideoChat(false);

      // FIX: Only auto-rejoin matchmaking if WE didn't leave intentionally.
      // If the user clicked "End Call", userLeftIntentionally is true and we
      // stay on the start screen — we do NOT get pulled back into the queue.
      if (!userLeftIntentionally.current) {
        setTimeout(() => {
          handleStartChat(
            readStoredEmail(),
            localStorage.getItem("withVideo") === "true",
            lastFiltersRef.current
          );
        }, 2000);
      }

      // Always reset the flag after handling
      userLeftIntentionally.current = false;
    });

    socket.on("error", (message) => {
      alert(message);
      setCurrentScreen("login");
    });

    return () => {
      socket.off("onlineUsers");
      socket.off("waiting");
      socket.off("chatStart");
      socket.off("message");
      socket.off("pairMessageBlocked");
      socket.off("pairReaction");
      socket.off("pairTyping");
      socket.off("partnerProfile");
      socket.off("searchWidened");
      socket.off("partnerLeft");
      socket.off("error");
      socket.off("globalIdentity");
      socket.off("globalHistory");
      socket.off("globalMessage");
      socket.off("globalMessageBlocked");
      socket.off("globalReaction");
      socket.off("globalTypingUsers");
    };
  }, []);

  const handleStartChat = async (email, withVideo, filters) => {
    storeEmail(email);
    localStorage.setItem("withVideo", withVideo);

    const token = localStorage.getItem("token");
    if (token) {
      socket.auth = { token };
    }

    if (withVideo) {
      try {
        // This is only a permission probe — VideoChat opens its own stream on
        // mount. The tracks MUST be stopped here: leaving them live held the
        // camera and mic open for the rest of the session, so VideoChat's own
        // getUserMedia then failed on Android with NotReadableError, which this
        // catch reported as "permission denied". Desktop browsers tolerate the
        // duplicate; phones do not.
        const probe = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        probe.getTracks().forEach((track) => track.stop());
        setMediaPermission(true);
        setVideoEnabled(true);
      } catch (err) {
        // Say what actually went wrong. Every failure used to be reported as a
        // permission denial, which sent people to fix a setting that was fine.
        const reason =
          err?.name === "NotAllowedError" || err?.name === "SecurityError"
            ? "Camera and mic access was blocked. Allow it in your browser's site settings."
            : err?.name === "NotFoundError" || err?.name === "OverconstrainedError"
            ? "No camera or mic found on this device."
            : err?.name === "NotReadableError" || err?.name === "AbortError"
            ? "Your camera is already in use by another app or tab. Close it and try again."
            : `Could not start your camera (${err?.name || "unknown error"}).`;
        alert(`${reason} Chat will continue without video.`);
        console.error("getUserMedia failed:", err?.name, err?.message);
        setMediaPermission(false);
        setVideoEnabled(false);
      }
    } else {
      setVideoEnabled(false);
    }

    if (!socket.connected) {
      socket.connect();
    }
    setSearchWidened(null);
    lastFiltersRef.current = filters;
    socket.emit("findChat", email, withVideo, filters);
    setCurrentScreen("waiting");
  };

  const handleWidenSearch = () => socket.emit("widenSearch");

  const handleSendMessage = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // crypto.randomUUID is only available in a secure context; a dev server
    // reached over a LAN IP is not one, so fall back to a good-enough id.
    const clientId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setMessages((prev) => [
      ...prev,
      {
        id: `local-${clientId}`,
        clientId,
        sender: socket.id,
        text: trimmed,
        timestamp: new Date().toISOString(),
        reactions: {},
        status: "sending",
      },
    ]);

    socket.emit("sendMessage", { text: trimmed, clientId });
  };

  const handleReactPair = (messageId, emoji) => {
    socket.emit("pairReact", { messageId, emoji });
  };

  const handleTypingPair = (typing) => {
    socket.emit("pairTyping", { typing });
  };

  const handleSendGlobal = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // crypto.randomUUID is only available in a secure context; a dev server
    // reached over a LAN IP is not one, so fall back to a good-enough id.
    const clientId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = readStoredEmail();

    // Optimistic row. The server echoes clientId back, at which point this is
    // swapped for the canonical message and the status becomes "delivered".
    setGlobalMessages((prev) => [
      ...prev,
      {
        id: `local-${clientId}`,
        clientId,
        uid: myUid,
        name: email.split("@")[0],
        text: trimmed,
        timestamp: new Date().toISOString(),
        reactions: {},
        status: "sending",
      },
    ]);

    socket.emit("globalMessage", { text: trimmed, clientId });
  };

  const handleReactGlobal = (messageId, emoji) => {
    socket.emit("globalReact", { messageId, emoji });
  };

  const handleTypingGlobal = (typing) => {
    socket.emit("globalTyping", { typing });
  };

  const handleNextChat = () => {
    setMessages([]);
    setPartnerTyping(false);
    setPartnerProfile(null);
    // Describes the previous search, not the one about to start.
    setSearchWidened(null);
    setCurrentPartnerId(null);
    setIsVideoChat(false);
    socket.emit("next");
    setCurrentScreen("waiting");
  };

  const handleEndCall = () => {
    // FIX: Mark as intentional so partnerLeft doesn't auto-rejoin this user.
    userLeftIntentionally.current = true;
    // FIX: emit leaveChat (not the broken socket.emit("disconnect") no-op).
    // Server will requeue the partner but NOT this user.
    socket.emit("leaveChat");
    setCurrentScreen("start");
  };

  const toggleVideo = () => {
    setVideoEnabled((prev) => !prev);
  };

  const logout = () => {
    localStorage.clear();
    socket.disconnect();
    setCurrentScreen("login");
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case "home":
        return (
          <HomePage
            onGoToLogin={() => setCurrentScreen("login")}
            goBack={() => setCurrentScreen("home")}
            doBackDisplay="none"
            doLoginDisplay="block"
          />
        );

      case "login":
        return (
          <Login
            onStart={(email, withVideo) => {
              storeEmail(email);
              localStorage.setItem("withVideo", withVideo);
              // Login calls this inline callback, not handleStartChat, so the
              // onboarding hand-off has to happen here. Putting it in
              // handleStartChat sent new users to the lobby first and only
              // caught them when they later pressed "Lets Vibe".
              if (localStorage.getItem("needsOnboarding") === "true") {
                localStorage.removeItem("needsOnboarding");
                setCurrentScreen("onboarding");
                return;
              }
              // Connect the socket on fresh login so the global chat on the
              // start screen receives history and can send messages. Without
              // this, only auto-login users had a live socket.
              const token = localStorage.getItem("token");
              if (token) {
                socket.auth = { token };
                if (!socket.connected) {
                  socket.connect();
                }
              }
              setCurrentScreen("start");
            }}
            goBack={() => setCurrentScreen("home")}
            doBackDisplay="block"
            doLoginDisplay="none"
          />
        );

      case "start":
        return (
          <StartPage
            onStartChat={(filters) =>
              handleStartChat(
                readStoredEmail(),
                localStorage.getItem("withVideo") === "true",
                filters
              )
            }
            goBack={() => setCurrentScreen("home")}
            onLogout={logout}
            onlineUserCount={onlineUserCount}
            globalMessages={globalMessages}
            myUid={myUid}
            typingNames={typingNames}
            onSendGlobal={handleSendGlobal}
            onReactGlobal={handleReactGlobal}
            onTypingGlobal={handleTypingGlobal}
            onEditProfile={() => setCurrentScreen("editProfile")}
          />
        );

      case "waiting":
        return (
          <StartPage
            onStartChat={(filters) =>
              handleStartChat(
                readStoredEmail(),
                localStorage.getItem("withVideo") === "true",
                filters
              )
            }
            goBack={() => setCurrentScreen("home")}
            logout={logout}
            onlineUserCount={onlineUserCount}
            loading={true}
            onWidenSearch={handleWidenSearch}
            searchWidened={searchWidened}
            onLogout={logout}
            globalMessages={globalMessages}
            myUid={myUid}
            typingNames={typingNames}
            onSendGlobal={handleSendGlobal}
            onReactGlobal={handleReactGlobal}
            onTypingGlobal={handleTypingGlobal}
            onEditProfile={() => setCurrentScreen("editProfile")}
          />
        );

      case "chat":
        return (
          <ChatRoom
            messages={messages}
            onSendMessage={handleSendMessage}
            onNext={handleNextChat}
            videoEnabled={videoEnabled && isVideoChat}
            toggleVideo={toggleVideo}
            socketId={socket.id}
            onLogout={logout}
            endCall={handleEndCall}
            partnerTyping={partnerTyping}
            onReactPair={handleReactPair}
            onTypingPair={handleTypingPair}
            partnerProfile={partnerProfile}
          />
        );

      case "onboarding":
        return <Onboarding onDone={() => setCurrentScreen("start")} />;

      case "editProfile":
        return (
          <EditProfile
            onDone={() => setCurrentScreen("start")}
            onBack={() => setCurrentScreen("start")}
          />
        );

      default:
        return <HomePage />;
    }
  };

  return (
    <div className="app-container">
      <main>{renderScreen()}</main>
    </div>
  );
}

export default App;