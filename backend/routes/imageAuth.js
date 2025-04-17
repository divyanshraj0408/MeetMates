const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Tesseract = require("tesseract.js");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// Allowed Enrollment Numbers (can also be fetched from DB)
const ALLOWED_ENROLLMENTS = ["02696202722"]; // ✅ Add more as needed

router.post("/image-login", upload.single("image"), async (req, res) => {
  const imagePath = path.join(__dirname, "..", req.file.path);

  try {
    const result = await Tesseract.recognize(imagePath, "eng");
    const extractedText = result.data.text;
    fs.unlinkSync(imagePath);

    console.log("🧾 Extracted OCR Text:\n", extractedText);

    // Match Enrollment No (11-digit number after "Enrollment No")
    const match = extractedText.match(/Enrollment No\.?\s*[:\-]?\s*(\d{11})/i);
    const enrollmentNo = match?.[1];

    if (!enrollmentNo) {
      return res.status(400).json({
        status: "error",
        message: "Enrollment number not found in the ID card.",
      });
    }

    if (!ALLOWED_ENROLLMENTS.includes(enrollmentNo)) {
      return res.status(401).json({
        status: "error",
        message: "Enrollment number is not authorized.",
        enrollment: enrollmentNo,
      });
    }

    return res.json({
      status: "success",
      message: "ID verified successfully",
      enrollment_no: enrollmentNo,
      token: "fake-jwt-token-photo-login"
    });

  } catch (error) {
    console.error("OCR Error:", error);
    res.status(500).json({ message: "OCR failed to process image." });
  }
});

module.exports = router;
