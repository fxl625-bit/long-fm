import { Card, CardContent } from "@/components/ui/card";
import type { GeneratedProgram } from "@/lib/types/radio";

type Props = {
  program?: GeneratedProgram | null;
};

const sectionLabels: Record<GeneratedProgram["tracksDetailed"][number]["section"], string> = {
  opening: "开场",
  build: "铺垫",
  lift: "抬升",
  settle: "回收",
  outro: "收尾",
};

export function ProgramTrackList({ program }: Props) {
  if (!program) {
    return (
      <Card className="mx-auto w-full max-w-4xl bg-white/[0.045]">
        <CardContent className="space-y-3 p-6 md:p-8">
          <p className="text-xl text-zinc-100">你的节目会显示在这里</p>
          <p className="text-sm leading-relaxed text-zinc-400">生成后会看到标题、编排逻辑、每首歌入选理由和过门文案。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-4xl bg-white/[0.045]" data-program-loaded="true">
      <CardContent className="space-y-7 p-6 md:p-8">
        <header className="space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">{program.title}</h2>
          <p className="text-zinc-300">{program.subtitle}</p>
          <p className="text-sm leading-relaxed text-zinc-400">{program.vibeDescription}</p>
        </header>

        <section className="space-y-4">
          {program.tracksDetailed.map((item, index) => (
            <article key={`${item.track.id}-${index}`} className="space-y-2 border-b border-white/10 pb-4 last:border-none last:pb-0">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                {sectionLabels[item.section]} · {index + 1}
              </p>
              <p className="text-base text-zinc-100">
                {item.track.name} · {item.track.artist}
              </p>
              <p className="text-sm leading-relaxed text-zinc-300">{item.reason}</p>
              <p className="text-sm leading-relaxed text-cyan-100/80">{item.transition}</p>
            </article>
          ))}
        </section>
      </CardContent>
    </Card>
  );
}
