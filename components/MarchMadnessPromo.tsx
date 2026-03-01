"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface Team {
  name: string;
  value: string;
}

export function MarchMadnessPromo() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available teams on mount
  useEffect(() => {
    fetch("/api/promo/march-madness")
      .then(res => res.json())
      .then(data => {
        if (data.teams) {
          setTeams(data.teams);
          if (data.teams.length > 0) {
            setSelectedTeam(data.teams[0].value);
          }
        }
      })
      .catch(err => console.error("Failed to load teams:", err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/promo/march-madness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail,
          senderName,
          teamTicker: selectedTeam,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send gift");
      }

      setSuccess(true);
      setRecipientEmail("");
      setSenderName("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto max-w-xl rounded-2xl border border-primary/20 bg-card/80 backdrop-blur-sm p-6 text-center"
      >
        <div className="text-4xl mb-3">🎉</div>
        <h3 className="text-xl font-bold text-foreground mb-2">Gift Sent!</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Your friend will receive an email with their NBA Finals prediction gift.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSuccess(false)}
        >
          Send Another
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="mx-auto max-w-xl rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-card/80 to-primary/10 backdrop-blur-sm p-6"
    >
      <div className="text-center mb-5">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent mb-3">
          <span>🏀</span> FREE GIFT
        </div>
        <h3 className="text-lg font-bold text-foreground">
          Send a friend $1 on the NBA Finals
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a team, enter their email, and we&apos;ll send them a free prediction
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Your name"
            required
            className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="Friend's email"
            required
            className="w-full px-4 py-2.5 bg-background/50 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>

        <div className="flex gap-3">
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-background/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition appearance-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px', paddingRight: '40px' }}
          >
            {teams.map((team) => (
              <option key={team.value} value={team.value}>
                {team.name} to win
              </option>
            ))}
          </select>

          <Button
            type="submit"
            disabled={loading || !recipientEmail || !senderName}
            className="px-6 bg-gradient-brand"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Send Free Gift"
            )}
          </Button>
        </div>

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}

        <p className="text-[10px] text-muted-foreground text-center">
          Limited time promotion · One per recipient · Powered by Kalshi
        </p>
      </form>
    </motion.div>
  );
}
