import { useState } from "react";
import "./login.css";
function Login({ onStart }) {
  const [email, setEmail] = useState("");
  const [withVideo, setWithVideo] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email) {
      onStart(email, withVideo);
    }
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
        </form>
      </div>
    </div>
  );
}

export default Login;
