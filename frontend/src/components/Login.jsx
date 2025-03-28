import { useState, useEffect } from "react";
import "./login.css";
import { renderGoogleButton } from "../googleAuth.js";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID; // paste your actual Client ID

function Login({ onStart }) {
  const [email, setEmail] = useState("");
  const [withVideo, setWithVideo] = useState(true);

  useEffect(() => {
    renderGoogleButton("google-signin-btn", CLIENT_ID, handleGoogleResponse);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email) {
      onStart(email, withVideo);
    }
  };

  const handleGoogleResponse = (response) => {
    const jwt = response.credential;

    // Decode JWT (optional, or send it to your server for verification)
    const base64Url = jwt.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    const email = payload.email;

    if (!email.endsWith("@adgitmdelhi.ac.in")) {
      alert("Please sign in with your college email.");
      return;
    }

    onStart(email, withVideo);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Enter your college email to start</h2>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="yourname@college.edu"
              required
            />
          </div>

          <div className="checkbox-container">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={withVideo}
                onChange={() => setWithVideo(!withVideo)}
              />
              <span className="checkbox-text">Enable video chat</span>
            </label>
          </div>

          <button type="submit" className="submit-button">
            Start Chatting
          </button>

          <div className="or-separator">or</div>

          {/* Google Sign-In Button (Rendered via Google SDK) */}
          <div id="google-signin-btn" className="google-sdk-button" />
        </form>
      </div>
    </div>
  );
}

export default Login;
