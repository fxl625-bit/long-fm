export type LXRawPlayerStatus = {
  status?: string;
  name?: string;
  singer?: string;
  albumName?: string;
  duration?: number;
  progress?: number;
  playbackRate?: number;
  picUrl?: string;
  lyricLineText?: string;
  lyric?: string;
  volume?: number;
  mute?: boolean;
};

export type LXStatusSubscription = {
  close: () => void;
};
