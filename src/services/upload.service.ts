import { BadRequestError } from "@/errors/BadRequestError.js";
import {
  uploadImageBuffer,
  deleteCloudinaryImage,
} from "@/lib/cloudinary.js";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export class UploadService {
  async uploadCoverImage(
    file: Express.Multer.File,
    oldUrl?: string
  ): Promise<{ url: string; publicId: string }> {
    if (!file) {
      throw new BadRequestError({
        code: "FILE_REQUIRED",
        message: "No image file provided.",
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestError({
        code: "FILE_TOO_LARGE",
        message: "Cover image must not exceed 2MB.",
      });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestError({
        code: "INVALID_FILE_TYPE",
        message: "Invalid file type. Allowed formats: JPG, PNG, WEBP, GIF.",
      });
    }

    // Delete existing cover image if changing/replacing
    if (oldUrl) {
      await deleteCloudinaryImage(oldUrl);
    }

    const uploadResult = await uploadImageBuffer(file.buffer, "blogology/covers");
    return uploadResult;
  }

  async deleteImage(urlOrPublicId: string): Promise<boolean> {
    if (!urlOrPublicId) {
      throw new BadRequestError({
        code: "URL_REQUIRED",
        message: "Image URL or public ID is required.",
      });
    }

    return await deleteCloudinaryImage(urlOrPublicId);
  }
}

export const uploadService = new UploadService();
