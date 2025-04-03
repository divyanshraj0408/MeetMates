import { useState } from "react";
import axios from "axios";
import "./UploadIdCard.css";

function UploadIdCard({ onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleDrop = (event) => {
    event.preventDefault();
    const uploadedFile = event.dataTransfer.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
    }
  };

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("idCard", file);

    try {
      const response = await axios.post(
        "http://localhost:3001/upload-id",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      onUploadSuccess(response.data.filePath);
    } catch (err) {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="upload-container"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <input type="file" onChange={handleFileChange} />
      <p>Drag & drop an ID card here, or click to select a file.</p>

      {file && <p>Selected file: {file.name}</p>}

      <button onClick={handleUpload} disabled={uploading}>
        {uploading ? "Uploading..." : "Upload"}
      </button>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default UploadIdCard;
