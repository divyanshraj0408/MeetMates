import { useEffect, useState } from "react";
import "./nhie.css";

// Escalation order the tier dots walk through. Index against this list, not
// against whatever order the backend happens to emit tiers in.
const TIERS = ["playful", "cheeky", "flirty", "suggestive"];

/**
 * The "never have i ever" card. Purely a socket mirror + renderer: it owns no
 * game logic, just the five states the contract can put a round into.
 */
function NeverHaveIEver({ socket, onClose }) {
  const [loading, setLoading] = useState(true);
  const [statement, setStatement] = useState(null); // { statement, tier, completedRounds }
  const [myAnswer, setMyAnswer] = useState(null); // "have" | "never" | null
  const [theyAnswered, setTheyAnswered] = useState(false);
  const [reveal, setReveal] = useState(null); // { you, them }

  useEffect(() => {
    const handleStatement = (data) => {
      setStatement(data);
      setMyAnswer(null);
      setTheyAnswered(false);
      setReveal(null);
      setLoading(false);
    };

    const handleAnswered = () => {
      setTheyAnswered(true);
    };

    const handleReveal = (data) => {
      setReveal(data.answers);
    };

    const handleOver = () => {
      onClose();
    };

    socket.on("gameStatement", handleStatement);
    socket.on("gameAnswered", handleAnswered);
    socket.on("gameReveal", handleReveal);
    socket.on("gameOver", handleOver);

    return () => {
      socket.off("gameStatement", handleStatement);
      socket.off("gameAnswered", handleAnswered);
      socket.off("gameReveal", handleReveal);
      socket.off("gameOver", handleOver);
    };
  }, [socket, onClose]);

  const answer = (choice) => {
    // A statement must be showing, no answer already sent, and no reveal
    // already in — guards both the double-submit and the post-reveal click.
    if (!statement || myAnswer || reveal) return;
    setMyAnswer(choice);
    socket.emit("gameAnswer", { answer: choice });
  };

  const next = () => {
    // reveal is only non-null once both answers are in, so this can only
    // fire from the reveal screen — there is no path to gameNext before it.
    if (!reveal) return;
    setLoading(true);
    setStatement(null);
    setMyAnswer(null);
    setTheyAnswered(false);
    setReveal(null);
    socket.emit("gameNext");
  };

  const close = () => {
    socket.emit("gameEnd");
    onClose();
  };

  const tierIndex = statement ? TIERS.indexOf(statement.tier) : -1;

  return (
    <div className="nhie-card">
      <div className="nhie-head">
        <div className="nhie-tier-dots">
          {TIERS.map((t, i) => (
            <span
              key={t}
              className={`nhie-tier-dot ${i <= tierIndex ? "nhie-tier-dot-on" : ""}`}
            />
          ))}
        </div>
        {statement && <span className="nhie-tier-label">{statement.tier}</span>}
        <button
          type="button"
          className="nhie-close"
          onClick={close}
          aria-label="close never have i ever"
        >
          ✕
        </button>
      </div>

      {loading && (
        <div className="nhie-loading">
          <span className="nhie-spinner" aria-hidden="true" />
          <p className="nhie-loading-text">thinking of something...</p>
        </div>
      )}

      {!loading && statement && (
        <div className="nhie-body">
          <p className="nhie-statement">{statement.statement}</p>

          {!reveal ? (
            <>
              <div className="nhie-choices">
                <button
                  type="button"
                  className={`nhie-choice nhie-choice-have ${
                    myAnswer === "have" ? "nhie-choice-picked" : ""
                  }`}
                  onClick={() => answer("have")}
                  disabled={!!myAnswer}
                >
                  i have
                </button>
                <button
                  type="button"
                  className={`nhie-choice nhie-choice-never ${
                    myAnswer === "never" ? "nhie-choice-picked" : ""
                  }`}
                  onClick={() => answer("never")}
                  disabled={!!myAnswer}
                >
                  never
                </button>
              </div>
              {myAnswer && (
                <p className="nhie-hint">
                  {theyAnswered ? "they've answered" : "waiting for them..."}
                </p>
              )}
            </>
          ) : (
            <div className="nhie-reveal">
              <div className="nhie-reveal-row">
                <span className="nhie-reveal-who">you</span>
                <span className={`nhie-reveal-pill nhie-reveal-${reveal.you}`}>
                  {reveal.you === "have" ? "i have" : "never"}
                </span>
              </div>
              <div className="nhie-reveal-row">
                <span className="nhie-reveal-who">them</span>
                <span className={`nhie-reveal-pill nhie-reveal-${reveal.them}`}>
                  {reveal.them === "have" ? "i have" : "never"}
                </span>
              </div>
              <button type="button" className="nhie-next" onClick={next}>
                next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NeverHaveIEver;
