import { useState, useEffect, useRef } from "react";
import HomePage from "./components/HomePage";
import Login from "./components/Login";
import StartPage from "./components/StartingPage";
import WaitingRoom from "./components/WaitingRoom";
import ChatRoom from "./components/ChatRoom";
import socket from "./Socket";
import "./App.css";

function App() {
  const [currentScreen, setCurrentScreen] = useState("home");
  const [messages, setMessages] = useState([]);
  const [mediaPermission, setMediaPermission] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [onlineUserCount, setOnlineUserCount] = useState(0);
  const [currentPartnerId, setCurrentPartnerId] = useState(null);
  const [isVideoChat, setIsVideoChat] = useState(false);
  const [globalMessages, setGlobalMessages] = useState([]);
  const [globalBlockNotice, setGlobalBlockNotice] = useState(null);

  // FIX: Track when the user intentionally ends the call so that the
  // partnerLeft handler doesn't auto-rejoin them into matchmaking.
  const userLeftIntentionally = useRef(false);

  useEffect(() => {
    const checkTokenAndAutoLogin = async () => {
      const token = localStorage.getItem("token");
      const email = localStorage.getItem("collegeEmail");
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
          type: "system",
          text: "Connected to chat partner",
        },
      ]);
      socket.emit("ready-to-connect");
    });

    socket.on("message", (data) => {
      const messageType = data.sender === socket.id ? "user" : "partner";
      setMessages((prev) => [...prev, { text: data.text, type: messageType }]);
    });

    socket.on("globalHistory", (history) => {
      setGlobalMessages(Array.isArray(history) ? history : []);
    });

    socket.on("globalMessage", (msg) => {
      setGlobalMessages((prev) => [...prev, msg]);
    });

    socket.on("globalMessageBlocked", (data) => {
      setGlobalBlockNotice(data?.reason || "Message blocked.");
    });

    socket.on("partnerLeft", (data) => {
      console.log("Partner left:", data);
      setMessages((prev) => [
        ...prev,
        {
          text: "Your chat partner disconnected. Finding a new user...",
          type: "system",
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
            localStorage.getItem("collegeEmail"),
            localStorage.getItem("withVideo") === "true"
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
      socket.off("partnerLeft");
      socket.off("error");
      socket.off("globalHistory");
      socket.off("globalMessage");
      socket.off("globalMessageBlocked");
    };
  }, []);

  const handleStartChat = async (email, withVideo) => {
    localStorage.setItem("collegeEmail", email);
    localStorage.setItem("withVideo", withVideo);

    const token = localStorage.getItem("token");
    if (token) {
      socket.auth = { token };
    }

    if (withVideo) {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setMediaPermission(true);
        setVideoEnabled(true);
      } catch (err) {
        alert(
          "Camera or microphone permission denied. Chat will continue without video."
        );
        setMediaPermission(false);
        setVideoEnabled(false);
      }
    } else {
      setVideoEnabled(false);
    }

    if (!socket.connected) {
      socket.connect();
    }
    socket.emit("findChat", email, withVideo);
    setCurrentScreen("waiting");
  };

  const handleSendMessage = (message) => {
    if (message.trim()) {
      socket.emit("sendMessage", message);
    }
  };

  const handleSendGlobal = (message) => {
    if (message.trim()) {
      setGlobalBlockNotice(null);
      socket.emit("globalMessage", message);
    }
  };

  const handleNextChat = () => {
    setMessages([]);
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
              localStorage.setItem("collegeEmail", email);
              localStorage.setItem("withVideo", withVideo);
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
            onStartChat={() =>
              handleStartChat(
                localStorage.getItem("collegeEmail"),
                localStorage.getItem("withVideo") === "true"
              )
            }
            goBack={() => setCurrentScreen("home")}
            onLogout={logout}
            onlineUserCount={onlineUserCount}
            globalMessages={globalMessages}
            onSendGlobal={handleSendGlobal}
            globalBlockNotice={globalBlockNotice}
          />
        );

      case "waiting":
        return (
          <StartPage
            onStartChat={() =>
              handleStartChat(
                localStorage.getItem("collegeEmail"),
                localStorage.getItem("withVideo") === "true"
              )
            }
            goBack={() => setCurrentScreen("home")}
            logout={logout}
            onlineUserCount={onlineUserCount}
            loading={true}
            globalMessages={globalMessages}
            onSendGlobal={handleSendGlobal}
            globalBlockNotice={globalBlockNotice}
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