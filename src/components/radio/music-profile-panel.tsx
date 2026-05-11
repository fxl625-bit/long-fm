import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MusicProfileStructured } from "@/lib/types/music";

type Props = {
  summaryText?: string;
  profile?: MusicProfileStructured;
};

export function MusicProfilePanel({ summaryText, profile }: Props) {
  return (
    <Card className="bg-white/[0.045]">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="text-base">你的音乐画像</CardTitle>
          <CardDescription>{summaryText ?? "生成画像后，这里会展示你的核心偏好标签。"}</CardDescription>
        </div>
        <Link href="/profile" className="text-xs text-zinc-500 transition-colors hover:text-cyan-200" aria-label="查看完整画像">
          完整画像
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">情绪</p>
          <div className="flex flex-wrap gap-2">
            {(profile?.moods ?? ["待分析"]).slice(0, 4).map((item) => (
              <Badge key={item}>{item}</Badge>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">场景</p>
          <div className="flex flex-wrap gap-2">
            {(profile?.scenes ?? ["待分析"]).slice(0, 4).map((item) => (
              <Badge key={item} variant="muted">
                {item}
              </Badge>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">关键词</p>
          <div className="flex flex-wrap gap-2">
            {(profile?.keywords ?? ["待分析"]).slice(0, 4).map((item) => (
              <Badge key={item} variant="accent">
                {item}
              </Badge>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
