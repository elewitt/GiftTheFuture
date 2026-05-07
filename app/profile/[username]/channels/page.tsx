"use client";

import { useState, useEffect, use } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Navbar } from "@/components/Navbar";
import { ProfileHeader, ProfileTabs } from "@/components/profile";
import { ChannelCard, CreateChannelModal } from "@/components/channel";
import { Button } from "@/components/ui/button";

interface ChannelsPageProps {
  params: Promise<{ username: string }>;
}

export default function ChannelsPage({ params }: ChannelsPageProps) {
  const { username } = use(params);
  const { user } = usePrivy();

  const [profile, setProfile] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch profile
        const profileRes = await fetch(`/api/users/${username}`, {
          headers: user?.id ? { "X-Privy-Id": user.id } : {},
        });

        if (!profileRes.ok) {
          if (profileRes.status === 404) {
            setError("User not found");
          } else {
            throw new Error("Failed to fetch profile");
          }
          return;
        }

        const profileData = await profileRes.json();
        setProfile(profileData);

        // Fetch channels
        const channelsRes = await fetch(`/api/channels?userId=${profileData.id}`, {
          headers: user?.id ? { "X-Privy-Id": user.id } : {},
        });

        if (channelsRes.ok) {
          const channelsData = await channelsRes.json();
          setChannels(channelsData.channels);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [username, user?.id]);

  const handleChannelCreated = (channel: any) => {
    setChannels((prev) => [channel, ...prev]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-20">
          <div className="max-w-2xl mx-auto px-4 text-center py-20">
            <h2 className="text-lg font-semibold text-foreground mb-2">{error}</h2>
            <Button variant="secondary" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-20">
        <div className="max-w-2xl mx-auto px-4">
          {/* Profile header */}
          <div className="rounded-2xl bg-card border border-border overflow-hidden mb-6">
            <ProfileHeader {...profile} onEditProfile={() => {}} />
            <ProfileTabs username={username} activeTab="channels" />
          </div>

          {/* Create channel button (only for own profile) */}
          {profile.isOwnProfile && (
            <div className="mb-6">
              <Button onClick={() => setShowCreateModal(true)} className="w-full">
                Create Premium Channel
              </Button>
            </div>
          )}

          {/* Channels */}
          <div className="space-y-4">
            {channels.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <p className="text-muted-foreground mb-4">No channels yet</p>
                {profile.isOwnProfile && (
                  <Button onClick={() => setShowCreateModal(true)}>
                    Create Your First Channel
                  </Button>
                )}
              </div>
            ) : (
              channels.map((channel) => (
                <ChannelCard key={channel.id} {...channel} />
              ))
            )}
          </div>
        </div>
      </main>

      {/* Create channel modal */}
      <CreateChannelModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleChannelCreated}
      />
    </div>
  );
}
