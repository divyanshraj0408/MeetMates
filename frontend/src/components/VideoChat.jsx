import { useEffect, useRef, useState } from "react";
import socket from "../Socket";

function VideoChat({ socketId, toggleVideo }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // ICE servers for WebRTC (STUN servers help with NAT traversal)
  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  useEffect(() => {
    // Set up WebRTC connection
    const setupMediaDevices = async () => {
      try {
        // Get local media stream (camera and microphone)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        // Save stream reference
        localStreamRef.current = stream;

        // Show local video stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Create RTCPeerConnection
        peerConnectionRef.current = new RTCPeerConnection(iceServers);

        // Add local tracks to the connection
        stream.getTracks().forEach((track) => {
          peerConnectionRef.current.addTrack(track, stream);
        });

        // Handle incoming remote tracks
        peerConnectionRef.current.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        // Generate ICE candidates
        peerConnectionRef.current.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", {
              candidate: event.candidate,
            });
          }
        };

        // Socket events for WebRTC signaling
        socket.on("webrtc-offer", async (data) => {
          // Set remote description based on the offer
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(data.offer)
          );

          // Create answer
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);

          // Send answer back
          socket.emit("webrtc-answer", {
            answer: answer,
          });
        });

        socket.on("webrtc-answer", async (data) => {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
        });

        socket.on("ice-candidate", async (data) => {
          if (data.candidate) {
            try {
              await peerConnectionRef.current.addIceCandidate(
                new RTCIceCandidate(data.candidate)
              );
            } catch (error) {
              console.error("Error adding ICE candidate:", error);
            }
          }
        });

        // Create and send offer when in a chat
        const createOffer = async () => {
          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);

          socket.emit("webrtc-offer", {
            offer: offer,
          });
        };

        // Delay to ensure the other person has joined
        setTimeout(() => {
          createOffer();
        }, 1000);
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    setupMediaDevices();

    // Cleanup function
    return () => {
      // Stop all tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Close peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }

      // Remove socket listeners
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("ice-candidate");
    };
  }, []);

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

  return (
    <div className="video-chat-container">
      <div className="video-grid">
        <div className="video-box remote-video">
          <video ref={remoteVideoRef} autoPlay playsInline />
          <div className="video-label">Partner</div>
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
