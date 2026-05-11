export type ExternalMusicFact = {
  type: "musicbrainz" | "wikipedia" | "manual_cache";
  content: string;
  confidence: "high" | "medium" | "low";
};

export type ExternalMusicFactsProvider = {
  getFacts(input: {
    providerTrackId: string;
    title: string;
    artist: string;
    album?: string;
  }): Promise<ExternalMusicFact[]>;
};

export class NullExternalMusicFactsProvider implements ExternalMusicFactsProvider {
  async getFacts() {
    return [];
  }
}
