import { NeteaseClient } from "./netease-client";

export class NeteaseLyricProvider {
  constructor(private readonly client = new NeteaseClient()) {}

  async getLyric(songId: string, cookie: string) {
    return this.client.getLyrics(songId, cookie);
  }
}
