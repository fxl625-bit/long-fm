import { DeepSeekClient } from "@/lib/llm/deepseek-client";
import type { Track } from "@/lib/radio/radio-types";
import type { ExternalMusicFact } from "./external-music-facts";
import type { SongBrief } from "./song-brief-service";

type SongDetailData = {
  title?: string;
  artist?: string;
  album?: string;
  releaseDate?: string;
  releaseYear?: string;
  aliases?: string[];
  artistId?: string;
  albumId?: string;
  durationMs?: number;
};

type AlbumDetailData = {
  name?: string;
  releaseYear?: string;
  description?: string;
  style?: string;
};

type ArtistDetailData = {
  name?: string;
  knownFor?: string;
  style?: string;
  era?: string;
  shortBio?: string;
};

function buildSystemPrompt() {
  return [
    "你是音乐资料编辑，不是电台主持人。",
    "你的任务是把零散歌曲资料整理成可供电台主持人使用的音乐资料卡。",
    "只整理输入中出现的信息，不要编造发行背景。",
    "不确定的内容标记 low confidence。",
    "如果没有背景资料，就生成 soundProfile 和可讲听感。",
    "不要输出主持词。",
    "只输出 JSON。",
  ].join("\n");
}

function buildUserPrompt(input: {
  track: Track;
  baseBrief: SongBrief;
  songDetail: SongDetailData | null;
  albumDetail: AlbumDetailData | null;
  artistDetail: ArtistDetailData | null;
  lyric: string | null;
  externalFacts: ExternalMusicFact[];
}) {
  return JSON.stringify({
    track: {
      providerTrackId: input.baseBrief.providerTrackId,
      title: input.track.title,
      artist: input.track.artist,
      album: input.track.album,
      durationMs: input.track.durationMs,
    },
    baseBrief: input.baseBrief,
    songDetail: input.songDetail,
    albumDetail: input.albumDetail,
    artistDetail: input.artistDetail,
    lyricExcerpt: input.lyric ? input.lyric.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 4).join(" / ") : null,
    externalFacts: input.externalFacts,
    rules: [
      "只整理输入里已经出现的信息。",
      "不要编造歌手故事。",
      "如果资料不足，就保留 factsInsufficient=true。",
      "talkAngles 应该是给电台主持人用的资料角度，不是最终口播。",
    ],
  });
}

export class LLMSongBriefCurator {
  private readonly deepseekClient: Pick<DeepSeekClient, "chatJson" | "isConfigured">;

  constructor(input: { deepseekClient?: Pick<DeepSeekClient, "chatJson" | "isConfigured"> } = {}) {
    this.deepseekClient = input.deepseekClient ?? new DeepSeekClient();
  }

  async curate(input: {
    track: Track;
    baseBrief: SongBrief;
    songDetail: SongDetailData | null;
    albumDetail: AlbumDetailData | null;
    artistDetail: ArtistDetailData | null;
    lyric: string | null;
    externalFacts: ExternalMusicFact[];
  }): Promise<SongBrief> {
    if (!this.deepseekClient.isConfigured()) {
      return input.baseBrief;
    }

    const response = await this.deepseekClient.chatJson<SongBrief>({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(input),
      temperature: 0.25,
      maxTokens: 1400,
    });

    if (!response.ok || !response.data) {
      return input.baseBrief;
    }

    return {
      ...input.baseBrief,
      ...response.data,
      providerTrackId: input.baseBrief.providerTrackId,
      title: response.data.title || input.baseBrief.title,
      artist: response.data.artist || input.baseBrief.artist,
      album: response.data.album || input.baseBrief.album,
    };
  }
}
