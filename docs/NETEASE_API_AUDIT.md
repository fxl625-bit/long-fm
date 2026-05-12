# NetEase API Audit

## Current implementation

- Current mode: `remote`
- Resolver file: [src/lib/providers/netease/netease-api-mode.ts](../src/lib/providers/netease/netease-api-mode.ts)
- Remote base URL default: `http://127.0.0.1:3001`
- Actual configured base URL observed in local env: `http://localhost:3001`

The repo currently does **not** install a mature NetEase API package in `package.json`.

- Missing: `@neteasecloudmusicapienhanced/api`
- Missing: `@neteaseapireborn/api`
- Current behavior: call a separate NetEase-compatible HTTP service through `NETEASE_API_BASE_URL`

## API source of truth

- Login QR flow source: remote NetEase-compatible service
  - `/login/qr/key`
  - `/login/qr/create`
  - `/login/qr/check`
- User status source:
  - `/login/status`
  - `/user/detail`
- Playlist source:
  - `/user/playlist`
  - `/playlist/detail`
  - `/likelist`
- Playback URL source:
  - `/song/url/v1`
  - `/song/url`

Relevant code:

- [netease-client.ts](../src/lib/providers/netease/netease-client.ts)
- [netease-music-provider.ts](../src/lib/providers/music/netease-music-provider.ts)
- [netease-auth.ts](../src/lib/providers/netease/netease-auth.ts)

## Cookie persistence

- Cookie is stored in Prisma `ProviderSession.cookie`
- Persistence path:
  - QR check route completes authorization
  - `completeLoginAfterQrCheck()` resolves cookie + login state
  - `persistNeteaseLoginSession()` writes cookie to DB

Relevant code:

- [qr check route](../src/app/api/netease/qr-check/route.ts)
- [netease-auth.ts](../src/lib/providers/netease/netease-auth.ts)

Observed local DB session:

- Provider: `NETEASE`
- Has cookie: `true`
- Remote login profile resolved successfully
- Remote login account resolved successfully

## How cookie reaches `song/url`

There were two different transmission styles in the codebase:

1. `NeteaseClient.request()`
   - sent `cookie` as URL query param
2. `NeteaseMusicProvider.request()`
   - sent `Cookie` header
   - previously stripped `cookie` from query params

This inconsistency could make some endpoints behave differently across codepaths.

Current fix in this round:

- `NeteaseMusicProvider.request()` now sends cookie in **both** places
  - query param
  - `Cookie` header

This makes remote NetEase-compatible services more predictable.

## Current `song/url` raw structure sample

Observed successful sample from remote service:

- Test song ID: `2082576919`
- Endpoint: `song/url/v1`
- Params: `id=2082576919&level=standard`
- Raw shape: `data[0].url`

Sample shape:

```json
{
  "data": [
    {
      "url": "http://m701.music.126.net/..."
    }
  ],
  "code": 200
}
```

## What is actually working now

Direct remote checks confirmed:

- `/login/status` returns a real profile
  - userId: `84152149`
  - nickname: `刘莽叔叔`
- `/user/playlist` returns `46` playlists
- `/playlist/detail?id=95204435` returns `950` tracks
- `/song/url/v1?id=2082576919&level=standard` returns a real playable URL

This means the **NetEase real playback chain itself is available**.

## Why `playableQueue` became `0`

The main failure was **not** `song/url`.

The actual root causes were:

1. A stale empty `NETEASE` playlist already existed in DB
   - providerPlaylistId: `17929986300`
   - `trackCount = 0`
2. `NeteasePlayerProvider.ensureLibrarySynced()` only checked whether any `NETEASE` playlist existed
   - if count `> 0`, it skipped sync completely
3. Because of that stale playlist, the app never resynced the real library
4. The current user context also contains seeded `NETEASE_OFFICIAL` demo data
   - this polluted status display and made the source-of-truth less obvious

So the previous result was:

- remote login works
- remote playlists work
- remote `song/url` works
- local `NETEASE` DB library was stale and effectively empty
- playable queue generation ran against stale DB state

## Fixes applied in this round

1. Added a resync guard in [netease-player-provider.ts](../src/lib/providers/netease/netease-player-provider.ts)
   - force resync when:
   - `playlistCount <= 0`
   - or `trackCount <= 0`
   - or liked playlist track count `<= 0`
2. Unified remote cookie transmission in [netease-music-provider.ts](../src/lib/providers/music/netease-music-provider.ts)
3. Made [status route](../src/app/api/netease/status/route.ts) lightweight
   - no longer triggers heavy full-library sync on every page load
   - reports a clear debug instruction instead
4. Made [playlist detail route](../src/app/api/netease/playlist/detail/route.ts) read-only by default
   - only syncs when `sync=1`
5. Added [YesPlay core debug page](../src/app/debug/yesplay-core/page.tsx)
   - login
   - playlists
   - track list
   - resolve-one
   - direct `<audio controls>`

## Bottom line

The repo was not failing because NetEase cannot provide real playback URLs.

It was failing because:

- stale DB library state blocked resync
- cookie transmission was inconsistent
- lightweight debug verification did not exist
- main flow was trying to infer readiness from stale DB data instead of proving `songId -> audioUrl`
