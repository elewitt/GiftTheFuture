"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";

export default function KYCCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "success" | "failed">("checking");

  useEffect(() => {
    const checkVerification = async () => {
      // Get the wallet we were verifying
      const wallet = sessionStorage.getItem("kyc_wallet");

      if (!wallet) {
        setStatus("failed");
        return;
      }

      // Check verification status
      try {
        const res = await fetch(`/api/kyc/status?wallet=${wallet}`);
        const data = await res.json();

        if (data.verified) {
          setStatus("success");
          // Clear session storage
          sessionStorage.removeItem("kyc_pending");
          sessionStorage.removeItem("kyc_wallet");

          // Redirect to dashboard after a short delay
          setTimeout(() => {
            router.push("/dashboard");
          }, 2000);
        } else {
          setStatus("failed");
        }
      } catch {
        setStatus("failed");
      }
    };

    checkVerification();
  }, [router]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-32 flex items-center justify-center px-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          {status === "checking" && (
            <>
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-6" />
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Verifying...
              </h1>
              <p className="text-muted-foreground">
                Checking your verification status
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="text-6xl mb-6">✓</div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Verification Complete!
              </h1>
              <p className="text-muted-foreground mb-4">
                Your identity has been verified. You can now trade prediction markets.
              </p>
              <p className="text-sm text-primary">
                Redirecting to dashboard...
              </p>
            </>
          )}

          {status === "failed" && (
            <>
              <div className="text-6xl mb-6">⚠️</div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Verification Incomplete
              </h1>
              <p className="text-muted-foreground mb-6">
                Your identity verification was not completed. Please try again.
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="text-primary hover:text-primary/80 underline"
              >
                Return to Dashboard
              </button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
