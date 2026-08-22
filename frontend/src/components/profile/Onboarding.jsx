import { useState } from "react";
import axios from "axios";
import ProgressBar from "./ProgressBar.jsx";
import ProfilePanel from "./ProfilePanel.jsx";
import AgeField from "./fields/AgeField.jsx";
import PlaceField from "./fields/PlaceField.jsx";
import GenderField from "./fields/GenderField.jsx";
import InterestsField from "./fields/InterestsField.jsx";
import BioField from "./fields/BioField.jsx";
import { EMOJI_BASE } from "../../interests.js";
import "./profile.css";

const CONTENT_STEPS = 5;

function Onboarding({ onDone }) {
  const [step, setStep] = useState(0); // 0 = gate, 1..5 = content, 6 = done
  const [isAdult, setIsAdult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState({
    ageBand: "",
    countryCode: "",
    city: "",
    gender: "",
    interests: [],
    bio: "",
  });

  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await axios.put(
        `${import.meta.env.VITE_BACKEND_URL}/api/profile`,
        { ...profile, confirmAdult: true },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      setStep(6);
    } catch (err) {
      setError(err.response?.data?.error || "that didn't save. try again");
    } finally {
      setSaving(false);
    }
  };

  // The gate is the only screen that blocks.
  if (step === 0) {
    return (
      <div className="pf-page">
        <div className="pf-step">
          <div className="pf-progress" />
          <h1 className="pf-prompt">
            quick thing
            <br />
            first
          </h1>
          <div className="pf-step-body">
            <label className="pf-gate">
              <input
                type="checkbox"
                checked={isAdult}
                onChange={() => setIsAdult((on) => !on)}
              />
              <span>i'm 18 or over</span>
            </label>
            {error && <p className="pf-error">{error}</p>}
          </div>
          <div className="pf-step-nav">
            <button
              type="button"
              className="pf-next"
              disabled={!isAdult}
              onClick={() => setStep(1)}
            >
              next
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 6) {
    return (
      <div className="pf-page">
        <div className="pf-step">
          <div className="pf-progress" />
          <h1 className="pf-prompt">that's you</h1>
          <div className="pf-step-body">
            <ProfilePanel profile={profile} />
            <p className="pf-hint" style={{ color: "#fff", opacity: 0.9 }}>
              this is all anyone sees. you can change it any time from the lobby.
            </p>
          </div>
          <div className="pf-step-nav">
            <button type="button" className="pf-next" onClick={onDone}>
              let's go
            </button>
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    { prompt: "how old are you?", node: <AgeField value={profile.ageBand} onChange={(ageBand) => set({ ageBand })} /> },
    { prompt: "where you at?", node: <PlaceField countryCode={profile.countryCode} city={profile.city} onChange={set} /> },
    { prompt: "how do you show up?", node: <GenderField value={profile.gender} onChange={(gender) => set({ gender })} /> },
    { prompt: "what are you into?", node: <InterestsField value={profile.interests} onChange={(interests) => set({ interests })} /> },
    { prompt: "say something", node: <BioField value={profile.bio} onChange={(bio) => set({ bio })} /> },
  ];

  const current = steps[step - 1];
  const isLast = step === CONTENT_STEPS;

  return (
    <div className="pf-page">
      <div className="pf-step">
        <ProgressBar total={CONTENT_STEPS} done={step - 1} />
        <h1 className="pf-prompt">{current.prompt}</h1>
        <div className="pf-step-body">
          {current.node}
          {error && <p className="pf-error">{error}</p>}
        </div>
        <div className="pf-step-nav">
          <button type="button" className="pf-back" onClick={() => setStep(step - 1)}>
            back
          </button>
          {/* Never disabled: not answering is how you skip a step. */}
          <button
            type="button"
            className="pf-next"
            disabled={saving}
            onClick={() => (isLast ? save() : setStep(step + 1))}
          >
            {isLast ? (saving ? "locking in..." : "lock it in") : "next"}
            {isLast && !saving && (
              <img
                className="pf-emoji"
                src={`${EMOJI_BASE}/high-voltage_26a1.png`}
                alt=""
                style={{ marginLeft: 8 }}
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
