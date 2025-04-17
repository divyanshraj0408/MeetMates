const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Tesseract = require("tesseract.js");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/image-login", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status: "error",
      message: "No image file uploaded.",
    });
  }

  const imagePath = path.join(__dirname, "..", req.file.path);

  try {
    const result = await Tesseract.recognize(imagePath, "eng");
    const extractedText = result.data.text;

    fs.unlinkSync(imagePath);

    console.log("Extracted OCR Text:\n", extractedText);

    // Match Enrollment Number
    const enrollmentMatch = extractedText.match(/Enrollment No\.?\s*[:\-]?\s*(\d{11})/i);
    const enrollmentNo = enrollmentMatch?.[1];

    if (!enrollmentNo) {
      return res.status(400).json({
        status: "error",
        message: "Enrollment number not found in the ID card.",
      });
    }

    // Match Name (more flexible + multiline support)
    const nameMatch = extractedText.match(/Name\s*[:\-]?\s*([A-Z][A-Z ]{2,})/i);
    const fullName = nameMatch?.[1]?.trim();

    if (!fullName) {
      return res.status(400).json({
        status: "error",
        message: "Name could not be extracted from the ID card.",
      });
    }

    // ✅ Remove all spaces and extract first 5 characters
    const userId = fullName.replace(/\s+/g, "").substring(0, 5);

    return res.json({
      status: "success",
      message: "ID verified successfully",
      enrollment_no: enrollmentNo,
      name: fullName,
      user_id: userId,
    });

  } catch (error) {
    console.error("OCR Error:", error);

    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    return res.status(500).json({
      status: "error",
      message: "OCR failed to process the image.",
    });
  }
});

module.exports = router;
