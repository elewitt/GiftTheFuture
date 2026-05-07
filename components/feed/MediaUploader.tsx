"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";

interface MediaUploaderProps {
  mediaUrls: string[];
  onMediaChange: (urls: string[]) => void;
  maxFiles?: number;
}

export function MediaUploader({
  mediaUrls,
  onMediaChange,
  maxFiles = 4,
}: MediaUploaderProps) {
  const { user } = usePrivy();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      await uploadFiles(files);
    },
    [mediaUrls]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await uploadFiles(files);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (mediaUrls.length + files.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    setIsUploading(true);
    setError(null);

    const newUrls: string[] = [];
    const totalFiles = files.length;
    let completed = 0;

    for (const file of files) {
      try {
        // Validate file type
        const allowedTypes = [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "video/mp4",
          "video/quicktime",
          "video/webm",
        ];

        if (!allowedTypes.includes(file.type)) {
          setError(`File type ${file.type} is not supported`);
          continue;
        }

        // Validate file size (50MB)
        if (file.size > 50 * 1024 * 1024) {
          setError("File size exceeds 50MB limit");
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "X-Privy-Id": user?.id || "",
          },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        const data = await res.json();
        newUrls.push(data.url);
        completed++;
        setUploadProgress(Math.round((completed / totalFiles) * 100));
      } catch (err: any) {
        console.error("Upload error:", err);
        setError(err.message || "Upload failed");
      }
    }

    if (newUrls.length > 0) {
      onMediaChange([...mediaUrls, ...newUrls]);
    }

    setIsUploading(false);
    setUploadProgress(0);
  };

  const removeMedia = (index: number) => {
    const newUrls = [...mediaUrls];
    newUrls.splice(index, 1);
    onMediaChange(newUrls);
  };

  const isVideo = (url: string) => {
    return url.includes("/video/") || url.endsWith(".mp4") || url.endsWith(".webm");
  };

  return (
    <div className="space-y-3">
      {/* Upload area */}
      {mediaUrls.length < maxFiles && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="relative border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {isUploading ? (
            <div className="space-y-2">
              <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">
                Uploading... {uploadProgress}%
              </p>
            </div>
          ) : (
            <>
              <svg
                className="w-8 h-8 mx-auto mb-2 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm text-muted-foreground">
                Drop images or videos here, or click to select
              </p>
              <p className="text-xs text-muted-foreground/60">
                Max {maxFiles} files, 50MB each
              </p>
            </>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Preview grid */}
      {mediaUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {mediaUrls.map((url, index) => (
            <div
              key={url}
              className="relative aspect-video rounded-lg overflow-hidden bg-secondary"
            >
              {isVideo(url) ? (
                <video
                  src={url}
                  className="w-full h-full object-cover"
                  muted
                />
              ) : (
                <Image
                  src={url}
                  alt={`Media ${index + 1}`}
                  fill
                  className="object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => removeMedia(index)}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              {isVideo(url) && (
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/50 text-white text-xs">
                  Video
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
