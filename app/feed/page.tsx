"use client";

import { Navbar } from "@/components/Navbar";
import { Feed } from "@/components/feed";
import { QuickBuy } from "@/components/feed/QuickBuy";

export default function FeedPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Side - Search & Buy Predictions */}
            <div className="lg:col-span-5 xl:col-span-4">
              <div className="lg:sticky lg:top-24">
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-foreground">Markets</h2>
                  <p className="text-sm text-muted-foreground">
                    Buy prediction market positions
                  </p>
                </div>
                <QuickBuy />
              </div>
            </div>

            {/* Right Side - News Feed */}
            <div className="lg:col-span-7 xl:col-span-8">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-foreground">Feed</h2>
                <p className="text-sm text-muted-foreground">
                  See what traders are saying about their positions
                </p>
              </div>
              <Feed showComposer={true} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
