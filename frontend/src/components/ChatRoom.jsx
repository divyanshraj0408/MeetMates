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
  endCall,
  partnerTyping,
  onReactPair,
  onTypingPair,
}) {
  return (
    <div className={`chat-container ${videoEnabled ? "with-video" : ""}`}>
      <div className="chat-header">
        <p className="logo">pingo</p>
        <button className="cta-btn" onClick={onLogout}>
          Log Out
        </button>
      </div>

      <div className="chat-body">
        {videoEnabled && (
          <div>
            <VideoChat
              socketId={socketId}
              toggleVideo={toggleVideo}
              messages={messages}
              onSendMessage={onSendMessage}
              endCall={endCall}
              onNext={onNext}
              partnerTyping={partnerTyping}
              onReactPair={onReactPair}
              onTypingPair={onTypingPair}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatRoom;
