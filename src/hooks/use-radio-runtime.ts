"use client";

import { useContext, useMemo, useSyncExternalStore } from "react";
import { RadioRuntimeContext } from "@/components/radio/radio-runtime-provider";

export function useRadioRuntime() {
  const runtime = useContext(RadioRuntimeContext);
  if (!runtime) {
    throw new Error("useRadioRuntime must be used inside RadioRuntimeProvider.");
  }

  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getServerSnapshot,
  );

  const debug = runtime.getDebugState();
  const actions = useMemo(
    () => ({
      prepareSession: (playlistId?: string) => runtime.prepareSession(playlistId),
      startSessionFromUserGesture: (startedFrom?: "home_entry_click" | "direct_radio_click" | "unknown") =>
        runtime.startSessionFromUserGesture(startedFrom),
      primeAudio: () => runtime.primeAudio(),
      markRoutePush: () => runtime.markRoutePush(),
      play: () => runtime.play(),
      pause: () => runtime.pause(),
      nextTrack: () => runtime.next(),
      previousTrack: () => runtime.previous(),
      playTrack: (index: number) => runtime.playTrack(index),
      refreshProgram: () => runtime.refreshProgram(),
      tuneByPrompt: (prompt: string) => runtime.tuneByPrompt(prompt),
      applyDJDecision: (decision: Parameters<typeof runtime.applyDJDecision>[0]) => runtime.applyDJDecision(decision),
      replaceUpcomingTracks: (trackIds: string[]) => runtime.replaceUpcomingTracks(trackIds),
      insertAfterCurrent: (trackIds: string[]) => runtime.insertAfterCurrent(trackIds),
      reorderUpcoming: (trackIds: string[]) => runtime.reorderUpcoming(trackIds),
      seek: (timeMs: number) => runtime.seek(timeMs),
      setVolume: (volume: number) => runtime.setVolume(volume),
      createQRCode: () => runtime.createQRCode(),
      pollQRCode: (qrKey?: string) => runtime.pollQRCode(qrKey),
      refreshNeteaseStatus: () => runtime.refreshStatus({ prepare: true }),
      speakDJ: (lines: string | string[]) => runtime.speakDJ(lines),
      testDJSpeakPipeline: (event: "opening" | "track_intro" | "bridge" | "user_tune" | "outro" | "manual_test") =>
        runtime.testDJSpeakPipeline(event),
      duckMusic: () => runtime.duckMusic(),
      restoreMusic: () => runtime.restoreMusic(),
      enterChannel: () => runtime.startSessionFromUserGesture("direct_radio_click"),
      resume: () => runtime.play(),
    }),
    [runtime],
  );

  return {
    runtime,
    session: snapshot,
    state: snapshot.radio,
    netease: snapshot.netease,
    debug,
    actions,
  };
}
