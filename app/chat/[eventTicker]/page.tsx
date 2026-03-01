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
  const [marketTitle, setMarketTitle] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch market info
  useEffect(() => {
    if (eventTicker) {
      fetch(`/api/markets/${encodeURIComponent(eventTicker)}`)
        .then(res => res.json())
        .then(data => {
          if (data.market?.title) {
            setMarketTitle(data.market.title);
          }
        })
        .catch(() => {});
    }
  }, [eventTicker]);

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

  // Not authenticated
  if (ready && !authenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 max-w-2xl mx-auto px-5 text-center">
          <div className="text-6xl mb-6">💬</div>
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Token-Gated Chat
          </h1>
          <p className="text-muted-foreground mb-6">
            Sign in to join the conversation. You'll need to hold at least $1
            worth of a position in this market to participate.
          </p>
          <Button onClick={() => window.location.reload()}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  // Verifying
  if (verifying || !verification) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 max-w-2xl mx-auto px-5 text-center">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying your position...</p>
        </div>
      </div>
    );
  }

  // Not verified
  if (!verification.verified) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 max-w-2xl mx-auto px-5 text-center">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Access Restricted
          </h1>
          <p className="text-muted-foreground mb-6">
            {error || "You need to hold at least $1 worth of a position in this market to join the chat."}
          </p>
          <div className="flex gap-4 justify-center">
            <Link href={`/market/${eventTicker}`}>
              <Button>Get a Position</Button>
            </Link>
            <Link href="/">
              <Button variant="outline">Browse Markets</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Header */}
      <div className="pt-20 border-b border-border bg-card/50 backdrop-blur-sm sticky top-16 z-10">
        <div className="max-w-3xl mx-auto px-5 py-4">
          <Link
            href={`/market/${eventTicker}`}
            className="text-sm text-muted-foreground hover:text-foreground transition flex items-center gap-2 mb-2"
          >
            <span>←</span> Back to market
          </Link>
          <h1 className="text-xl font-bold text-foreground">
            {marketTitle || eventTicker}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">Your position:</span>
            <span className={`text-xs font-semibold ${getPositionColor(verification.position?.side || "")}`}>
              {verification.position?.side}
            </span>
            <span className="text-xs text-muted-foreground">
              (${verification.position?.value})
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
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

      {/* Input */}
      <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
        <div className="max-w-3xl mx-auto">
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
        </div>
      </div>
    </div>
  );
}
