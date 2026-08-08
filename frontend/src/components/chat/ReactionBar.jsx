// Must stay identical to ALLOWED_EMOJI in backend/globalchat.js — the server
// silently drops anything outside its own whitelist.
export const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

// The picker bar, revealed on hover (desktop) or tap (mobile).
export function ReactionPicker({ onReact }) {
  return (
    <div className="gc-react-bar">
      {REACTION_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="gc-react-btn"
          aria-label={`React with ${emoji}`}
          onClick={() => onReact(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// The applied-reaction count chips shown under a bubble.
export function ReactionChips({ reactions, myUid, onReact }) {
  const entries = Object.entries(reactions || {}).filter(
    ([, uids]) => uids.length > 0
  );
  if (entries.length === 0) return null;

  return (
    <div className="gc-chips">
      {entries.map(([emoji, uids]) => (
        <button
          key={emoji}
          type="button"
          className={`gc-chip ${uids.includes(myUid) ? "gc-chip-mine" : ""}`}
          aria-label={`${uids.length} reacted with ${emoji}`}
          onClick={() => onReact(emoji)}
        >
          <span>{emoji}</span>
          <span className="gc-chip-count">{uids.length}</span>
        </button>
      ))}
    </div>
  );
}
