import { NextRequest, NextResponse } from "next/server";
import { uploadMedia, validateMediaFile } from "@/lib/cloudinary";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/upload
 *
 * Upload media files (images/videos) to Cloudinary.
 * Returns the Cloudinary URL for the uploaded file.
 */
export async function POST(req: NextRequest) {
  try {
    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
      return NextResponse.json(
        { error: "Media uploads not configured. Post without images for now." },
        { status: 503 }
      );
    }

    // Require authentication
    await requireAuth(req);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type and size
    const validation = validateMediaFile({
      type: file.type,
      size: file.size,
    });

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Determine resource type
    const resourceType = file.type.startsWith("video/") ? "video" : "image";

    // Upload to Cloudinary
    const result = await uploadMedia(buffer, {
      folder: "posts",
      resourceType,
    });

    return NextResponse.json({
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
      format: result.format,
      resourceType: result.resourceType,
      thumbnailUrl: result.thumbnailUrl,
    });
  } catch (error: any) {
    console.error("[/api/upload] Error:", error);

    if (error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}
