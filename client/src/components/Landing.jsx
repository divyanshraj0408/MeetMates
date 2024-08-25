import { useEffect, useRef, useState } from "react";
import { Room } from "./Room";

export const Landing = () => {
  const [name, setName] = useState("");
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const videoRef = useRef(null);
  const [joined, setJoined] = useState(false);

  const getCam = async () => {
    const stream = await window.navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];
    setLocalAudioTrack(audioTrack);
    setLocalVideoTrack(videoTrack);
    if (videoRef.current) {
      videoRef.current.srcObject = new MediaStream([videoTrack]);
      videoRef.current.play();
    }
  };

  useEffect(() => {
    if (videoRef.current) {
      getCam();
    }
  }, [videoRef]);

  if (!joined) {
    return (
      <div className="flex h-screen">
        {/* Video Container */}
        <div className="relative w-1/2 h-full">
          <video
            autoPlay
            ref={videoRef}
            className="w-full h-full object-cover rounded-r-lg"
          ></video>
          {/* Join Button */}
          <button
            onClick={() => setJoined(true)}
            className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white text-black py-2 px-4 rounded-full shadow-lg"
          >
            Join
          </button>
          {/* Input Field */}
          <input
            type="text"
            onChange={(e) => setName(e.target.value)}
            className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white text-black py-2 px-4 rounded-full shadow-lg"
            placeholder="Enter your name"
          />
        </div>
        {/* Placeholder for other content (e.g., additional features or layout on the right side) */}
        <div className="w-1/2 h-full bg-gray-100 flex items-center justify-center">
          {/* You can add additional content or leave this as a placeholder */}
        </div>
      </div>
    );
  }

  return (
    <Room
      name={name}
      localAudioTrack={localAudioTrack}
      localVideoTrack={localVideoTrack}
    />
  );
};
