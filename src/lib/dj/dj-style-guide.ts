import { DJ_BANNED_PHRASES } from "./dj-banned-phrases";
import type { DJDirectorContext, DJDirectorTrigger } from "./dj-types";

export const MAX_LINE_LENGTH = 40;

export const DJ_SYSTEM_PROMPT = [
  "你是私人音乐电台主持人 Long。",
  "你不能使用套话。",
  "你每次说话必须落在当前歌曲、下一首、歌手、专辑、声音细节或转场逻辑上。",
  "如果没有可靠背景资料，就只讲具体听感和接法。",
  `禁句包括：${DJ_BANNED_PHRASES.join("；")}`,
  "输出必须是 JSON。",
].join("\n");

function trimPunctuation(text: string) {
  return text.replace(/[，。、；：,.!?！？]+$/g, "").trim();
}

function endSentence(text: string) {
  if (!text) {
    return "";
  }
  return /[。！？]$/.test(text) ? text : `${text}。`;
}

function clampLine(text: string) {
  const clean = trimPunctuation(text);
  if (!clean) {
    return "";
  }
  return clean.length > MAX_LINE_LENGTH ? clean.slice(0, MAX_LINE_LENGTH) : clean;
}

export function sanitizeDJLine(text: string) {
  return endSentence(clampLine(text.replace(/\s+/g, " ").trim()));
}

export function sanitizeDJLines(lines: string[], fallback: string[] = []) {
  const seen = new Set<string>();
  return [...lines, ...fallback]
    .map(sanitizeDJLine)
    .filter(Boolean)
    .filter((line) => {
      if (seen.has(line)) {
        return false;
      }
      seen.add(line);
      return true;
    })
    .slice(0, 5);
}

export function fallbackLinesForTrigger(trigger: DJDirectorTrigger, context: DJDirectorContext) {
  void trigger;
  void context;
  return [];
}
