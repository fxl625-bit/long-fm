"use client";

import Link from "next/link";
import { Clock3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type ProgramItem = {
  id: string;
  title: string;
  subtitle: string | null;
  createdAt: string;
};

export function RecentPrograms({ programs }: { programs: ProgramItem[] }) {
  return (
    <Card className="mx-auto w-full max-w-4xl bg-white/[0.04]">
      <CardContent className="space-y-4 p-6 md:p-8">
        <p className="text-sm text-zinc-400">历史记录</p>
        {programs.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {programs.map((program) => (
              <Link
                key={program.id}
                href={`/programs/${program.id}`}
                className="group rounded-2xl border border-white/10 bg-black/20 px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-cyan-300/6"
              >
                <p className="line-clamp-1 text-sm text-zinc-100">{program.title}</p>
                <p className="mt-1 line-clamp-1 text-xs text-zinc-400">{program.subtitle ?? "AI 私人节目"}</p>
                <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-500">
                  <Clock3 className="h-3 w-3" />
                  {new Date(program.createdAt).toLocaleString("zh-CN")}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">还没有历史节目。</p>
        )}
      </CardContent>
    </Card>
  );
}
