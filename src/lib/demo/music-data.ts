import type { MusicPlaylist, MusicTrack, MusicUserProfile, PlaylistDetail } from "@/lib/types/music";

const demoAudioUrls = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3",
];

const demoCoverUrls = [
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=80",
  "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=500&q=80",
  "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=500&q=80",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=500&q=80",
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=500&q=80",
  "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=500&q=80",
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=500&q=80",
  "https://images.unsplash.com/photo-1496293455970-f8581aae0e3b?auto=format&fit=crop&w=500&q=80",
];

export const demoUser: MusicUserProfile = {
  id: "demo-user-001",
  nickname: "Flowmate Demo 用户",
  avatar: "https://images.unsplash.com/photo-1542204625-de293a06df69?auto=format&fit=crop&w=300&q=80",
};

const trackSeed: Array<Omit<MusicTrack, "audioUrl" | "externalUrl" | "sourceType" | "playableStatus" | "durationMs">> = [
  {
    id: "t001",
    name: "立交桥风景",
    artist: "林川",
    album: "城市缓流",
    duration: 238000,
    language: "中文",
    era: "2010s",
    moodTags: ["城市感", "通勤", "平稳"],
    styleTags: ["Indie Pop", "City Pop"],
    energyLevel: "medium-low",
    playCount: 52,
    releasedYear: 2016,
  },
  {
    id: "t002",
    name: "Clear Morning",
    artist: "Mile North",
    album: "Office Window",
    duration: 221000,
    language: "英文",
    era: "2020s",
    moodTags: ["提神", "通勤"],
    styleTags: ["Alternative", "Electronic Pop"],
    energyLevel: "medium",
    playCount: 44,
    releasedYear: 2021,
  },
  {
    id: "t003",
    name: "慢行街角",
    artist: "白柠",
    album: "雨后的城市",
    duration: 242000,
    language: "中文",
    era: "2020s",
    moodTags: ["放松", "克制", "独处"],
    styleTags: ["Lo-fi", "Indie"],
    energyLevel: "low",
    playCount: 40,
    releasedYear: 2022,
  },
  {
    id: "t004",
    name: "Blue Metro",
    artist: "Nora Line",
    album: "Window Seat",
    duration: 232000,
    language: "英文",
    era: "2000s",
    moodTags: ["怀旧", "流动感"],
    styleTags: ["R&B", "Neo Soul"],
    energyLevel: "medium-low",
    playCount: 58,
    releasedYear: 2008,
  },
  {
    id: "t005",
    name: "旧磁带回放",
    artist: "陈向北",
    album: "1999",
    duration: 265000,
    language: "中文",
    era: "2000s",
    moodTags: ["怀旧", "温和"],
    styleTags: ["流行", "民谣"],
    energyLevel: "medium-low",
    playCount: 63,
    releasedYear: 2003,
  },
  {
    id: "t006",
    name: "Paper Lamp",
    artist: "June Harbor",
    album: "Draft Stories",
    duration: 214000,
    language: "英文",
    era: "2020s",
    moodTags: ["专注", "安静"],
    styleTags: ["Acoustic", "Folk"],
    energyLevel: "low",
    playCount: 37,
    releasedYear: 2023,
  },
  {
    id: "t007",
    name: "凌晨之前",
    artist: "李千语",
    album: "灯塔背面",
    duration: 243000,
    language: "中文",
    era: "2010s",
    moodTags: ["克制", "独处"],
    styleTags: ["另类流行"],
    energyLevel: "medium-low",
    playCount: 41,
    releasedYear: 2018,
  },
  {
    id: "t008",
    name: "Night Shift Sun",
    artist: "June Harbor",
    album: "Draft Stories",
    duration: 218000,
    language: "英文",
    era: "2020s",
    moodTags: ["加班", "提神"],
    styleTags: ["Indie Pop", "Electronic"],
    energyLevel: "medium-high",
    playCount: 35,
    releasedYear: 2023,
  },
  {
    id: "t009",
    name: "南方小雨",
    artist: "许可念",
    album: "星期天留白",
    duration: 226000,
    language: "中文",
    era: "2020s",
    moodTags: ["放松", "治愈"],
    styleTags: ["民谣", "轻电子"],
    energyLevel: "low",
    playCount: 32,
    releasedYear: 2024,
  },
  {
    id: "t010",
    name: "Quiet Avenue",
    artist: "Nora Line",
    album: "Window Seat",
    duration: 229000,
    language: "英文",
    era: "2010s",
    moodTags: ["通勤", "平静"],
    styleTags: ["Neo Soul"],
    energyLevel: "medium-low",
    playCount: 30,
    releasedYear: 2011,
  },
  {
    id: "t011",
    name: "写信的人",
    artist: "李千语",
    album: "灯塔背面",
    duration: 242000,
    language: "中文",
    era: "2010s",
    moodTags: ["专注", "留白"],
    styleTags: ["另类流行", "Acoustic"],
    energyLevel: "low",
    playCount: 31,
    releasedYear: 2018,
  },
  {
    id: "t012",
    name: "Monochrome Taxi",
    artist: "Mile North",
    album: "City Exit",
    duration: 236000,
    language: "英文",
    era: "2000s",
    moodTags: ["开车", "怀旧"],
    styleTags: ["Alternative", "Pop Rock"],
    energyLevel: "medium",
    playCount: 49,
    releasedYear: 2005,
  },
];

const demoTracks: MusicTrack[] = trackSeed.map((track, index) => {
  const audioUrl = demoAudioUrls[index];
  const playable = Boolean(audioUrl);

  return {
    ...track,
    durationMs: track.duration,
    coverUrl: demoCoverUrls[index % demoCoverUrls.length],
    audioUrl: playable ? audioUrl : undefined,
    externalUrl: undefined,
    sourceType: "DEMO",
    playableStatus: playable ? "playable" : "metadata_only",
  };
});

const playlists: MusicPlaylist[] = [
  {
    id: "p-liked",
    name: "我喜欢的音乐",
    description: "个人高频收藏",
    isLikedPlaylist: true,
    trackCount: demoTracks.length,
  },
  {
    id: "p-commute",
    name: "通勤节奏",
    description: "稳定推进，不抢注意力",
    trackCount: 8,
  },
  {
    id: "p-memory",
    name: "2000s 记忆层",
    description: "偏怀旧的颗粒感队列",
    trackCount: 7,
  },
];

const playlistTracks: Record<string, string[]> = {
  "p-liked": demoTracks.map((track) => track.id),
  "p-commute": ["t001", "t002", "t010", "t008", "t012", "t004", "t003", "t009"],
  "p-memory": ["t005", "t004", "t012", "t007", "t010", "t009", "t003"],
};

export function getDemoPlaylists(): MusicPlaylist[] {
  return playlists;
}

export function getDemoTracks(): MusicTrack[] {
  return demoTracks;
}

export function getDemoPlaylistDetail(playlistId: string): PlaylistDetail | null {
  const playlist = playlists.find((item) => item.id === playlistId);
  if (!playlist) {
    return null;
  }

  const tracks = (playlistTracks[playlistId] ?? [])
    .map((id) => demoTracks.find((track) => track.id === id))
    .filter((item): item is MusicTrack => Boolean(item));

  return {
    ...playlist,
    tracks,
  };
}

export function searchDemoTracks(query: string): MusicTrack[] {
  const normalized = query.toLowerCase();
  return demoTracks.filter((track) => `${track.name} ${track.artist} ${track.album ?? ""}`.toLowerCase().includes(normalized));
}

export function getDemoTrack(trackId: string): MusicTrack | null {
  return demoTracks.find((track) => track.id === trackId) ?? null;
}
