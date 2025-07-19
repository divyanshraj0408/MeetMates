import { useState, useRef, useEffect } from "react";
import VideoChat from "./VideoChat";
import "./chatroom.css";

function ChatRoom({
  messages,
  onSendMessage,
  onNext,
  videoEnabled,
  toggleVideo,
  socketId,
  onLogout,
  endCall
}) {
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage("");
    }
  };

  return (
    <div className={`chat-container ${videoEnabled ? "with-video" : ""}`}>
      <div className="chat-header">
        <p className="logo">Pingo</p>
        {/* <button onClick={onNext} className="next-button">
          Next
        </button> */}
        <button
          className="cta-btn"
          onClick={onLogout}
        >
          Log Out
        </button>
      </div>

      <div className="chat-body">
        {videoEnabled && (
          <div>
            <VideoChat socketId={socketId} toggleVideo={toggleVideo} messages={messages} onSendMessage={onSendMessage} endCall={endCall} onNext={onNext}/>
          </div>
        )}


      </div>
    </div>
  );
}

export default ChatRoom;
