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
        <h2>You're now chatting with a student</h2>
        <button onClick={onNext} className="next-button">
          Next
        </button>
      </div>

      <div className="chat-body">
        {videoEnabled && (
          <div>
            <VideoChat socketId={socketId} toggleVideo={toggleVideo} />
            <div className="text-chat-section">
              <div className="messages-container">
                {messages.map((msg, index) => (
                  <div key={index} className={`message ${msg.type}-message`}>
                    {msg.text}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSubmit} className="message-form">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                <button type="submit">Send</button>
              </form>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}

export default ChatRoom;
