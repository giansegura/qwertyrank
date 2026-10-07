"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { profileFromJson, type ProfileJson, type PublicProfile } from "@/lib/profile";
import { getViewer } from "@/lib/viewer";
import { ProfileView } from "./profile-view";

/**
 * Dentro de la 404 de un perfil (spec 4a §6.2): si el nick de la URL es el del propio jugador (con
 * shadow-ban o ban su perfil no es público), le enseña el suyo. A los demás, la 404 de siempre.
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
