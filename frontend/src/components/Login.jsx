import { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./login.css";
import { renderGoogleButton } from "../googleAuth.js";
import Navbar from "./Navbar.jsx";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function Login({
  onStart,
  setToken = () => {},
  goBack,
  doBackDisplay,
  doLoginDisplay,
}) {
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

  const handleGoogleResponse = async (response) => {
    try {
      setLoading(true);
      
      // Send the Google JWT token to your backend for verification and user creation/login
      const res = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/auth/google-login`,
        { 
          credential: response.credential,
          withVideo: withVideo 
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const { token, user, message } = res.data;

      if (token) {
        // Store the JWT token in localStorage
        localStorage.setItem("token", token);
        setToken(token);
        
        alert(message || "Google login successful");
        
        // Use the email from the verified user data
        onStart(user.email, withVideo);
      } else {
        alert("Google login failed - no token received");
      }
    } catch (err) {
      console.error("Google login error:", err);
      alert(
        err.response?.data?.message || 
        err.response?.data?.error || 
        "Google login failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const endpoint = isSignup
      ? `${import.meta.env.VITE_BACKEND_URL}/api/auth/signup`
      : `${import.meta.env.VITE_BACKEND_URL}/api/auth/login`;

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
    } finally {
      setLoading(false);
    }
  };

  const handleImageLogin = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);

    const img = new Image();
    const reader = new FileReader();

    reader.onload = function (event) {
      img.src = event.target.result;
    };

    img.onload = async function () {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert to grayscale
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg; // Red
        data[i + 1] = avg; // Green
        data[i + 2] = avg; // Blue
        // Alpha (data[i + 3]) remains unchanged
      }

      ctx.putImageData(imageData, 0, 0);

      // Convert canvas to Blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert("Failed to convert image.");
          setLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append("image", blob, "converted-id.png");

        setSelectedImage(canvas.toDataURL("image/png")); // Preview
        try {
            const res = await axios.post(
            `${import.meta.env.VITE_BACKEND_URL}/api/auth/image-login`,
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
      }, "image/png");
    };

    reader.readAsDataURL(file);
  };

  const handleIDUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCompleteSignup = async () => {
    if (postCardPassword.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    
    setLoading(true);
    
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/auth/signup`,
        {
          email: generatedUserId,
          password: postCardPassword,
        }
      );
      
      const token = res.data.token;
      
      if (token) {
        localStorage.setItem("token", token);
        setToken(token);
        alert("Signup successful! You are now logged in.");
        onStart(generatedUserId, withVideo);
      } else {
        alert("Signup successful. Please login using your User ID.");
        // Reset state and switch to login
        setEmail(generatedUserId);
        setPassword("");
        setIsSignup(false);
        setIsPostCardSignup(false);
        setIsImageLoginSuccess(false);
        setSelectedImage(null);
        setGeneratedUserId("");
        setPostCardPassword("");
      }
    } catch (err) {
      alert(err.response?.data?.msg || "Signup failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar
        goBack={goBack}
        doBackDisplay={doBackDisplay}
        doLoginDisplay={doLoginDisplay}
      />
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>{isSignup ? "Come Join" : "Welcome Back to"} the party!</h1>
            <h2>{isSignup ? "Sign up" : "Login"} to your Pingo account</h2>
          </div>
          
          {/* Google Login */}
          <div id="google-signin-btn" className="google-sdk-button"/>
          {loading && <div className="loader" style={{ marginTop: "10px" }} />}
          
          {/* Standard Login */}
          {!isImageLoginSuccess && !isPostCardSignup && (
            <>
              <div className="or-separator">OR</div>
              {!isSignup ? (
                <p className="cta-text" style={{ marginBottom: "20px" }}>
                  Login using your College email
                </p>
              ) : (
                <p className="cta-text" style={{ marginBottom: "20px" }}>
                  Drop your College ID Card
                </p>
              )}
              {!isSignup && (
                <form onSubmit={handleFormSubmit}>
                  <input
                    type="email"
                    placeholder="Enter email or user ID"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={withVideo}
                      onChange={() => setWithVideo(!withVideo)}
                      disabled={loading}
                    />
                    <span className="checkbox-text">Enable video chat</span>
                  </label>
                  <button
                  
                    type="submit"
                    className="login-btn submit-button"
                    disabled={loading}
                    style={{width: "100%",outline: "none",border:"none"}}
                  >
                    {loading ? "Logging in..." : "Continue"}
                  </button>
                </form>
              )}
            </>
          )}
          
          {isSignup && !selectedImage && (
            <>
              <div
                className="drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (loading) return;
                  
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    const fakeEvent = { target: { files: [file] } };
                    handleImageLogin(fakeEvent);
                  } else {
                    alert("Please drop a valid image file.");
                  }
                }}
                style={{
                  border: "2px dashed #649BFF",
                  padding: "20px",
                  borderRadius: "20px",
                  height: "173px",
                  textAlign: "center",
                  color: "#666",
                  backgroundColor: "#ffffff",
                  backgroundImage: "url('pics/draganddrop.png')",
                  backgroundSize: "initial",
                  backgroundRepeat: "no-repeat",
                  marginBottom: "20px",
                  opacity: loading ? 0.5 : 1,
                  pointerEvents: loading ? "none" : "auto",
                }}
              >
                <p>
                  Drag & drop your ID Card or click button below to browse files
                </p>
                <p>(Only .pdf or .png files supported )</p>
              </div>
              <div
                onClick={handleIDUploadClick}
                className="submit-button"
                style={{
                  textAlign: "center",
                  marginBottom: "10px",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? "Processing..." : "Upload College ID Card (Click or Drag Below)"}
              </div>
            </>
          )}

          {/* Hidden Upload */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleImageLogin}
            style={{ display: "none" }}
            disabled={loading}
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
                disabled={loading}
              />
              <button
                className="submit-button login-btn"
                onClick={handleCompleteSignup}
                disabled={loading}
                style={{ width: "100%", outline: "none",border:"none" }}
              >
                {loading ? "Creating Account..." : "Complete Signup"}
              </button>
            </div>
          )}
          
          <div
            onClick={() => !loading && setIsSignup(!isSignup)}
            className="toggle-link"
            style={{
              marginTop: "10px",
              cursor: loading ? "not-allowed" : "pointer",
              color: "blue",
              opacity: loading ? 0.5 : 1,
            }}
          >
            <p style={{ fontFamily: `"Rethink Sans", sans-serif` }}>
              {isSignup ? "Already registered? Login" : "New user? Signup"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;