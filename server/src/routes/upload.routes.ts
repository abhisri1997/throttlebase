import { Router } from "express";
import multer from "multer";
import { uploadImageBuffer } from "../services/cloudinary.service.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
});

router.post("/", authenticate, upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    // Pass the buffer directly to cloudinary
    const url = await uploadImageBuffer(req.file.buffer);
    
    return res.status(200).json({ url });
  } catch (error) {
    next(error);
  }
});

export default router;
