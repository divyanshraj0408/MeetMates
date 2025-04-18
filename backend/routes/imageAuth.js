const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Tesseract = require("tesseract.js");

const router = express.Router(); // <-- this is essential

const upload = multer({ dest: "uploads/" });

module.exports = router;

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

    const enrollmentMatch = extractedText.match(
      /Enrollment No\.?\s*[:\-]?\s*(\d{11})/i
    );
    const enrollmentNo = enrollmentMatch?.[1];

    if (!enrollmentNo) {
      return res.status(400).json({
        status: "error",
        message: "Enrollment number not found in the ID card.",
      });
    }

    let fullName = null;
    const lines = extractedText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      if (/^Name\s*[:\-]?\s*$/i.test(lines[i]) && i + 1 < lines.length) {
        fullName = lines[i + 1].replace(/[^A-Z\s]/gi, "").trim(); // remove junk chars
        break;
      } else if (/^Name\s*[:\-]?\s*(.+)$/i.test(lines[i])) {
        fullName = lines[i]
          .match(/^Name\s*[:\-]?\s*(.+)$/i)[1]
          .replace(/[^A-Z\s]/gi, "")
          .trim();
        break;
      }
    }

    if (!fullName) {
      return res.status(400).json({
        status: "error",
        message: "Name could not be extracted from the ID card.",
      });
    }

    const userId =
      fullName.replace(/\s+/g, "").substring(0, 5) +
      enrollmentNo.substring(0, 5);

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
