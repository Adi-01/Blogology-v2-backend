import { v2 as cloudinary } from "cloudinary";
import { env } from "@/config/env.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME || "",
  api_key: env.CLOUDINARY_API_KEY || "",
  api_secret: env.CLOUDINARY_API_SECRET || "",
  secure: true,
});

export function getCloudinaryPublicId(url: string): string | null {
  try {
    const uploadIndex = url.indexOf("/upload/");
    if (uploadIndex === -1) return null;
    let pathAfterUpload = url.substring(uploadIndex + 8);
    // Strip version prefix if present, e.g. v1731150000/
    pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, "");
    // Strip file extension
    const lastDotIndex = pathAfterUpload.lastIndexOf(".");
    if (lastDotIndex !== -1) {
      pathAfterUpload = pathAfterUpload.substring(0, lastDotIndex);
    }
    return pathAfterUpload;
  } catch {
    return null;
  }
}

export async function uploadImageBuffer(
  buffer: Buffer,
  folder = "blogology/covers"
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error("Cloudinary upload failed with empty result"));
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );
    stream.end(buffer);
  });
}

export async function deleteCloudinaryImage(urlOrPublicId: string): Promise<boolean> {
  try {
    let publicId = urlOrPublicId;
    if (urlOrPublicId.startsWith("http://") || urlOrPublicId.startsWith("https://")) {
      const extracted = getCloudinaryPublicId(urlOrPublicId);
      if (!extracted) {
        // Not a Cloudinary URL, ignore
        return false;
      }
      publicId = extracted;
    }

    const res = await cloudinary.uploader.destroy(publicId);
    return res.result === "ok";
  } catch (error) {
    console.error("Failed to delete image from Cloudinary:", error);
    return false;
  }
}

export { cloudinary };
