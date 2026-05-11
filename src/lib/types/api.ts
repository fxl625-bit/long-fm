import { z } from "zod";

export const syncRequestSchema = z.object({
  providerToken: z.string().optional(),
  mode: z.enum(["lx_music", "netease_official", "local", "demo", "netease_experimental", "generic_api"]).optional(),
});

export const importPlaylistSchema = z.object({
  playlistId: z.string().min(2),
  providerToken: z.string().optional(),
  mode: z.enum(["lx_music", "netease_official", "local", "demo", "netease_experimental", "generic_api"]).optional(),
});

export const generateProfileSchema = z.object({
  force: z.boolean().optional(),
});

export const generateProgramSchema = z.object({
  prompt: z.string().min(2),
  playlistId: z.string().optional(),
  desiredTrackCount: z.number().min(10).max(20).optional(),
  tweak: z
    .enum([
      "more_nostalgic",
      "less_sad",
      "more_rhythm",
      "more_female_vocal",
      "more_city_night",
      "more_chinese",
      "fit_work",
      "fit_drive",
    ])
    .optional(),
  styleId: z.string().optional(),
});

export const djTuneSchema = z.object({
  tweak: z.enum([
    "more_nostalgic",
    "less_sad",
    "more_rhythm",
    "more_female_vocal",
    "more_city_night",
    "more_chinese",
    "fit_work",
    "fit_drive",
  ]),
  prompt: z.string().min(2).optional(),
});

export const djScriptSchema = z.object({
  mode: z.enum(["opening", "transition", "manual"]).default("transition"),
  currentTrack: z.record(z.string(), z.unknown()).nullable(),
  nextTrack: z.record(z.string(), z.unknown()).nullable().optional(),
  queueReason: z.string().optional(),
  historyCount: z.number().int().nonnegative().optional(),
});

export const playbackSessionUpdateSchema = z.object({
  currentTrackId: z.string().optional(),
  queue: z
    .array(
      z.object({
        track: z.record(z.string(), z.unknown()),
        reason: z.string().optional(),
        section: z.enum(["opening", "build", "lift", "settle", "outro"]).optional(),
      }),
    )
    .default([]),
  currentIndex: z.number().int().nonnegative(),
  currentTime: z.number().int().nonnegative(),
  isPlaying: z.boolean(),
  volume: z.number().min(0).max(1),
  source: z.enum(["NETEASE_OFFICIAL", "DEMO", "LOCAL", "PUBLIC", "NETEASE_EXPERIMENTAL", "GENERIC_API"]),
});
