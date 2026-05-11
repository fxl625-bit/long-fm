"use client";

import { QUICK_SCENES } from "@/lib/constants/product";

type Props = {
  onSelect: (scene: string) => void;
};

const scenePromptMap: Record<(typeof QUICK_SCENES)[number], string> = {
  通勤: "给我一组通勤队列，稳定推进，别太炸。",
  专注: "我要专注做事，低打扰但有一点流动感。",
  放松: "今天想放松一点，柔和但不无聊。",
  开车: "做一组开车可连播的节目，保持路感。",
  想怀旧: "来一组更怀旧的，最好有 2000s 质感。",
  想提神: "帮我提提神，节奏上来一点但别吵。",
};

export function QuickScenes({ onSelect }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {QUICK_SCENES.map((scene) => (
        <button
          key={scene}
          type="button"
          onClick={() => onSelect(scenePromptMap[scene])}
          className="rounded-full px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
          {scene}
        </button>
      ))}
    </div>
  );
}
