import { useState } from "react";
import Avatar from "./Avatar";
import { ReactionPicker, ReactionChips } from "./ReactionBar";

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// One message. `isLast` marks the final message of a group — that row carries
// the avatar and the timestamp; earlier rows reserve the avatar's width so the
// bubbles stay aligned.
function MessageRow({ message, isOwn, isLast, myKey, showIdentity = true, onReact }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const status = message.status;

  return (
    <div
      className={`gc-row ${isOwn ? "gc-row-own" : ""}`}
      onMouseEnter={() => setPickerOpen(true)}
      onMouseLeave={() => setPickerOpen(false)}
    >
      {showIdentity && (
        <div className="gc-avatar-slot">
          {isLast ? <Avatar uid={message.uid} name={message.name} /> : null}
        </div>
      )}

      <div className="gc-body">
        <div className="gc-bubble-wrap">
          {pickerOpen && status !== "blocked" ? (
            <ReactionPicker onReact={(emoji) => onReact(message.id, emoji)} />
          ) : null}

          <button
            type="button"
            className={`gc-bubble ${isOwn ? "gc-bubble-own" : ""} ${
              status === "sending" ? "gc-bubble-pending" : ""
            } ${status === "blocked" ? "gc-bubble-blocked" : ""}`}
            onClick={() => setPickerOpen((open) => !open)}
          >
            {message.text}
          </button>
        </div>

        <ReactionChips
          reactions={message.reactions}
          myUid={myKey}
          onReact={(emoji) => onReact(message.id, emoji)}
        />

        {(isLast || status) && (
          <div className="gc-meta">
            {status === "sending" && <span>Sending…</span>}
            {status === "delivered" && isOwn && isLast && <span>Delivered</span>}
            {status === "blocked" && (
              <span className="gc-meta-blocked">
                {message.blockReason || "Blocked"}
              </span>
            )}
            {isLast && status !== "sending" && (
              <span className="gc-time">{formatTime(message.timestamp)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageRow;
