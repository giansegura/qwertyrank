import Link from "next/link";

export function AdminNav() {
  return (
    <nav className="flex gap-6 border-b border-zinc-200 pb-3 text-sm dark:border-zinc-800">
      <Link href="/admin" className="font-semibold">
        Moderación
      </Link>
      <Link href="/admin/players">Jugadores</Link>
    </nav>
  );
}
