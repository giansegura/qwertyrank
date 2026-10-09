"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { profileFromJson, type ProfileJson, type PublicProfile } from "@/lib/profile";
import { getViewer } from "@/lib/viewer";
import { ProfileView } from "./profile-view";

/**
 * Inside a profile's 404 (spec 4a §6.2): if the nick in the URL is the player's own (with a
 * shadow-ban or ban their profile is not public), shows them theirs. Everyone else gets the usual 404.
 */
export function OwnProfileFallback({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let nick: string;
    try {
      nick = decodeURIComponent(pathname?.split("/").at(-1) ?? "").toLowerCase();
    } catch {
      return;
    }
    let active = true;
    void (async () => {
      const viewer = await getViewer();
      if (!viewer || viewer.nick.toLowerCase() !== nick) return;
      const response = await fetch("/api/profile", { cache: "no-store" });
      if (active && response.ok) setProfile(profileFromJson((await response.json()) as ProfileJson));
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  return profile ? <ProfileView profile={profile} /> : children;
}
