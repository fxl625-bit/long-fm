# Music Provider Layer

该目录实现音乐源接入抽象层，目标是把业务逻辑与第三方 API 解耦。

## 结构

- `types.ts`: 统一接口定义（login/getLikedSongs/createPlaylist 等）
- `mock-music-provider.ts`: 演示模式实现，保证 MVP 无外部依赖可运行
- `netease-music-provider.ts`: 网易云实验接入（第三方 API 代理模式）
- `index.ts`: Provider 工厂 + fallback 包装器

## 设计要点

1. 业务层只依赖 `MusicProvider` 接口，不依赖网易云响应结构。
2. `NeteaseMusicProvider` 使用适配映射将第三方字段转为统一 `MusicTrack`/`MusicPlaylist`。
3. 在接口错误、网络异常时支持 fallback 到 `MockMusicProvider`，避免主流程阻塞。
4. `getSongUrl` 标注为实验能力，可能因版权/地区/会员策略返回空值。

## 后续扩展

- 新增 QQ/Spotify/Apple Music 时，只需新增 provider 实现并注册工厂。
- 可加入 Redis 共享缓存替换当前进程内缓存。
