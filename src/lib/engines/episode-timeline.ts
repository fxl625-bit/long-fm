import type { PlaybackQueueItem } from "@/lib/types/music";

export type EpisodeTimelineItem =
  | { id: string; type: "dj_intro"; mode: "opening" }
  | { id: string; type: "track"; trackIndex: number; trackId: string }
  | { id: string; type: "dj_bridge"; mode: "transition"; beforeTrackIndex: number }
  | { id: string; type: "dj_outro"; mode: "manual" };

export function buildEpisodeTimeline(queue: PlaybackQueueItem[], bridgeEvery = 2): EpisodeTimelineItem[] {
  const timeline: EpisodeTimelineItem[] = [{ id: "intro", type: "dj_intro", mode: "opening" }];
  const insertedBridgeBefore = new Set<number>();
  const bridgeGap = Math.max(1, bridgeEvery);

  for (let index = 0; index < queue.length; index += 1) {
    const sectionChanged = index > 0 && queue[index - 1]?.section && queue[index]?.section && queue[index - 1]?.section !== queue[index]?.section;
    const hitGap = index > 0 && index % bridgeGap === 0;
    if (index > 0 && (sectionChanged || hitGap) && !insertedBridgeBefore.has(index)) {
      insertedBridgeBefore.add(index);
      timeline.push({
        id: `bridge-before-${index}`,
        type: "dj_bridge",
        mode: "transition",
        beforeTrackIndex: index,
      });
    }

    timeline.push({
      id: `track-${index}`,
      type: "track",
      trackIndex: index,
      trackId: queue[index].track.id,
    });
  }

  timeline.push({ id: "outro", type: "dj_outro", mode: "manual" });
  return timeline;
}
