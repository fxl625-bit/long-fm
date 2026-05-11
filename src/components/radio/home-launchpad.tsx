"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/constants/product";

type ProgramItem = {
  id: string;
  title: string;
  subtitle: string | null;
  createdAt: string;
};

type Props = {
  programs: ProgramItem[];
};

export function HomeLaunchpad({ programs }: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  const onSubmit = () => {
    const trimmed = prompt.trim();
    if (trimmed) {
      router.push(`/?prompt=${encodeURIComponent(trimmed)}`);
      return;
    }
    router.push("/");
  };

  return (
    <section className="mx-auto flex min-h-[86vh] w-full max-w-4xl flex-col justify-center gap-10 py-6">
      <div className="space-y-4 text-center">
        <h1 className="text-5xl font-semibold tracking-tight text-zinc-50 md:text-6xl">{PRODUCT_NAME}</h1>
        <p className="mx-auto max-w-2xl text-base text-zinc-300 md:text-lg">{PRODUCT_TAGLINE}</p>
      </div>

      <div className="mx-auto w-full max-w-3xl rounded-[32px] border border-white/12 bg-white/[0.055] p-4 shadow-[0_40px_100px_-60px_rgba(0,0,0,0.9)] backdrop-blur-2xl md:p-5">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="h-14 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-base text-zinc-100 outline-none ring-cyan-300/60 placeholder:text-zinc-500 focus:ring"
            placeholder="比如：今天有点烦，给我一组不那么丧的歌。"
          />
          <Button size="lg" onClick={onSubmit} className="h-14 min-w-40">
            开始播放
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">最近节目</p>
        {programs.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {programs.slice(0, 4).map((program) => (
              <Link
                key={program.id}
                href={`/programs/${program.id}`}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 transition hover:border-white/20"
              >
                <p className="line-clamp-1 text-sm text-zinc-100">{program.title}</p>
                <p className="line-clamp-1 text-xs text-zinc-500">{program.subtitle ?? "节目详情"}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">还没有节目记录，先准备一组。</p>
        )}
      </div>
    </section>
  );
}
