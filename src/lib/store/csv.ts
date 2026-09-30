// CSV export for the admin (starred / surprise opt-in letters, with contacts).
// Opens cleanly in Excel (UTF-8 BOM, CRLF) and neutralises spreadsheet formulas.

import { permalink } from "../config";
import { displayTo } from "../format";
import type { MessageRecord } from "../types";

export const EXPORT_COLUMNS = [
  "id",
  "link",
  "to",
  "school",
  "from",
  "contact",
  "surpriseOptIn",
  "starred",
  "inMemory",
  "likes",
  "status",
  "createdAt",
  "body",
] as const;

type Cell = string | number | boolean | null | undefined;

/**
 * One quoted CSV cell. Text starting with = + - @ (or a tab / CR, which some
 * spreadsheets skip before evaluating) is prefixed with ' so it is never run as
 * a formula.
 */
export function csvCell(v: Cell): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(cells: readonly Cell[]): string {
  return cells.map(csvCell).join(",");
}

export function messagesToCsv(rows: readonly MessageRecord[]): string {
  const lines = [csvRow(EXPORT_COLUMNS)];
  for (const m of rows) {
    lines.push(
      csvRow([
        m.id,
        permalink(m.id),
        displayTo(m),
        m.school,
        m.fromName,
        m.contact,
        m.surpriseOptIn,
        m.starred,
        m.inMemory,
        m.likes,
        m.status,
        m.createdAt,
        m.body,
      ]),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
