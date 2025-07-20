import React, { useEffect, useRef } from "react";
import "./startpage.css";
// import { LogOut } from "lucide-react";

function StartPage({ onStartChat, onLogout, onlineUserCount,loading }) {
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
        <button
          className="cta-btn"
          onClick={onLogout}
        >
          Log Out
        </button>
      </header>

      <div className="content">
        {/* Left Section */}
        <div className="left-box">
          <p className="status" style={{display: 'flex', alignItems: 'center'}}>
            <img src="https://em-content.zobj.net/source/apple/419/large-green-circle_1f7e2.png" alt="🟢" style={{ width: "20px", marginRight: "8px" }} /> {onlineUserCount} making sure she’s ok
          </p>

          <div className="filters">
            <div className="filter" style={{display: 'flex', alignItems: 'center'}}>
              <img src="https://em-content.zobj.net/source/apple/419/man_1f468.png" alt="" style={{ width: "20px" }} />
              <img src="https://em-content.zobj.net/source/apple/419/woman-red-hair_1f469-200d-1f9b0.png" alt="" style={{ width: "20px" , marginRight: "8px"}} /> Anybody
            </div>
            <div className="filter" style={{display: 'flex', alignItems: 'center'}}>
              <img src="https://em-content.zobj.net/source/apple/419/globe-showing-asia-australia_1f30f.png" alt="" style={{ width: "20px", marginRight: "8px" }} /> 
              <p style={{ margin: 0 }}>Worldwide</p>
            </div>
          </div>

          <button className="vibe-btn" onClick={onStartChat} disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading ? <div className="loader" /> : <>Lets Vibe <img src="https://em-content.zobj.net/source/apple/419/high-voltage_26a1.png" style={{ width: "20px",marginLeft:"8px" }} alt="vibe" /></>}
          </button>
        </div> 
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
