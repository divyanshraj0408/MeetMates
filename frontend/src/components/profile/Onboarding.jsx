import { useState } from "react";
import axios from "axios";
import ProfileForm from "./ProfileForm.jsx";
import { EMOJI_BASE } from "../../interests.js";
import "./profile.css";

// The 18+ box is the only thing that blocks progress. Everything else is
// skippable: a long form on first use costs users, and a half-filled profile
// still matches better than an empty one.
function Onboarding({ onDone }) {
  const [isAdult, setIsAdult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (fields) => {
    if (!isAdult) {
      setError("Please confirm you are 18 or over.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await axios.put(
        `${import.meta.env.VITE_BACKEND_URL}/api/profile`,
        { ...fields, confirmAdult: true },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const skip = () => save({});

  return (
    <div className="pf-page">
      <div className="pf-card">
        <h1 className="pf-title">
          Tell us a bit about you
          <img className="pf-emoji-lg" src={`${EMOJI_BASE}/sparkles_2728.png`} alt="" />
        </h1>
        <p className="pf-sub">
          This is what your match sees. Your name, email and photo never are.
        </p>

        <label className="pf-adult">
          <input
            type="checkbox"
            checked={isAdult}
            onChange={() => setIsAdult((on) => !on)}
          />
          <span>I confirm I am 18 or over</span>
        </label>

        <ProfileForm
          onSave={save}
          saving={saving}
          error={error}
          submitLabel="Start vibing"
        />

        <button type="button" className="pf-skip" onClick={skip} disabled={saving}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

export default Onboarding;
