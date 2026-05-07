/**
 * Cloudinary Media Upload Utilities
 *
 * Handles image and video uploads with automatic optimization.
 */

import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  resourceType: "image" | "video";
  duration?: number; // For videos
  thumbnailUrl?: string; // For videos
}

/**
 * Upload media (image or video) to Cloudinary.
 * Returns the optimized URL and metadata.
 */
export async function uploadMedia(
  file: Buffer | string,
  options?: {
    folder?: string;
    resourceType?: "image" | "video" | "auto";
    maxWidth?: number;
    maxHeight?: number;
  }
): Promise<UploadResult> {
  const { folder = "posts", resourceType = "auto", maxWidth = 1920, maxHeight = 1080 } = options || {};

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        transformation: resourceType === "video"
          ? [
              { width: maxWidth, height: maxHeight, crop: "limit" },
              { quality: "auto" },
            ]
          : [
              { width: maxWidth, height: maxHeight, crop: "limit" },
              { quality: "auto", fetch_format: "auto" },
            ],
        eager: resourceType === "video"
          ? [{ format: "jpg", transformation: [{ width: 640, crop: "scale" }] }]
          : undefined,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result) {
          reject(new Error("No result from Cloudinary upload"));
          return;
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          resourceType: result.resource_type as "image" | "video",
          duration: result.duration,
          thumbnailUrl: result.eager?.[0]?.secure_url,
        });
      }
    );

    // Handle both Buffer and base64 string inputs
    if (Buffer.isBuffer(file)) {
      uploadStream.end(file);
    } else {
      // Assume it's a base64 data URL
      const base64Data = file.replace(/^data:.*?;base64,/, "");
      uploadStream.end(Buffer.from(base64Data, "base64"));
    }
  });
}

/**
 * Upload media from a URL.
 */
export async function uploadMediaFromUrl(
  url: string,
  options?: {
    folder?: string;
    resourceType?: "image" | "video" | "auto";
  }
): Promise<UploadResult> {
  const { folder = "posts", resourceType = "auto" } = options || {};

  const result = await cloudinary.uploader.upload(url, {
    folder,
    resource_type: resourceType,
    transformation: [
      { width: 1920, height: 1080, crop: "limit" },
      { quality: "auto", fetch_format: "auto" },
    ],
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    resourceType: result.resource_type as "image" | "video",
    duration: result.duration,
  };
}

/**
 * Delete media from Cloudinary.
 */
export async function deleteMedia(publicId: string, resourceType: "image" | "video" = "image"): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

/**
 * Generate an optimized URL for an existing Cloudinary image.
 */
export function getOptimizedUrl(
  publicId: string,
  options?: {
    width?: number;
    height?: number;
    crop?: string;
    quality?: string;
  }
): string {
  const { width, height, crop = "fill", quality = "auto" } = options || {};

  return cloudinary.url(publicId, {
    transformation: [
      { width, height, crop },
      { quality, fetch_format: "auto" },
    ],
    secure: true,
  });
}

/**
 * Generate a video thumbnail URL.
 */
export function getVideoThumbnailUrl(publicId: string, options?: { width?: number }): string {
  const { width = 640 } = options || {};

  return cloudinary.url(publicId, {
    resource_type: "video",
    transformation: [{ width, crop: "scale" }, { format: "jpg" }],
    secure: true,
  });
}

/**
 * Validate file type and size.
 */
export function validateMediaFile(
  file: { type: string; size: number },
  options?: {
    maxSizeBytes?: number;
    allowedTypes?: string[];
  }
): { valid: boolean; error?: string } {
  const {
    maxSizeBytes = 50 * 1024 * 1024, // 50MB default
    allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ],
  } = options || {};

  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${Math.round(maxSizeBytes / 1024 / 1024)}MB`,
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(", ")}`,
    };
  }

  return { valid: true };
}

export default cloudinary;
