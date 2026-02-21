"use client";

import { motion } from "framer-motion";
import { MarketSearch } from "@/components/MarketSearch";

export function HeroSection() {
  return (
    <section className="relative flex min-h-[50vh] items-center justify-center overflow-hidden pt-16">
      {/* Background gradient */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
      </div>

      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -left-40 top-20 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-40 h-80 w-80 rounded-full bg-accent/5 blur-3xl" />

      <div className="container relative z-10 mx-auto px-4 text-center">
        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-5xl font-bold leading-tight tracking-tight md:text-7xl"
        >
          Gift anyone a stake{" "}
          <span className="text-gradient-brand">in the future</span>
        </motion.h1>

        {/* Powered by Kalshi */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-6 inline-flex items-center gap-2"
        >
          <span className="text-sm text-muted-foreground">Powered by</span>
          <span className="text-sm font-semibold text-foreground">Kalshi</span>
        </motion.div>

        {/* Search bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-10 max-w-2xl"
        >
          <MarketSearch
            placeholder="Search any Kalshi market... (e.g., Super Bowl, Bitcoin, Elections)"
            showTrending={true}
          />
        </motion.div>
      </div>
    </section>
  );
}
