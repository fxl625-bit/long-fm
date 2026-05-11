import Link from "next/link";
import { FlaskConical, Radio } from "lucide-react";
import { AuroraBackground } from "@/components/layout/aurora-background";
import { TopNav } from "@/components/layout/top-nav";

export default function LabPage() {
  return (
    <AuroraBackground>
      <TopNav />
      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 pb-14">
        <section className="rounded-[28px] border border-white/10 bg-black/20 p-6 text-zinc-100">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-5 w-5 text-cyan-300" />
            <h1 className="text-2xl font-semibold">Lab</h1>
          </div>
          <p className="mt-3 max-w-[680px] text-sm leading-7 text-zinc-300">
            这里放电台实验功能和调试入口。主频道继续在后台跑，不会因为页面切换被销毁。
          </p>
          <div className="mt-5 flex gap-3">
            <Link href="/radio" className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-50 px-4 text-sm font-semibold text-zinc-950">
              回到电台
            </Link>
            <Link href="/music" className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-4 text-sm text-zinc-200">
              打开 Music
            </Link>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-zinc-300">
          <div className="flex items-center gap-3 text-zinc-100">
            <Radio className="h-5 w-5 text-emerald-300" />
            <h2 className="text-lg font-semibold">实验区占位</h2>
          </div>
          <p className="mt-3 text-sm leading-7">后续节目编排、调音和模型调试都可以继续收在这里，不会再让顶部导航跳空页。</p>
        </section>
      </main>
    </AuroraBackground>
  );
}
