"use client";

import { motion } from "framer-motion";

export default function BlockedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">🌍</span>
        </div>

        <h1 className="text-2xl font-bold mb-3 text-foreground">
          Service Unavailable
        </h1>

        <p className="text-sm text-muted-foreground mb-6">
          Unfortunately, this service is not available in your region due to regulatory restrictions.
        </p>

        <div className="p-4 rounded-xl bg-secondary/50 text-left">
          <p className="text-xs text-muted-foreground">
            If you believe you&apos;re seeing this message in error, please contact support.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
