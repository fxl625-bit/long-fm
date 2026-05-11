export function topNByFrequency(values: string[], take = 5): string[] {
  const map = new Map<string, number>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    map.set(value, (map.get(value) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([key]) => key);
}

export function pickMostFrequent<T>(items: T[], fallback: T): T {
  if (!items.length) {
    return fallback;
  }

  const counter = new Map<T, number>();
  for (const item of items) {
    counter.set(item, (counter.get(item) ?? 0) + 1);
  }

  return Array.from(counter.entries()).sort((a, b) => b[1] - a[1])[0][0];
}

export function chunkBySections<T, K extends string>(input: T[], sections: Array<{ key: K; ratio: number }>) {
  const totalRatio = sections.reduce((sum, section) => sum + section.ratio, 0);
  let cursor = 0;

  return sections.map((section, index) => {
    const remaining = input.length - cursor;
    const raw = Math.round((input.length * section.ratio) / totalRatio);
    const count = index === sections.length - 1 ? remaining : Math.max(1, Math.min(raw, remaining));
    const items = input.slice(cursor, cursor + count);
    cursor += count;

    return {
      ...section,
      items,
    };
  });
}

