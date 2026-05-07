"use client";

import { useState, useEffect, use } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Navbar } from "@/components/Navbar";
import { ProfileHeader, ProfileTabs, EditProfileModal } from "@/components/profile";
import { PostCard } from "@/components/feed/PostCard";
import { Button } from "@/components/ui/button";

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const { username } = use(params);
  const { user } = usePrivy();

  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch(`/api/users/${username}`, {
          headers: user?.id ? { "X-Privy-Id": user.id } : {},
        });

        if (!res.ok) {
          if (res.status === 404) {
            setError("User not found");
          } else {
            throw new Error("Failed to fetch profile");
          }
          return;
        }

        const data = await res.json();
        setProfile(data);

        // Fetch user's posts
        const postsRes = await fetch(`/api/feed?filter=all`, {
          headers: user?.id ? { "X-Privy-Id": user.id } : {},
        });

        if (postsRes.ok) {
          const postsData = await postsRes.json();
          // Filter posts by this user
          const userPosts = postsData.posts.filter(
            (p: any) => p.author.id === data.id
          );
          setPosts(userPosts);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [username, user?.id]);

  const handleProfileUpdate = (updatedData: any) => {
    setProfile((prev: any) => ({ ...prev, ...updatedData }));
  };

  const handlePostDeleted = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
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
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
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
            <ProfileHeader
              {...profile}
              onEditProfile={() => setShowEditModal(true)}
            />
            <ProfileTabs username={username} activeTab="posts" />
          </div>

          {/* Posts */}
          <div className="space-y-4">
            {posts.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">No posts yet</p>
              </div>
            ) : (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  {...post}
                  isOwnPost={profile.isOwnProfile}
                  onDelete={() => handlePostDeleted(post.id)}
                />
              ))
            )}
          </div>
        </div>
      </main>

      {/* Edit profile modal */}
      <EditProfileModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        initialData={{
          username: profile?.username,
          displayName: profile?.displayName,
          bio: profile?.bio,
          avatarUrl: profile?.avatarUrl,
          twitterHandle: profile?.twitterHandle,
          instagramHandle: profile?.instagramHandle,
          tiktokHandle: profile?.tiktokHandle,
        }}
        onSave={handleProfileUpdate}
      />
    </div>
  );
}
