"use client";

import { useState } from "react";
import Link from "next/link";

type Tab = "posts" | "likes" | "channels";

interface ProfileTabsProps {
  username: string;
  activeTab: Tab;
}

export function ProfileTabs({ username, activeTab }: ProfileTabsProps) {
  return (
    <div className="border-b border-border">
      <div className="flex gap-1 px-4">
        <TabLink
          href={`/profile/${username}`}
          active={activeTab === "posts"}
        >
          Posts
        </TabLink>
        <TabLink
          href={`/profile/${username}?tab=likes`}
          active={activeTab === "likes"}
        >
          Likes
        </TabLink>
        <TabLink
          href={`/profile/${username}/channels`}
          active={activeTab === "channels"}
        >
          Channels
        </TabLink>
      </div>
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {children}
    </Link>
  );
}
