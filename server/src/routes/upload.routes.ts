import { Router } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { uploadImageBuffer } from "../services/cloudinary.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import type { Request, Response, NextFunction } from "express";

const router = Router();

// Rate limiter: Max 10 uploads per hour per rider
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  message: { message: "Too many image uploads from this account, please try again after an hour" },
  keyGenerator: (req) => {
    // We can assume req.rider exists because authenticate middleware is used before uploadLimiter.
    return (req as any).rider?.riderId || req.ip;
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

router.post("/", authenticate, uploadLimiter, upload.single("image"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    // Pass the buffer directly to cloudinary
    const url = await uploadImageBuffer(req.file.buffer);
    
    return res.status(200).json({ url });
  } catch (error) {
    if (error instanceof Error && error.message === "Only image files are allowed!") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
});

export default router;
