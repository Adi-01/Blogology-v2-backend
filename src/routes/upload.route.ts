import { Router } from "express";
import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { uploadController } from "@/controllers/upload.controller.js";
import { authenticate } from "@/middleware/authenticate.middleware.js";
import { BadRequestError } from "@/errors/BadRequestError.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
});

const handleSingleUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          new BadRequestError({
            code: "FILE_TOO_LARGE",
            message: "Cover image must not exceed 2MB.",
          })
        );
      }
      return next(
        new BadRequestError({
          code: "UPLOAD_ERROR",
          message: err.message,
        })
      );
    } else if (err) {
      return next(err);
    }
    next();
  });
};

// POST /api/v1/upload (and /cover) - Upload cover image to Cloudinary (replaces oldUrl if passed)
router.post("/", authenticate, handleSingleUpload, (req, res, next) =>
  uploadController.uploadCover(req, res, next)
);
router.post("/cover", authenticate, handleSingleUpload, (req, res, next) =>
  uploadController.uploadCover(req, res, next)
);

// DELETE /api/v1/upload - Delete image from Cloudinary
router.delete("/", authenticate, (req, res, next) =>
  uploadController.deleteImage(req, res, next)
);

export default router;
