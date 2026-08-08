import { useEffect, useRef, useState } from "react";
import MessageRow from "./MessageRow";
import { groupMessages } from "./groupMessages";
import "./globalchat.css";

const NEAR_BOTTOM_PX = 80;
const TYPING_THROTTLE_MS = 2000;

function typingLabel(names) {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

function GlobalChat({
  messages = [],
  myUid,
  typingNames = [],
  onSend,
  onReact,
  onTyping,
}) {
  const [input, setInput] = useState("");
  const listRef = useRef(null);
  const lastTypingSentAt = useRef(0);

  // Autoscroll only when the reader is already at the bottom. Writing to
  // scrollTop keeps the scroll inside this element — scrollIntoView would drag
  // the whole window with it.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (distance < NEAR_BOTTOM_PX + 200) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, typingNames]);

  const submit = (event) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
    onTyping(false);
    lastTypingSentAt.current = 0;
    // A sent message is always meant to be seen.
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  };

  const handleChange = (event) => {
    const value = event.target.value;
    setInput(value);

    if (!value.trim()) {
      onTyping(false);
      lastTypingSentAt.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentAt.current > TYPING_THROTTLE_MS) {
      lastTypingSentAt.current = now;
      onTyping(true);
    }
  };

  const groups = groupMessages(messages, (m) => m.uid);
  const label = typingLabel(typingNames);

  return (
    <div className="gc-root">
      <div className="gc-list" ref={listRef}>
        {groups.length === 0 ? (
          <p className="gc-empty">No messages yet. Say hi 👋</p>
        ) : (
          groups.map((group) => {
            const isOwn = group.authorKey === myUid;
            return (
              <div
                key={group.key}
                className={`gc-group ${isOwn ? "gc-group-own" : ""}`}
              >
                {!isOwn && <span className="gc-name">{group.name}</span>}
                {group.messages.map((message, index) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    isOwn={isOwn}
                    isLast={index === group.messages.length - 1}
                    myUid={myUid}
                    onReact={onReact}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="gc-typing" aria-live="polite">
        {label}
      </div>

      <form className="gc-form" onSubmit={submit}>
        <textarea
          className="gc-input"
          placeholder="Type a message..."
          value={input}
          onChange={handleChange}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) submit(event);
          }}
        />
        <button type="submit" className="gc-send" disabled={!input.trim()}>
          Shoot
        </button>
      </form>
    </div>
  );
}

export default GlobalChat;
