# Engines

该目录包含产品核心智能逻辑，采用“规则 + LLM”混合架构。

## 模块

- `music-profile-engine.ts`
  - 从用户曲库提取结构化音乐画像（mood/language/era/scene/keywords 等）
  - 输出 AI 文本画像（有 fallback）
- `radio-arrangement-strategy.ts`
  - 规则层编排策略：候选打分、去重、多样性、起承转合分段
- `radio-program-engine.ts`
  - 总编排引擎：主题规划 -> 结构编排 -> 主播文案生成
  - LLM 只负责高层语义与文案，不直接替代可控规则

## 目标

- 保证可解释性（为什么选这首歌）
- 保证稳定性（没有 LLM 也能生成可用节目）
- 保证可维护（提示词和策略可单独迭代）
