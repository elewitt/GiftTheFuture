"use client";

import { useState } from "react";
import Image from "next/image";

interface MediaGalleryProps {
  mediaUrls: string[];
  className?: string;
}

export function MediaGallery({ mediaUrls, className = "" }: MediaGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (mediaUrls.length === 0) return null;

  const isVideo = (url: string) => {
    return url.includes("/video/") || url.endsWith(".mp4") || url.endsWith(".webm");
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : mediaUrls.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev < mediaUrls.length - 1 ? prev + 1 : 0));
  };

  // Single media item
  if (mediaUrls.length === 1) {
    const url = mediaUrls[0];
    return (
      <div className={`relative overflow-hidden rounded-xl ${className}`}>
        {isVideo(url) ? (
          <video
            src={url}
            controls
            className="w-full max-h-96 object-contain bg-black/5"
            playsInline
          />
        ) : (
          <div
            className="cursor-pointer"
            onClick={() => setLightboxOpen(true)}
          >
            <Image
              src={url}
              alt="Post media"
              width={800}
              height={600}
              className="w-full max-h-96 object-cover"
            />
          </div>
        )}

        {/* Lightbox */}
        {lightboxOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setLightboxOpen(false)}
          >
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <Image
              src={url}
              alt="Post media"
              width={1920}
              height={1080}
              className="max-w-full max-h-[90vh] object-contain"
            />
          </div>
        )}
      </div>
    );
  }

  // Multiple media items (carousel)
  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      <div className="relative aspect-video bg-black/5">
        {isVideo(mediaUrls[activeIndex]) ? (
          <video
            src={mediaUrls[activeIndex]}
            controls
            className="w-full h-full object-contain"
            playsInline
          />
        ) : (
          <Image
            src={mediaUrls[activeIndex]}
            alt={`Post media ${activeIndex + 1}`}
            fill
            className="object-cover cursor-pointer"
            onClick={() => setLightboxOpen(true)}
          />
        )}

        {/* Navigation arrows */}
        <button
          onClick={handlePrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={handleNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Dots indicator */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {mediaUrls.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                setActiveIndex(index);
              }}
              className={`w-2 h-2 rounded-full transition ${
                index === activeIndex ? "bg-white" : "bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            onClick={handlePrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <Image
            src={mediaUrls[activeIndex]}
            alt={`Post media ${activeIndex + 1}`}
            width={1920}
            height={1080}
            className="max-w-full max-h-[90vh] object-contain"
          />
        </div>
      )}
    </div>
  );
}
