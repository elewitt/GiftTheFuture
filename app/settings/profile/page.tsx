"use client";

import { useState, useEffect } from "react";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

export default function ProfileSettingsPage() {
  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();
  const router = useRouter();

  const [profile, setProfile] = useState({
    username: "",
    displayName: "",
    bio: "",
    avatarUrl: "",
    twitterHandle: "",
    instagramHandle: "",
    tiktokHandle: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      setLoading(false);
      return;
    }

    async function fetchProfile() {
      try {
        const res = await fetch("/api/users/me", {
          headers: { "X-Privy-Id": user?.id || "" },
        });

        if (res.ok) {
          const data = await res.json();
          setProfile({
            username: data.username || "",
            displayName: data.displayName || "",
            bio: data.bio || "",
            avatarUrl: data.avatarUrl || "",
            twitterHandle: data.twitterHandle || "",
            instagramHandle: data.instagramHandle || "",
            tiktokHandle: data.tiktokHandle || "",
          });
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [ready, authenticated, user?.id]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "X-Privy-Id": user?.id || "" },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setProfile((prev) => ({ ...prev, avatarUrl: data.url }));
    } catch (err: any) {
      setError(err.message || "Failed to upload avatar");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Privy-Id": user?.id || "",
        },
        body: JSON.stringify({
          username: profile.username.trim() || null,
          displayName: profile.displayName.trim() || null,
          bio: profile.bio.trim() || null,
          avatarUrl: profile.avatarUrl || null,
          twitterHandle: profile.twitterHandle.trim() || null,
          instagramHandle: profile.instagramHandle.trim() || null,
          tiktokHandle: profile.tiktokHandle.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update profile");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-20">
          <div className="max-w-md mx-auto px-4 text-center py-20">
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
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Sign in to edit your profile
            </h2>
            <Button onClick={login}>Sign In</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-20">
        <div className="max-w-md mx-auto px-4">
          <h1 className="text-2xl font-bold text-foreground mb-6">
            Profile Settings
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar */}
            <div className="text-center">
              <div className="relative w-24 h-24 mx-auto mb-3">
                <div className="w-full h-full rounded-full bg-secondary overflow-hidden">
                  {profile.avatarUrl ? (
                    <Image
                      src={profile.avatarUrl}
                      alt="Avatar"
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <svg
                        className="w-10 h-10"
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
                  )}
                </div>
                {isUploadingAvatar && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <label className="text-sm text-primary hover:underline cursor-pointer">
                Change avatar
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Username
              </label>
              <Input
                value={profile.username}
                onChange={(e) =>
                  setProfile((prev) => ({ ...prev, username: e.target.value }))
                }
                placeholder="username"
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground mt-1">
                3-20 characters, letters, numbers, and underscores only
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Display Name
              </label>
              <Input
                value={profile.displayName}
                onChange={(e) =>
                  setProfile((prev) => ({ ...prev, displayName: e.target.value }))
                }
                placeholder="Your display name"
                maxLength={50}
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Bio
              </label>
              <Textarea
                value={profile.bio}
                onChange={(e) =>
                  setProfile((prev) => ({ ...prev, bio: e.target.value }))
                }
                placeholder="Tell us about yourself..."
                maxLength={160}
                className="min-h-[100px]"
              />
              <div className="flex justify-end mt-1">
                <span className="text-xs text-muted-foreground">
                  {profile.bio.length}/160
                </span>
              </div>
            </div>

            {/* Social Links */}
            <div className="pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-foreground mb-4">Social Links</h3>

              {/* Twitter/X */}
              <div className="mb-4">
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  X (Twitter)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                  <Input
                    value={profile.twitterHandle}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, twitterHandle: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") }))
                    }
                    placeholder="username"
                    maxLength={15}
                    className="pl-7"
                  />
                </div>
              </div>

              {/* Instagram */}
              <div className="mb-4">
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                  Instagram
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                  <Input
                    value={profile.instagramHandle}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, instagramHandle: e.target.value.replace(/[^a-zA-Z0-9_.]/g, "") }))
                    }
                    placeholder="username"
                    maxLength={30}
                    className="pl-7"
                  />
                </div>
              </div>

              {/* TikTok */}
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
                  </svg>
                  TikTok
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                  <Input
                    value={profile.tiktokHandle}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, tiktokHandle: e.target.value.replace(/[^a-zA-Z0-9_.]/g, "") }))
                    }
                    placeholder="username"
                    maxLength={24}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="p-3 rounded-lg bg-yes/10 border border-yes/20">
                <p className="text-sm text-yes">Profile updated successfully!</p>
              </div>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
