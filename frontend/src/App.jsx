import { useState, useEffect } from "react";
import HomePage from "./components/HomePage";
import Login from "./components/Login";
import WaitingRoom from "./components/WaitingRoom";
import ChatRoom from "./components/ChatRoom";
import socket from "./Socket";
import "./App.css";

function App() {
  const [currentScreen, setCurrentScreen] = useState("home");
  const [messages, setMessages] = useState([]);
  const [mediaPermission, setMediaPermission] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);

  useEffect(() => {
    // Socket event listeners for chat functionality
    socket.on("waiting", () => {
      setCurrentScreen("waiting");
    });

    socket.on("chatStart", () => {
      setCurrentScreen("chat");
      setMessages([
        {
          text: "You are now connected! Say hello!",
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

      // Wait a moment before switching back to waiting
      setTimeout(() => {
        setCurrentScreen("waiting");
        socket.emit("findChat", localStorage.getItem("collegeEmail"));
      }, 2000);
    });

    socket.on("error", (message) => {
      alert(message);
      setCurrentScreen("login");
    });

    // Clean up listeners on unmount
    return () => {
      socket.off("waiting");
      socket.off("chatStart");
      socket.off("message");
      socket.off("partnerLeft");
      socket.off("error");
    };
  }, []);

  const handleStartChat = async (email, withVideo) => {
    // Save email in localStorage for reconnections
    localStorage.setItem("collegeEmail", email);

    // Check for media permissions if video is enabled
    if (withVideo) {
      try {
        // Request camera and microphone permissions
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

    // Connect socket and find chat
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
  };

  const toggleVideo = () => {
    setVideoEnabled((prev) => !prev);
  };

  // Render the appropriate screen
  const renderScreen = () => {
    switch (currentScreen) {
      case "home":
        return <HomePage onGoToLogin={() => setCurrentScreen("login")} />;
      case "login":
        return <Login onStart={handleStartChat} />;
      case "waiting":
        return <WaitingRoom />;
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
