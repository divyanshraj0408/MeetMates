import { useState, useEffect } from "react";
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

  useEffect(() => {
    // Auto-login and token verification
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
            setCurrentScreen("start"); // 👉 Go to StartPage after login
          } else {
            localStorage.clear();
          }
        } catch (err) {
          console.error("Token check failed:", err);
        }
      }
    };

    checkTokenAndAutoLogin();

    // Socket event listeners

    socket.on("onlineUsers", (count) => {
      console.log("Online users count:", count);
      setOnlineUserCount(count);
    });

    socket.on("waiting", () => {
      setCurrentScreen("waiting");
    });

    socket.on("chatStart", () => {
      setCurrentScreen("chat");
      setMessages([
        {
          type: "system",
        },
      ]);
    });

    socket.on("message", (data) => {
      const messageType = data.sender === socket.id ? "user" : "partner";
      setMessages((prev) => [...prev, { text: data.text, type: messageType }]);
    });

    socket.on("partnerLeft", () => {
      setMessages((prev) => [
        ...prev,
        {
          text: "Your chat partner disconnected.",
          type: "system",
        },
      ]);

      // Wait before returning to start page
      setTimeout(() => {
        setCurrentScreen("start");
      }, 2000);
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
        alert("Camera or microphone permission denied. Chat will continue without video.");
        setMediaPermission(false);
        setVideoEnabled(false);
      }
    } else {
      setVideoEnabled(false);
    }

    socket.connect();
    socket.emit("findChat", email, withVideo);
    setCurrentScreen("waiting");
  };

  const handleSendMessage = (message) => {
    if (message.trim()) {
      socket.emit("sendMessage", message);
    }
  };

  const handleNextChat = () => {
    socket.emit("next");
    setMessages([]);
    setCurrentScreen("start"); // 👉 go to StartPage instead of auto-search
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
            logout={logout}
            onlineUserCount={onlineUserCount} // ✅ This must be here!
          />
        );


      case "waiting":
        return  (
          <StartPage
            onStartChat={() =>
              handleStartChat(
                localStorage.getItem("collegeEmail"),
                localStorage.getItem("withVideo") === "true"
              )
            }
            goBack={() => setCurrentScreen("home")}
            logout={logout}
            onlineUserCount={onlineUserCount} // ✅ This must be here!
            loading={true} // Show loading spinner in StartPage

          />
        );

      case "chat":
        return (
          <ChatRoom
            messages={messages}
            onSendMessage={handleSendMessage}
            onNext={handleNextChat}
            videoEnabled={videoEnabled}
            toggleVideo={toggleVideo}
            socketId={socket.id}
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
