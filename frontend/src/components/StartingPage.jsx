import React, { useEffect, useRef, useState } from "react";
import GlobalChat from "./globalchat/GlobalChat";
import "./startpage.css";

function StartPage({
  onStartChat,
  onLogout,
  onlineUserCount,
  loading,
  globalMessages = [],
  myUid,
  typingNames = [],
  onSendGlobal,
  onReactGlobal,
  onTypingGlobal,
}) {
  const videoRef = useRef(null);
  // Mobile only: the right box shows one pane at a time. Desktop shows both.
  const [mobileTab, setMobileTab] = useState("chat");

  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false, // only video preview
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Could not access webcam:", error);
      }
    };

    getMedia();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="startpage">
      <header className="navbar">
        <p className="logo">pingo</p>
        <button className="cta-btn" onClick={onLogout}>
          Log Out
        </button>
      </header>

      <div className="content">
        {/* Left Section */}
        <div className="left-box">
          <p
            className="status"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <img
              src="https://em-content.zobj.net/source/apple/419/sneezing-face_1f927.png"
              alt="🟢"
              style={{ width: "20px", marginRight: "8px" }}
            />{" "}
            {onlineUserCount} making sure she’s ok.
          </p>

          <div className="filters">
            <div className="filter" style={{ display: "flex", alignItems: "center" }}>
              <img
                src="https://em-content.zobj.net/source/apple/419/man_1f468.png"
                alt=""
                style={{ width: "20px" }}
              />
              <img
                src="https://em-content.zobj.net/source/apple/419/woman-red-hair_1f469-200d-1f9b0.png"
                alt=""
                style={{ width: "20px", marginRight: "8px" }}
              />{" "}
              Anybody
            </div>
            <div className="filter" style={{ display: "flex", alignItems: "center" }}>
              <img
                src="https://em-content.zobj.net/source/apple/419/globe-showing-asia-australia_1f30f.png"
                alt=""
                style={{ width: "20px", marginRight: "8px" }}
              />
              <p style={{ margin: 0 }}>Worldwide</p>
            </div>
          </div>

          <button
            className="vibe-btn"
            onClick={onStartChat}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {loading ? (
              <div className="loader" />
            ) : (
              <>
                Lets Vibe{" "}
                <img
                  src="https://em-content.zobj.net/source/apple/419/high-voltage_26a1.png"
                  style={{ width: "20px", marginLeft: "8px" }}
                  alt="vibe"
                />
              </>
            )}
          </button>
        </div>

        <div className="right-box">
          <div className="pane-tabs">
            <button
              type="button"
              className={`pane-tab ${mobileTab === "preview" ? "pane-tab-active" : ""}`}
              onClick={() => setMobileTab("preview")}
            >
              Preview
            </button>
            <button
              type="button"
              className={`pane-tab ${mobileTab === "chat" ? "pane-tab-active" : ""}`}
              onClick={() => setMobileTab("chat")}
            >
              Chat
            </button>
          </div>

          <div className={`pane pane-preview ${mobileTab === "preview" ? "pane-active" : ""}`}>
            <div className="video-preview">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  maxWidth: "100%",
                  borderRadius: "10px",
                  minHeight: "100%",
                }}
              />
            </div>
          </div>

          <div className={`pane pane-chat ${mobileTab === "chat" ? "pane-active" : ""}`}>
            <GlobalChat
              messages={globalMessages}
              myUid={myUid}
              typingNames={typingNames}
              onSend={onSendGlobal}
              onReact={onReactGlobal}
              onTyping={onTypingGlobal}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default StartPage;
