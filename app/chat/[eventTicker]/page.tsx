"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  positionSide: string;
  positionValue: number;
}

interface VerificationResult {
  verified: boolean;
  position?: {
    side: string;
    value: number;
    ticker: string;
  };
  error?: string;
}

export default function ChatPage() {
  const params = useParams();
  const eventTicker = params.eventTicker as string;

  const { ready, authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();

  // Get the embedded Solana wallet address
  const walletAddress = useMemo(() => {
    const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
    return wallet?.address;
  }, [wallets]);

  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate chat room title from eventTicker
  // This is an event-wide chat, so title should reflect all predictions (not a specific team)
  useEffect(() => {
    if (eventTicker) {
      // Try to fetch a market to extract the event name
      fetch(`/api/markets?q=${encodeURIComponent(eventTicker)}&limit=1`)
        .then(r => r.json())
        .then(data => {
          if (data.markets?.[0]?.title) {
            // Extract the event name from title like "Will X win the 2026 Pro Basketball Finals?"
            const title = data.markets[0].title;
            const eventMatch = title.match(/(?:the\s+)?(\d{4}\s+(?:Pro\s+)?(?:Basketball|Football|Baseball|Hockey|Soccer)?\s*(?:Finals?|Championship|Super Bowl|World Series|Stanley Cup|March Madness))/i);
            if (eventMatch) {
              setChatTitle(`${eventMatch[1]} Chat`);
            } else {
              // Fallback: create title from eventTicker
              setChatTitle(generateEventTitle(eventTicker));
            }
          } else {
            setChatTitle(generateEventTitle(eventTicker));
          }
        })
        .catch(() => {
          setChatTitle(generateEventTitle(eventTicker));
        });
    }
  }, [eventTicker]);

  // Generate a friendly event title from ticker
  function generateEventTitle(ticker: string): string {
    const t = ticker.toUpperCase();

    // NBA Finals
    if (t.includes("NBA")) {
      const yearMatch = t.match(/(\d{2,4})/);
      const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : "";
      return `${year} NBA Finals Chat`;
    }

    // NFL / Super Bowl
    if (t.includes("NFL") || t.includes("SB")) {
      const yearMatch = t.match(/(\d{2,4})/);
      const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : "";
      return `${year} Super Bowl Chat`;
    }

    // March Madness
    if (t.includes("MARMAD") || t.includes("NCAA")) {
      const yearMatch = t.match(/(\d{2,4})/);
      const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : "";
      return `${year} March Madness Chat`;
    }

    // Fallback: clean up ticker
    return ticker.replace(/-/g, " ").replace(/KX/gi, "").trim() + " Chat";
  }

  // Verify wallet position
  const verifyPosition = useCallback(async () => {
    if (!walletAddress || !eventTicker) return;

    setVerifying(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(eventTicker)}/verify?wallet=${walletAddress}`
      );
      const data: VerificationResult = await res.json();
      setVerification(data);

      if (!data.verified) {
        setError(data.error || "Verification failed");
      }
    } catch (err: any) {
      setError(err.message || "Verification failed");
      setVerification({ verified: false });
    } finally {
      setVerifying(false);
    }
  }, [walletAddress, eventTicker]);

  // Verify on mount when wallet is available
  useEffect(() => {
    if (ready && authenticated && walletAddress) {
      verifyPosition();
    }
  }, [ready, authenticated, walletAddress, verifyPosition]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!eventTicker) return;

    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(eventTicker)}/messages`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  }, [eventTicker]);

  // Initial fetch and polling
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  const handleSend = async () => {
    if (!newMessage.trim() || !walletAddress || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(eventTicker)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: walletAddress,
          content: newMessage.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send message");
      }

      setNewMessage("");
      // Add new message immediately
      if (data.message) {
        setMessages(prev => [...prev, data.message]);
      }
      inputRef.current?.focus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  // Format time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Get position color based on side
  const getPositionColor = (side: string) => {
    const sideUpper = side.toUpperCase();
    if (sideUpper === "YES") return "text-green-500";
    if (sideUpper === "NO") return "text-red-500";
    // For multi-outcome, use a consistent color based on the string
    const hash = side.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
    const colors = [
      "text-blue-500",
      "text-purple-500",
      "text-amber-500",
      "text-cyan-500",
      "text-pink-500",
      "text-emerald-500",
    ];
    return colors[hash % colors.length];
  };

  // Determine if user can post (authenticated + verified)
  const canPost = ready && authenticated && verification?.verified;
  const isViewOnly = !canPost;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Header - fixed below navbar */}
      <div className="fixed top-16 left-0 right-0 border-b border-border bg-card/95 backdrop-blur-sm z-10">
        <div className="max-w-3xl mx-auto px-5 py-3">
          <div className="flex items-center justify-between">
            <Link
              href={`/market/${eventTicker}`}
              className="text-sm text-muted-foreground hover:text-foreground transition flex items-center gap-1"
            >
              <span>←</span> Back
            </Link>
            {canPost && verification?.position ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Your pick:</span>
                <span className={`text-xs font-semibold ${getPositionColor(verification.position.side)}`}>
                  {verification.position.side}
                </span>
                <span className="text-xs text-muted-foreground">
                  (${verification.position.value})
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View only
              </span>
            )}
          </div>
          <h1 className="text-lg font-bold text-foreground mt-2">
            {chatTitle || eventTicker}
          </h1>
        </div>
      </div>

      {/* Messages - add padding for fixed header */}
      <div className="flex-1 overflow-y-auto pt-28">
        <div className="max-w-3xl mx-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {canPost ? "No messages yet. Start the conversation!" : "No messages yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-card border border-border rounded-xl p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm font-semibold ${getPositionColor(msg.positionSide)}`}>
                        {msg.positionSide}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ${msg.positionValue}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                    <p className="text-foreground text-sm whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input / View-only banner */}
      <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
        <div className="max-w-3xl mx-auto">
          {canPost ? (
            <>
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-3">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}
              <div className="flex gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message..."
                  maxLength={500}
                  className="flex-1 px-4 py-3 bg-secondary border border-transparent rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition"
                />
                <Button
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  className="px-6"
                >
                  {sending ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "Send"
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Anonymous chat · Position verified on-chain · {messages.length} messages
              </p>
            </>
          ) : (
            <div className="text-center py-2">
              <div className="flex items-center justify-center gap-3 mb-2">
                <span className="text-muted-foreground text-sm">
                  {!ready || !authenticated
                    ? "Sign in and get a position to join the conversation"
                    : verifying
                      ? "Verifying your position..."
                      : "Get a position to join the conversation"
                  }
                </span>
              </div>
              <div className="flex gap-3 justify-center">
                {!ready || !authenticated ? (
                  <Button size="sm" onClick={() => window.location.reload()}>
                    Sign In
                  </Button>
                ) : verifying ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                    <span className="text-sm">Checking...</span>
                  </div>
                ) : (
                  <Link href={`/market/${eventTicker}`}>
                    <Button size="sm">Get a Position</Button>
                  </Link>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                {messages.length} messages · View only mode
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
