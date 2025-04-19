const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Tesseract = require("tesseract.js");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/image-login", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ status: "error", message: "No image uploaded." });
  }

  const imagePath = path.join(__dirname, "..", req.file.path);

  try {
    const result = await Tesseract.recognize(imagePath, "eng");
    const extractedText = result.data.text;
    fs.unlinkSync(imagePath); // delete uploaded file

    console.log("OCR Output:\n", extractedText);

    // Extract enrollment number (11-digit number)
    const enrollmentMatch = extractedText.match(/\b\d{11}\b/);
    const enrollmentNo = enrollmentMatch?.[0];

    if (!enrollmentNo) {
      return res.status(400).json({
        status: "error",
        message: "Enrollment number not found in the ID card.",
      });
    }

    // Extract name (first two capitalized words)
    const nameMatch = extractedText.match(/Name\s*:\s*(.*)/i);

    if (!nameMatch) {
      return res.status(400).json({
        status: "error",
        message: "Name not found or unreadable on the ID card.",
      });
    }

    let name = nameMatch?.[1]
      ?.trim()
      .split(" ")
      .slice(0, 2)
      .join(".")
      .toLowerCase(); // e.g., sagar.kumar
    const userId = `${name}${enrollmentNo.slice(0, 3)}@adgitmdelhi.ac.in`;

    return res.json({
      status: "success",
      message: "OCR verification successful",
      user_id: userId,
      enrollment_no: enrollmentNo,
    });
  } catch (err) {
    console.error("OCR Error:", err);
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    return res
      .status(500)
      .json({ status: "error", message: "OCR failed to process image." });
  }
});

module.exports = router;
