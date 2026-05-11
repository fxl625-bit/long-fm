export class DJLineMemory {
  private readonly limit: number;
  private readonly history: Array<{ lines: string[]; timestamp: number }> = [];

  constructor(limit = 10) {
    this.limit = limit;
  }

  remember(lines: string[]) {
    this.history.push({ lines, timestamp: Date.now() });
    while (this.history.length > this.limit) {
      this.history.shift();
    }
  }

  recentLines() {
    return this.history.flatMap((entry) => entry.lines).slice(-this.limit);
  }

  isTooSimilar(lines: string[], threshold = 0.72) {
    const target = lines.join(" ");
    return this.history.some((entry) => this.similarity(target, entry.lines.join(" ")) >= threshold);
  }

  private similarity(left: string, right: string) {
    const a = this.normalize(left);
    const b = this.normalize(right);
    if (!a || !b) {
      return 0;
    }
    if (a === b) {
      return 1;
    }
    const leftChars = new Set(a.split(""));
    const rightChars = new Set(b.split(""));
    const overlap = [...leftChars].filter((char) => rightChars.has(char)).length;
    return overlap / Math.max(leftChars.size, rightChars.size, 1);
  }

  private normalize(text: string) {
    return text.replace(/[，。！？、,.!?]/g, "").replace(/\s+/g, "").trim();
  }
}
