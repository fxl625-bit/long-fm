import type { LXPlayerStatus } from "@/lib/types/music";
import type { LXRawPlayerStatus, LXStatusSubscription } from "./lx-music-types";

export function createLXStatusSubscription(
  url: string,
  mapStatus: (payload: LXRawPlayerStatus) => LXPlayerStatus,
  onUpdate: (status: LXPlayerStatus) => void,
  onError?: () => void,
): LXStatusSubscription {
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const raw = JSON.parse(event.data) as LXRawPlayerStatus;
      onUpdate(mapStatus(raw));
    } catch {
      onError?.();
    }
  };

  eventSource.onerror = () => {
    onError?.();
    eventSource.close();
  };

  return {
    close: () => eventSource.close(),
  };
}
