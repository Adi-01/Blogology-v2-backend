import type { Request, Response, NextFunction } from "express";
import { uploadService } from "@/services/upload.service.js";
import { BadRequestError } from "@/errors/BadRequestError.js";

export class UploadController {
  async uploadCover(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new BadRequestError({
          code: "FILE_REQUIRED",
          message: "No image file uploaded.",
        });
      }

      const oldUrl = (req.body?.oldUrl as string | undefined) || (req.query?.oldUrl as string | undefined);
      const result = await uploadService.uploadCoverImage(req.file, oldUrl);

      res.success("Cover image uploaded successfully", result, 201);
    } catch (error) {
      next(error);
    }
  }

  async deleteImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const url =
        (req.body?.url as string | undefined) ||
        (req.query?.url as string | undefined) ||
        (req.params?.publicId as string | undefined);

      if (!url) {
        throw new BadRequestError({
          code: "URL_REQUIRED",
          message: "Image URL or public ID is required.",
        });
      }

      const deleted = await uploadService.deleteImage(url);
      res.success("Image deleted successfully", { deleted }, 200);
    } catch (error) {
      next(error);
    }
  }
}

export const uploadController = new UploadController();
