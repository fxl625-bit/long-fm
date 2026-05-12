# NetEase Playable Diagnosis

## Diagnosis summary

The NetEase playback chain is partially proven and the main blocker is now local library state, not `song/url`.

## Proven facts

### Login state

- NetEase provider session cookie exists in DB
- Remote `/login/status` resolves a real profile
- Remote account is not anonymous

Observed profile:

- userId: `84152149`
- nickname: `刘莽叔叔`

### Playlist access

- `/user/playlist` returns `46` playlists
- Real liked playlist observed from remote API:
  - playlistId: `95204435`
  - name: `刘莽叔叔喜欢的音乐`
  - trackCount: `950`

### Single-song resolve

Confirmed working sample:

- songId: `2082576919`
- endpoint: `song/url/v1`
- level: `standard`
- result: playable URL returned

This proves:

- cookie is valid
- remote API is reachable
- `song/url` can return a real audio URL

## What was broken

### Stale DB playlist blocked library refresh

Observed stale playlist in DB:

- provider: `NETEASE`
- providerPlaylistId: `17929986300`
- name: `我喜欢的音乐`
- DB track count: `0`

Previous sync behavior:

- if DB had any `NETEASE` playlist at all, sync was skipped
- stale empty playlist satisfied that condition
- real remote library never refreshed into DB

Result:

- `buildPlayableTracksForUser()` ran on stale DB content
- playable candidates were effectively empty
- `playableQueue` became `0`

### Mixed provider state made the status misleading

Observed current user row:

- `provider = NETEASE_OFFICIAL`
- `providerUserId = demo-user-001`

At the same time, the same user also had a real `NETEASE` session cookie attached.

That means the app currently mixes:

- seeded official demo data
- real experimental NetEase session data

This is why “已连接” and “无可播歌” could appear together without clearly exposing the true failure boundary.

## Fixes applied

### 1. Force resync when `NETEASE` library is empty

Added logic in [netease-player-provider.ts](../src/lib/providers/netease/netease-player-provider.ts):

- resync when no `NETEASE` playlists exist
- resync when `NETEASE` playlists exist but have no tracks
- resync when liked playlist exists but contains zero DB tracks

### 2. Make cookie transport consistent

Updated [netease-music-provider.ts](../src/lib/providers/music/netease-music-provider.ts):

- send cookie as query param
- also send cookie in `Cookie` header

### 3. Make status check lightweight

Updated [status route](../src/app/api/netease/status/route.ts):

- no heavy full-library sync during routine status checks
- if playable DB tracks are still `0`, it now tells the user to open `/debug/yesplay-core`

### 4. Make playlist detail route safe for debugging

Updated [playlist detail route](../src/app/api/netease/playlist/detail/route.ts):

- default behavior: fetch detail only
- optional DB sync only when `sync=1`

## What to validate next

Use [yesplay core debug page](../src/app/debug/yesplay-core/page.tsx):

1. Log in with QR
2. Load playlists
3. Open a real playlist
4. Pick one track
5. Click `解析 URL`
6. Verify `resolve-one` returns:
   - attempts
   - rawShape
   - real `audioUrl`
7. Play it with `<audio controls>`

## Interpretation of outcomes

### If single-song resolve succeeds

Then YesPlay Core is proven for:

- login
- playlist access
- `songId -> audioUrl`
- direct browser playback

At that point, playable queue generation can safely be rebuilt from resolve-one successes only.

### If single-song resolve fails

Use `/api/netease/debug/resolve-one?id=...` output to separate:

- `cookie_missing`
- `api_error`
- `no_url`
- `vip_only`
- `copyright_unavailable`
- `invalid_response`

## Current conclusion

The project did **not** fail because the NetEase remote API was fundamentally unavailable.

It failed because:

- local `NETEASE` library state was stale
- sync short-circuited too early
- status checks were too heavy
- main flow depended on DB readiness before the minimal playback loop had been proven
