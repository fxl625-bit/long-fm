import type { DJProgramPlan } from "@/lib/dj/dj-types";
import type { TimelineItem, Track } from "./radio-types";

export function buildRadioTimeline(queue: Track[], plan?: DJProgramPlan): TimelineItem[] {
  void plan;
  return queue.map((_, index) => ({
    type: "track",
    trackIndex: index,
  }));
}

export function getTimelineDjByTriggerIndex(timeline: TimelineItem[], trackIndex: number): string | null {
  const found = timeline.find((item) => item.type === "dj" && item.triggerTime === trackIndex);
  if (!found || found.type !== "dj") {
    return null;
  }
  return found.text;
}
