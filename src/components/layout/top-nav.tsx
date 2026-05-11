import Link from "next/link";
import { Disc3 } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/constants/product";

export function TopNav() {
  return (
    <header className="relative z-50 mx-auto mb-6 flex w-full max-w-[1280px] items-center justify-between pt-2">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-100 transition hover:text-white">
        <Disc3 className="h-4 w-4 text-cyan-300" />
        {PRODUCT_NAME}
      </Link>

      <nav className="flex items-center gap-4 text-xs text-zinc-400">
        <Link href="/" className="transition hover:text-zinc-200">
          Home
        </Link>
        <Link href="/lab" className="transition hover:text-zinc-200">
          Lab
        </Link>
        <Link href="/music" className="transition hover:text-zinc-200">
          Music
        </Link>
      </nav>
    </header>
  );
}

export function CompactTopNav() {
  return (
    <nav className="relative z-50 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
      <Link href="/" className="pointer-events-auto transition hover:text-zinc-900">
        Home
      </Link>
      <Link href="/lab" className="pointer-events-auto transition hover:text-zinc-900">
        Lab
      </Link>
      <Link href="/music" className="pointer-events-auto transition hover:text-zinc-900">
        Music
      </Link>
    </nav>
  );
}
