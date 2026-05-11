import Link from "next/link";
import { Music2, Radio } from "lucide-react";
import { AuroraBackground } from "@/components/layout/aurora-background";
import { TopNav } from "@/components/layout/top-nav";
import { VoiceSelector } from "@/components/radio/voice-selector";

export default function MusicPage() {
  return (
    <AuroraBackground>
      <TopNav />
      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 pb-14">
        <section className="rounded-[28px] border border-white/10 bg-black/20 p-6 text-zinc-100">
          <div className="flex items-center gap-3">
            <Music2 className="h-5 w-5 text-cyan-300" />
            <h1 className="text-2xl font-semibold">Music</h1>
          </div>
          <p className="mt-3 max-w-[680px] text-sm leading-7 text-zinc-300">
            这里放 AI 电台的声音入口。你可以直接回到正在播放的频道，也可以先切主持人声音。
          </p>
          <div className="mt-5 flex gap-3">
            <Link href="/radio" className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-50 px-4 text-sm font-semibold text-zinc-950">
              打开电台
            </Link>
            <Link href="/" className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-4 text-sm text-zinc-200">
              回到 Home
            </Link>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-zinc-300">
          <div className="flex items-center gap-3 text-zinc-100">
            <Radio className="h-5 w-5 text-emerald-300" />
            <h2 className="text-lg font-semibold">主持人声音</h2>
          </div>
          <VoiceSelector />
        </section>
      </main>
    </AuroraBackground>
  );
}
