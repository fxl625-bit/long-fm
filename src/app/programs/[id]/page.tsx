import { notFound, redirect } from "next/navigation";
import { AuroraBackground } from "@/components/layout/aurora-background";
import { TopNav } from "@/components/layout/top-nav";
import { ResumeProgramButton } from "@/components/radio/resume-program-button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveCurrentUser } from "@/lib/actions/session";
import { getProgramById } from "@/lib/repositories/radio-program-repository";

type ProgramSection = "opening" | "middle" | "ending";

const sectionMeta: Record<ProgramSection, { title: string; hint: string }> = {
  opening: { title: "开场", hint: "先进入状态，建立这一期的节奏底色" },
  middle: { title: "中段", hint: "情绪推进与重心段" },
  ending: { title: "收尾", hint: "回收并留出余韵" },
};

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await resolveCurrentUser();
  if (!user) {
    redirect("/");
  }

  const { id } = await params;
  const program = await getProgramById(id);
  if (!program || program.userId !== user.id) {
    notFound();
  }

  const metadata = (program.programJson as Record<string, unknown>) ?? {};

  const sectionTracks: Record<ProgramSection, typeof program.tracks> = {
    opening: [],
    middle: [],
    ending: [],
  };

  for (const item of program.tracks) {
    if (item.section === "opening") {
      sectionTracks.opening.push(item);
      continue;
    }
    if (item.section === "settle" || item.section === "outro") {
      sectionTracks.ending.push(item);
      continue;
    }
    sectionTracks.middle.push(item);
  }

  if (!sectionTracks.opening.length && sectionTracks.middle.length) {
    sectionTracks.opening.push(sectionTracks.middle.shift()!);
  }
  if (!sectionTracks.ending.length && sectionTracks.middle.length > 1) {
    sectionTracks.ending.unshift(sectionTracks.middle.pop()!);
  }

  return (
    <AuroraBackground>
      <TopNav />
      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 pb-16">
        <section>
          <Card className="border-white/15 bg-white/[0.06]">
            <CardContent className="space-y-5 p-7 md:p-10">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/85">Program Detail</p>
              <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 md:text-5xl">{program.title}</h1>
              <p className="text-xl text-zinc-200">{program.subtitle}</p>
              <p className="text-base leading-relaxed text-zinc-300">{String(metadata.vibeDescription ?? "一组有起承转合的私人节目队列。")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <ResumeProgramButton programId={program.id} />
                <p className="text-xs text-zinc-500">{new Date(program.createdAt).toLocaleString("zh-CN")}</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {(Object.keys(sectionTracks) as ProgramSection[]).map((key) => (
          <section key={key} className="space-y-3">
            <div className="space-y-1 px-1">
              <h2 className="text-2xl font-semibold text-zinc-100">{sectionMeta[key].title}</h2>
              <p className="text-sm text-zinc-400">{sectionMeta[key].hint}</p>
            </div>

            <Card className="bg-white/[0.04]">
              <CardContent className="space-y-4 p-6 md:p-7">
                {sectionTracks[key].length ? (
                  sectionTracks[key].map((item, index) => (
                    <article key={item.id} className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-sm text-zinc-100">
                        {index + 1}. {item.track.name} · {item.track.artist}
                      </p>
                      <p className="text-sm leading-relaxed text-zinc-300">{item.reasonText}</p>
                      <p className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm leading-relaxed text-cyan-100/90">
                        {item.transitionText}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">这一段暂无内容。</p>
                )}
              </CardContent>
            </Card>
          </section>
        ))}

        <section>
          <Card className="bg-white/[0.04]">
            <CardContent className="space-y-3 p-6 md:p-8">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">结束语</p>
              <p className="text-sm leading-relaxed text-zinc-200">{program.outroText}</p>
              <p className="text-xs text-zinc-500">{String(metadata.arrangementLogic ?? "开场进入、情绪铺垫、中段抬升、后段回收、结尾余韵。")}</p>
            </CardContent>
          </Card>
        </section>
      </main>
    </AuroraBackground>
  );
}
export const dynamic = "force-dynamic";
