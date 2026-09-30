// Greedy word wrap into a fixed set of line boxes (the triangle gets wider
// toward the base, so every line has its own width). Pure: the canvas
// measureText is injected so this can be tested in Node.

export interface LineBox {
  y: number;
  width: number;
}

export interface PlacedLine {
  text: string;
  y: number;
}

export interface WrapResult {
  lines: PlacedLine[];
  /** Some words did not fit and the last line ends with "…". */
  truncated: boolean;
}

const ELLIPSIS = "…";

export function wrapIntoBoxes(text: string, boxes: LineBox[], measure: (s: string) => number): WrapResult {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: PlacedLine[] = [];
  let i = 0;

  for (const box of boxes) {
    if (i >= words.length) break;
    let line = "";
    while (i < words.length) {
      const next = line ? `${line} ${words[i]}` : words[i];
      if (measure(next) <= box.width) {
        line = next;
        i++;
      } else break;
    }
    if (!line) {
      // A single word wider than the line: cut it.
      line = fitWithEllipsis(words[i], box.width, measure);
      i++;
    }
    lines.push({ text: line, y: box.y });
  }

  const truncated = i < words.length;
  if (truncated && lines.length > 0) {
    const last = lines[lines.length - 1];
    const box = boxes[lines.length - 1];
    last.text = fitWithEllipsis(last.text.replace(/…$/, ""), box.width, measure, true);
  }
  return { lines, truncated };
}

/** Trims whole words (or characters, for a single word) until `text…` fits. */
function fitWithEllipsis(text: string, width: number, measure: (s: string) => number, force = false): string {
  if (!force && measure(text) <= width) return text;
  let words = text.split(" ");
  while (words.length > 1 && measure(`${words.join(" ")}${ELLIPSIS}`) > width) words = words.slice(0, -1);
  let out = words.join(" ");
  while (out.length > 1 && measure(`${out}${ELLIPSIS}`) > width) out = Array.from(out).slice(0, -1).join("");
  return `${out}${ELLIPSIS}`;
}
