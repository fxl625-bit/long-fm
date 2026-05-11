import { BarChart3, Disc3, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { AuroraBackground } from "@/components/layout/aurora-background";
import { TopNav } from "@/components/layout/top-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveCurrentUser } from "@/lib/actions/session";
import { getUserMusicProfile } from "@/lib/repositories/music-profile-repository";
import { fetchUserTracksFromDb } from "@/lib/repositories/music-sync-repository";
import { parseStructuredProfile } from "@/lib/utils/profile-json";

export default async function ProfilePage() {
  const user = await resolveCurrentUser();
  if (!user) {
    redirect("/");
  }

  const [profileRecord, tracks] = await Promise.all([getUserMusicProfile(user.id), fetchUserTracksFromDb(user.id)]);

  if (!profileRecord) {
    return (
      <AuroraBackground>
        <TopNav />
        <Card>
          <CardHeader>
            <CardTitle>还没有音乐画像</CardTitle>
            <CardDescription>先在首页准备一组节目，系统会自动构建画像。</CardDescription>
          </CardHeader>
        </Card>
      </AuroraBackground>
    );
  }

  const profile = parseStructuredProfile(profileRecord.structuredProfileJson);

  const artistStats = new Map<string, number>();
  for (const track of tracks) {
    artistStats.set(track.artist, (artistStats.get(track.artist) ?? 0) + 1);
  }

  const topArtists = Array.from(artistStats.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <AuroraBackground>
      <TopNav />
      <div className="mx-auto grid w-full max-w-[1080px] gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2 text-2xl">
              <Sparkles className="h-5 w-5 text-cyan-300" />
              你的音乐人格
            </CardTitle>
            <CardDescription>{profileRecord.summaryText}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <section className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">偏好标签</p>
              <div className="flex flex-wrap gap-2">
                {[...profile.moods, ...profile.keywords].slice(0, 12).map((item) => (
                  <Badge key={item}>{item}</Badge>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">场景倾向</p>
              <div className="grid gap-2 md:grid-cols-2">
                {profile.scenes.map((scene) => (
                  <div key={scene} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-200">
                    {scene}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">叙事偏好</p>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-zinc-200">
                {profile.narrativePreference}
              </div>
            </section>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <Disc3 className="h-4 w-4 text-cyan-300" />
                高频歌手
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topArtists.map(([artist, count]) => (
                  <div key={artist} className="rounded-2xl border border-white/10 bg-black/20 p-2">
                    <p className="text-sm text-zinc-100">{artist}</p>
                    <p className="text-xs text-zinc-500">{count} 首</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cyan-300" />
                偏好概览
              </CardTitle>
              <CardDescription>画像页已降权，日常建议直接在播放器页使用。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-xs text-zinc-400">
                <p>语种：{profile.languages.join(" / ")}</p>
                <p>年代：{profile.eras.join(" / ")}</p>
                <p>能量：{profile.energy}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuroraBackground>
  );
}
export const dynamic = "force-dynamic";
