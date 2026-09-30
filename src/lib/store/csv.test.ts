import { describe, expect, it } from "vitest";
import type { MessageRecord } from "../types";
import { EXPORT_COLUMNS, csvCell, messagesToCsv } from "./csv";

const record = (over: Partial<MessageRecord> = {}): MessageRecord => ({
  id: "abc123XYZ0",
  title: "ustadha",
  toName: "نورة",
  school: "ثانوية الملك فهد",
  body: 'سطر أول\nسطر "ثاني", مع فاصلة',
  fromName: null,
  likes: 7,
  createdAt: "2026-10-05T08:00:00.000Z",
  variant: 2,
  inMemory: false,
  status: "published",
  reports: 0,
  removalRequested: false,
  reviewReason: null,
  starred: true,
  surpriseOptIn: true,
  contact: "+966500000001",
  ipHash: "iphash",
  searchText: "نوره",
  moderation: null,
  ...over,
});

/** Minimal RFC 4180 parser for the assertions. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += c;
  }
  return rows;
}

describe("csv export", () => {
  it("neutralises formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+966500000001")).toBe(`"'+966500000001"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("\t=1")).toBe(`"'\t=1"`);
    expect(csvCell("نورة")).toBe(`"نورة"`);
    expect(csvCell(null)).toBe(`""`);
    expect(csvCell(12)).toBe(`"12"`);
    expect(csvCell(true)).toBe(`"true"`);
  });

  it("writes a BOM, the header and one escaped row per letter", () => {
    const csv = messagesToCsv([record(), record({ id: "second0000", title: null, contact: "a@b.co" })]);
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = parseCsv(csv.slice(1));
    expect(rows[0]).toEqual([...EXPORT_COLUMNS]);
    expect(rows).toHaveLength(3);

    const first = Object.fromEntries(EXPORT_COLUMNS.map((c, i) => [c, rows[1][i]]));
    expect(first).toMatchObject({
      id: "abc123XYZ0",
      link: expect.stringMatching(/\/m\/abc123XYZ0$/),
      to: "أستاذة نورة",
      school: "ثانوية الملك فهد",
      from: "",
      contact: "'+966500000001",
      surpriseOptIn: "true",
      starred: "true",
      inMemory: "false",
      likes: "7",
      status: "published",
      createdAt: "2026-10-05T08:00:00.000Z",
      body: 'سطر أول\nسطر "ثاني", مع فاصلة',
    });
    expect(rows[2][2]).toBe("نورة");
    expect(rows[2][5]).toBe("a@b.co");
  });

  it("never includes the hashes", () => {
    const csv = messagesToCsv([record()]);
    expect(csv).not.toContain("iphash");
  });
});
