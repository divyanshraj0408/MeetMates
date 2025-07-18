import React, { useEffect, useRef } from "react";
import "./startpage.css";

function StartPage({ onStartChat, onLogout, onlineUserCount }) {
  const videoRef = useRef(null);

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
      </header>

      <div className="content">
        {/* Left Section */}
        <div className="left-box">
          <p className="status">🟢 {onlineUserCount} making sure she’s ok</p>

          <div className="filters">
            <div className="filter"> 👨‍🦰 👩‍🦰Anybody</div>
            <div className="filter">🌍 All ADGIPS</div>
          </div>

          <button className="vibe-btn" onClick={onStartChat}>Let’s Vibe!</button>
        </div>

        {/* Right Section (actual local video preview) */}
        <div className="right-box">
          <div className="video-preview">
            <video ref={videoRef} autoPlay muted playsInline style={{ maxWidth: '100%', borderRadius: '10px', minHeight: '100%' }} />
                </div>
            <div className="text-chat-section1 globalchat-container">
              <div className="messages-container">
                Global Chat Comming soon...
              </div>
              <form className="message-form">
                <textarea
                  placeholder="Type a message..."
                />
                <button type="submit" className="send-button" disabled="true" >Shoot</button>
              </form>
            </div>
        </div>
      </div>
    </div>
  );
}

export default StartPage;
