# AI Radio Director Design

## Goal

把 Auralia FM 从“播放器 + AI 插话”重构为“LLM 主导的电台系统”。DeepSeek 同时承担主持、编排和节奏控制职责；代码层只负责播放执行、安全约束、最薄机械保底和可观测性。

## Product Contract

### Required behavior

- 电台何时开口、说不说、说多长、是否切歌、是否重排，默认都由导演决策决定。
- 运行时不再使用固定 `opening / track_intro / bridge / every 2 tracks` 节奏模板。
- 允许连续多首歌不说话。
- 允许在一个情绪点说一整段，而不是“每首歌一句”。
- DeepSeek 输出为空、超时、无效 JSON 时，不生成主持词。
- DeepSeek 不可用时，系统仍然继续播歌，并在 debug / 状态层明确显示“导演离线”。

### Explicit non-goals

- 不在本轮继续优化 UI 视觉层。
- 不恢复任何主持词 fallback 生成器。
- 不保留旧的 timeline 文案生成链路作为正式主持来源。

## Architecture

### 1. Director Loop replaces Hosting Scheduler

新增“导演循环”作为唯一正式节奏控制器：

- 输入：播放上下文、最近内容、未来队列、用户偏好、时间段、会话状态。
- 触发：
  - 进入频道后短延迟一次；
  - 播放进行中每 10–20 秒一次；
  - 轨道边界事件（track start / near end / ended）；
  - 用户 tune 请求；
  - 恢复播放后重入；
  - 导演从离线恢复后补一轮。
- 输出：一个结构化决策 JSON。

旧的 `DJHostingScheduler` 不再决定“该说 opening、该说 bridge、两首之后要说一次”。它要么删除，要么退化为已废弃的 compatibility shell，不再拥有节奏权。

### 2. Decision schema

导演输出统一为：

```ts
type AIRadioDecision = {
  shouldSpeak: boolean;
  speak: string;
  musicAction: {
    type: "none" | "skip" | "reorder" | "inject";
    reason?: string;
    trackIds?: string[];
  };
  energy: "low" | "mid" | "high";
};
```

约束：

- `shouldSpeak=true` 时，`speak` 必须为 50–200 字连续表达。
- `shouldSpeak=false` 时，`speak` 必须为空字符串。
- `musicAction.type="skip"` 时允许立即切到下一首或指定目标块。
- `musicAction.type="reorder"` 时提供未来块 `trackIds`。
- `musicAction.type="inject"` 时提供待插入 `trackIds`。

### 3. Context contract

每次调用导演，传入完整上下文：

```ts
type AIRadioDirectorContext = {
  currentTrack: Track | null;
  recentTracks: Track[];
  upcomingTracks: Track[];
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  userPreference: UserMusicMemory;
  currentEnergy: "low" | "mid" | "high";
  lastSpeakAt: string | null;
  sessionDurationSec: number;
  recentLines: string[];
  musicState: {
    isPlaying: boolean;
    isPaused: boolean;
    currentTime: number;
    duration: number;
  };
  directorOnline: boolean;
  pendingUserIntent?: string;
};
```

说明：

- `recentTracks` 取最近 3 首。
- `upcomingTracks` 取未来 5 首。
- `currentEnergy` 由当前歌与最近块推断。
- `sessionDurationSec` 用于防止“节目刚开始就说太多”或“长期沉默后也不说”。

### 4. Runtime ownership split

#### LLM owns

- 什么时候说话；
- 说什么；
- 是否切歌；
- 是否重排；
- 是否插入发现曲目；
- 当前节目能量倾向。

#### Code owns

- 播放器状态机；
- 音频 pause/play 抖动过滤；
- 轨道切换执行；
- 决策 JSON 校验；
- final guard（只做安全拦截，不做内容生产）；
- DeepSeek 离线探测；
- 最薄机械保底；
- debug 证据；
- subtitle / TTS 执行。

### 5. No-hosting fallback rule

彻底取消主持文案 fallback：

- 不从 `safe-fallback-lines.ts` 生成口播；
- 不从 `radio-runtime` 预生成 opening；
- 不再从 `dj-style-guide` / `radio-host-writer` 作为正式兜底；
- 它们如保留，只能作为测试样本或迁移期辅助，不接正式 speak pipeline。

### 6. Minimal mechanical fallback

当导演不可用时，系统允许最薄机械保底，但只限音乐执行：

- 当前歌播完 -> 播下一首；
- 队列为空 -> ended；
- 用户点击下一首 / 换个感觉时，若导演离线，允许机械 skip 到下一首，但不生成主持；
- debug 和 runtime snapshot 中标记 `directorOnline=false`；
- UI / debug 显示“导演离线，频道继续纯音乐运行”。

这保证节目不会停摆，但不会出现模板主持词。

## Module Changes

### Replace / reshape

- `src/lib/dj/dj-director.ts`
  - 从 trigger-based host helper 升级为导演决策门面。
- `src/lib/dj/llm-dj-director.ts`
  - 改为导演模式 prompt + JSON schema 输出。
- `src/lib/radio/radio-session-engine.ts`
  - 接管导演循环调度、决策执行、离线保底。
- `src/lib/radio/radio-runtime.ts`
  - 删除 opening monologue 预生成链路；
  - 暴露导演在线状态和离线原因。
- `src/lib/dj/dj-types.ts`
  - 增加导演制 context / decision / debug 类型。

### Retire from control path

- `src/lib/dj/dj-hosting-scheduler.ts`
- `src/lib/dj/dj-scheduler.ts`
- `src/lib/radio/timeline-engine.ts`
- `src/lib/dj/safe-fallback-lines.ts`
- `src/lib/dj/radio-host-writer.ts`
- `src/lib/dj/radio-host-planner.ts`

这些模块不再控制正式节目节奏。可保留迁移兼容，但要从主链路摘掉。

## Decision Cycle

### Heartbeat

运行时维护一个导演 heartbeat：

- 默认随机落在 10–20 秒窗口；
- speaking 期间不重复触发；
- paused / locked / ended 时不触发；
- 每次成功决策后重置下一次窗口。

### Event-driven immediate decisions

以下事件直接触发额外决策：

- `channel_start`
- `track_started`
- `track_near_end`
- `track_ended`
- `user_tune`
- `playback_resumed`

导演可以在这些点选择不说、不动队列。

## Safety and Validation

### LLM response validation

决策执行前做三层校验：

1. JSON 结构合法；
2. `shouldSpeak/speak/musicAction` 组合合法；
3. `trackIds` 必须来自允许池。

不合法时：

- 记一条 decision failure；
- 标记导演本次离线/无效；
- 不说话；
- 保留最薄机械保底。

### Final guard role

保留 `final-dj-line-guard`，但语义变为：

- 仅拦截危险或低质输出进入 TTS；
- 被 guard 拦截后，本次 `speak` 作废；
- 不 rewrite，不 fallback；
- 不影响本次 `musicAction` 执行；
- 不停止后续导演循环。

## Debug and Observability

新增导演制调试对象：

```ts
type AIRadioDirectorDebug = {
  directorMode: "llm_primary";
  directorOnline: boolean;
  directorLastError: string | null;
  lastDecisionAt: string | null;
  lastDecisionSource: "deepseek" | "invalid_json" | "timeout" | "offline" | null;
  heartbeatScheduledFor: string | null;
  sessionDurationSec: number;
  lastDecision: AIRadioDecision | null;
  lastDecisionRaw: string | null;
  lastDecisionGuardBlocked: boolean;
  lastMusicActionExecuted: "none" | "skip" | "reorder" | "inject" | null;
  recentDirectorAttempts: Array<{
    createdAt: string;
    trigger: string;
    contextSummary: string;
    online: boolean;
    rawResponse: string | null;
    parsed: boolean;
    shouldSpeak: boolean;
    finalSpeakSent: boolean;
    musicAction: string;
    error: string | null;
  }>;
};
```

Developer Debug 至少要能回答：

- 这次有没有请求 DeepSeek；
- 它回了什么；
- JSON 是否有效；
- guard 是否挡掉 speak；
- musicAction 是否仍执行；
- 导演是否离线；
- 系统目前是纯音乐保底还是导演在线。

## Testing Requirements

至少覆盖：

1. 无固定“每两首说一次”的行为；
2. heartbeat 在 10–20 秒窗口触发决策；
3. `shouldSpeak=false` 时不发 TTS；
4. `shouldSpeak=true` 且通过 guard 时发 TTS；
5. guard 挡掉 speak 时，本次不说，但 musicAction 仍执行；
6. LLM 超时/无效 JSON 时进入导演离线态；
7. 导演离线时歌曲仍继续顺播；
8. director 恢复后后续决策继续触发；
9. `skip/reorder/inject` 三类 musicAction 都能落到队列执行；
10. `radio-runtime` 不再准备 opening fallback。

## Migration Strategy

1. 先引入新 decision schema 和 context schema；
2. 再把 `radio-session-engine` 接到导演 heartbeat；
3. 再移除 runtime opening 预生成；
4. 再切断旧 hosting scheduler 的正式入口；
5. 最后清理兼容逻辑和旧测试，补齐导演制测试。

## Acceptance

- DeepSeek 决定说不说、何时说、是否切歌；
- 不再由代码决定固定节目结构；
- 可以连续 3 首歌不说话；
- 可以在合适时机说一整段；
- DeepSeek 不可用时只保底播歌并显示离线；
- 无主持 fallback 文案回流；
- `npm run lint`、`npm test`、`npm run build` 全通过。
