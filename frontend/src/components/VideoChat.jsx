import { useEffect, useRef, useState } from "react";
import socket from "../Socket";
import "./videochat.css";

function VideoChat({ socketId, toggleVideo }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  // Keep track of whether we've already processed offers/answers
  const processedSignalsRef = useRef(new Set());

  const [connectionState, setConnectionState] = useState("new");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  // ICE servers for WebRTC (STUN servers help with NAT traversal)
  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ],
  };

  // Function to create and initialize a new RTCPeerConnection
  const createPeerConnection = () => {
    // Close any existing connection first
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    // Create new connection
    const pc = new RTCPeerConnection(iceServers);
    peerConnectionRef.current = pc;

    // Clear processed signals
    processedSignalsRef.current = new Set();

    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      console.log("Remote track received", event.streams[0]);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setIsConnected(true);
      }
    };

    // Track connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log("Connection state:", state);
      setConnectionState(state);

      if (state === "connected") {
        setIsConnected(true);
      } else if (
        state === "failed" ||
        state === "disconnected" ||
        state === "closed"
      ) {
        setIsConnected(false);

        // Retry connection if it fails (up to 3 times)
        if (state === "failed" && connectionAttempts < 3) {
          console.log(
            `Connection failed. Retrying... (Attempt ${connectionAttempts + 1})`
          );
          setTimeout(() => {
            setConnectionAttempts((prev) => prev + 1);
            createPeerConnection();
            socket.emit("ready-to-connect");
          }, 1000);
        }
      }
    };

    // Generate ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          candidate: event.candidate,
        });
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log("ICE gathering state:", pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      console.log("Signaling state:", pc.signalingState);
    };

    return pc;
  };

  useEffect(() => {
    let isComponentMounted = true;

    // Set up WebRTC connection
    const setupMediaDevices = async () => {
      try {
        // Get local media stream (camera and microphone)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (!isComponentMounted) return;

        // Save stream reference
        localStreamRef.current = stream;

        // Show local video stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Create initial peer connection
        createPeerConnection();

        // Socket events for WebRTC signaling
        const handleOffer = async (data) => {
          console.log("Received offer", data);
          try {
            const pc = peerConnectionRef.current;
            if (!pc) return;

            // Generate a unique ID for this offer to avoid processing duplicates
            const offerId = JSON.stringify(data.offer);
            if (processedSignalsRef.current.has(offerId)) {
              console.log("Duplicate offer - ignoring");
              return;
            }
            processedSignalsRef.current.add(offerId);

            // Check if we're in a valid state to process the offer
            if (pc.signalingState !== "stable") {
              console.log("Cannot handle offer in state:", pc.signalingState);
              // If we're in have-local-offer state, we may need to rollback
              if (pc.signalingState === "have-local-offer") {
                console.log("Rolling back local offer");
                await pc.setLocalDescription({ type: "rollback" });
              }
            }

            // Set remote description (the offer)
            await pc.setRemoteDescription(
              new RTCSessionDescription(data.offer)
            );

            // Create answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Send answer
            socket.emit("webrtc-answer", {
              answer: answer,
            });
          } catch (error) {
            console.error("Error handling offer:", error);
          }
        };

        const handleAnswer = async (data) => {
          console.log("Received answer", data);
          try {
            const pc = peerConnectionRef.current;
            if (!pc) return;

            // Generate a unique ID for this answer to avoid processing duplicates
            const answerId = JSON.stringify(data.answer);
            if (processedSignalsRef.current.has(answerId)) {
              console.log("Duplicate answer - ignoring");
              return;
            }
            processedSignalsRef.current.add(answerId);

            // Only set remote answer if we're in have-local-offer state
            if (pc.signalingState !== "have-local-offer") {
              console.log(
                "Cannot set remote answer in state:",
                pc.signalingState
              );
              return;
            }

            await pc.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
          } catch (error) {
            console.error("Error setting remote description:", error);
          }
        };

        const handleIceCandidate = async (data) => {
          if (data.candidate && peerConnectionRef.current) {
            try {
              await peerConnectionRef.current.addIceCandidate(
                new RTCIceCandidate(data.candidate)
              );
            } catch (error) {
              console.error("Error adding ICE candidate:", error);
            }
          }
        };

        const createOfferFn = async () => {
          console.log("Creating offer");
          const pc = peerConnectionRef.current;
          if (!pc) return;

          try {
            // Only create offer if we're in stable state
            if (pc.signalingState !== "stable") {
              console.log("Cannot create offer in state:", pc.signalingState);
              return;
            }

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit("webrtc-offer", {
              offer: offer,
            });
          } catch (error) {
            console.error("Error creating offer:", error);
          }
        };

        const handlePartnerLeft = () => {
          console.log("Partner left");
          setIsConnected(false);

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
          }

          // Reset connection
          setConnectionAttempts(0);
          createPeerConnection();
        };

        // Register socket event handlers
        socket.on("webrtc-offer", handleOffer);
        socket.on("webrtc-answer", handleAnswer);
        socket.on("ice-candidate", handleIceCandidate);
        socket.on("create-offer", createOfferFn);
        socket.on("partnerLeft", handlePartnerLeft);

        // Signal that we're ready to connect
        setTimeout(() => {
          console.log("Sending ready-to-connect");
          socket.emit("ready-to-connect");
        }, 1000);

        // Return cleanup function for event listeners
        return () => {
          socket.off("webrtc-offer", handleOffer);
          socket.off("webrtc-answer", handleAnswer);
          socket.off("ice-candidate", handleIceCandidate);
          socket.off("create-offer", createOfferFn);
          socket.off("partnerLeft", handlePartnerLeft);
        };
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    const cleanup = setupMediaDevices();

    // Component cleanup
    return () => {
      isComponentMounted = false;

      // Cleanup socket events if needed
      if (cleanup && typeof cleanup === "function") {
        cleanup();
      }

      // Stop all media tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Close peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [connectionAttempts]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsCameraOff(!isCameraOff);
    }
  };

  // Create a helper function to reconnect
  const reconnect = () => {
    setConnectionAttempts(0);
    createPeerConnection();
    socket.emit("ready-to-connect");
  };

  return (
    <div className="video-chat-container">
      <div className="video-grid">
        <div className="video-box remote-video">
          <video ref={remoteVideoRef} autoPlay playsInline />
          <div className="video-label">
            Partner {isConnected ? "" : "(Connecting...)"}
          </div>
          {connectionState === "failed" && connectionAttempts >= 3 && (
            <button
              onClick={reconnect}
              className="reconnect-btn"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                padding: "8px 16px",
                backgroundColor: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Reconnect
            </button>
          )}
        </div>

        <div className="video-box local-video">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted // Always mute local video to prevent echo
          />
          <div className="video-label">You</div>
        </div>
      </div>

      <div className="video-controls">
        <button
          className={`control-btn ${isMuted ? "control-off" : ""}`}
          onClick={toggleMute}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>

        <button
          className={`control-btn ${isCameraOff ? "control-off" : ""}`}
          onClick={toggleCamera}
        >
          {isCameraOff ? "📵" : "📹"}
        </button>

        <button className="control-btn" onClick={toggleVideo}>
          Hide Video
        </button>
      </div>
    </div>
  );
}

export default VideoChat;
