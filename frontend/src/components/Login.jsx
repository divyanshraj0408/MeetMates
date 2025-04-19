import { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./login.css";
import { renderGoogleButton } from "../googleAuth.js";
import Navbar from "./Navbar.jsx";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function Login({ onStart, setToken = () => {} }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [withVideo, setWithVideo] = useState(true);
  const [isSignup, setIsSignup] = useState(false);
  const [isImageLoginSuccess, setIsImageLoginSuccess] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatedUserId, setGeneratedUserId] = useState("");
  const [postCardPassword, setPostCardPassword] = useState("");
  const [isPostCardSignup, setIsPostCardSignup] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    renderGoogleButton("google-signin-btn", CLIENT_ID, handleGoogleResponse);
  }, []);

  const handleGoogleResponse = (response) => {
    const jwt = response.credential;
    const base64Url = jwt.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    const googleEmail = payload.email;
    onStart(googleEmail, withVideo);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    const endpoint = isSignup
      ? "http://localhost:3001/api/auth/signup"
      : "http://localhost:3001/api/auth/login";

    try {
      const res = await axios.post(
        endpoint,
        { email, password },
        { headers: { "Content-Type": "application/json" } }
      );

      const token = res.data.token || res.data?.data?.token;

      if (token) {
        localStorage.setItem("token", token);
        setToken(token);
        alert(`${isSignup ? "Signup" : "Login"} successful`);
        onStart(email, withVideo);
      } else {
        alert(res.data.msg || "Success");
      }
    } catch (err) {
      alert(
        err.response?.data?.msg || err.response?.data?.error || "Server error"
      );
    }
  };

  const handleImageLogin = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedImage(URL.createObjectURL(file));
    setLoading(true);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await axios.post(
        "http://localhost:3001/api/auth/image-login",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const userId = res.data.user_id;
      if (userId) {
        setGeneratedUserId(userId);
        setIsPostCardSignup(true);
        setIsImageLoginSuccess(true);
      } else {
        alert("User ID generation failed.");
      }
    } catch (err) {
      alert(
        "Image login failed: " +
          (err.response?.data?.message || "Unknown error")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleIDUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <Navbar />
      <div className="login-container">
        <div className="login-card">
          <h2>{isSignup ? "Signup" : "Login"} to MeetMates</h2>
          {/* Google Login */}
          <div id="google-signin-btn" className="google-sdk-button" />
          {/* Standard Login */}
          {!isImageLoginSuccess && !isPostCardSignup && (
            <>
              <div className="or-separator">OR</div>
              {!isSignup && (
                <form onSubmit={handleFormSubmit}>
                  <input
                    type="email"
                    placeholder="Enter email or user ID"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={withVideo}
                      onChange={() => setWithVideo(!withVideo)}
                    />
                    <span className="checkbox-text">Enable video chat</span>
                  </label>
                  <button type="submit" className="login-btn">
                    Continue
                  </button>
                </form>
              )}
            </>
          )}
          {/* Hidden Upload */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleImageLogin}
            style={{ display: "none" }}
          />
          {/* Image Preview */}
          {selectedImage && (
            <div style={{ marginTop: "20px", textAlign: "center" }}>
              <img
                src={selectedImage}
                alt="Selected ID"
                style={{
                  width: "100%",
                  maxHeight: "200px",
                  objectFit: "contain",
                  border: "2px solid #000",
                  borderRadius: "6px",
                }}
              />
              {loading && (
                <div className="loader" style={{ marginTop: "10px" }} />
              )}
            </div>
          )}
          {/* Generated ID flow */}
          {isPostCardSignup && (
            <div style={{ marginTop: "20px" }}>
              <h4>Your generated User ID:</h4>
              <code
                style={{
                  fontSize: "16px",
                  display: "block",
                  marginBottom: "10px",
                }}
              >
                {generatedUserId}
              </code>
              <input
                type="password"
                placeholder="Set your password"
                value={postCardPassword}
                onChange={(e) => setPostCardPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  marginBottom: "10px",
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                }}
              />
              <button
                className="submit-button"
                onClick={async () => {
                  if (postCardPassword.length < 6) {
                    alert("Password must be at least 6 characters.");
                    return;
                  }
                  try {
                    await axios.post("http://localhost:3001/api/auth/signup", {
                      email: generatedUserId,
                      password: postCardPassword,
                    });
                    alert(
                      "Signup successful. Please login using your User ID."
                    );
                    // Reset state and switch to login
                    setEmail(generatedUserId);
                    setPassword("");
                    setIsSignup(false);
                    setIsPostCardSignup(false);
                    setIsImageLoginSuccess(false);
                    setSelectedImage(null);
                    setGeneratedUserId("");
                    setPostCardPassword("");
                  } catch (err) {
                    alert(err.response?.data?.msg || "Signup failed.");
                  }
                }}
              >
                Complete Signup
              </button>
            </div>
          )}
          {/* ID Upload Trigger */}
          <div
            style={{ marginTop: "24px", display: isSignup ? "block" : "none" }}
          >
            <button className="submit-button" onClick={handleIDUploadClick}>
              Login with College ID Card
            </button>
          </div>
          <div
            onClick={() => setIsSignup(!isSignup)}
            className="toggle-link"
            style={{
              marginTop: "10px",
              cursor: "pointer",
              color: "blue",
            }}
          >
            {isSignup ? "Already registered? Login" : "New user? Signup"}
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;
