"use client";

import { motion } from "framer-motion";
import { MarketSearch } from "@/components/MarketSearch";
import { MarchMadnessPromo } from "@/components/MarchMadnessPromo";

// Animated floating orb component
function FloatingOrb({
  className,
  delay = 0,
  duration = 20,
}: {
  className: string;
  delay?: number;
  duration?: number;
}) {
  return (
    <motion.div
      className={`pointer-events-none absolute rounded-full ${className}`}
      animate={{
        x: [0, 30, -20, 40, 0],
        y: [0, -40, 20, -30, 0],
        scale: [1, 1.1, 0.95, 1.05, 1],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

export function HeroSection() {
  return (
    <section className="relative flex min-h-[50vh] items-center justify-center pt-16 pb-32">
      {/* Background gradient */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
      </div>

      {/* Animated gradient orbs */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Large primary orb - top left */}
        <FloatingOrb
          className="-left-32 -top-32 h-[500px] w-[500px] bg-gradient-to-br from-primary/20 to-primary/5 blur-3xl"
          duration={25}
          delay={0}
        />

        {/* Medium accent orb - top right */}
        <FloatingOrb
          className="-right-20 top-10 h-[400px] w-[400px] bg-gradient-to-bl from-accent/25 to-accent/5 blur-3xl"
          duration={20}
          delay={2}
        />

        {/* Small primary orb - center left */}
        <FloatingOrb
          className="left-1/4 top-1/3 h-[200px] w-[200px] bg-gradient-to-r from-primary/15 to-transparent blur-2xl"
          duration={18}
          delay={4}
        />

        {/* Medium mixed orb - center right */}
        <FloatingOrb
          className="right-1/4 top-1/2 h-[300px] w-[300px] bg-gradient-to-l from-accent/20 via-primary/10 to-transparent blur-3xl"
          duration={22}
          delay={1}
        />

        {/* Small accent orb - bottom */}
        <FloatingOrb
          className="left-1/2 -translate-x-1/2 bottom-0 h-[350px] w-[350px] bg-gradient-to-t from-primary/15 via-accent/10 to-transparent blur-3xl"
          duration={24}
          delay={3}
        />
      </div>

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
          className="relative z-50 mx-auto mt-10 max-w-2xl"
        >
          <MarketSearch
            placeholder="Search any Kalshi market... (e.g., Super Bowl, Bitcoin, Elections)"
            showTrending={true}
          />
        </motion.div>

        {/* March Madness Promo */}
        <div className="relative z-40 mx-auto mt-8 max-w-2xl">
          <MarchMadnessPromo />
        </div>
      </div>
    </section>
  );
}
