import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEMA_SQL, SCHEMA_VERSION, schemaStatements } from "./schema";

const fileSql = readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");

describe("db schema", () => {
  it("schema.ts mirrors db/schema.sql exactly", () => {
    expect(SCHEMA_SQL).toBe(fileSql);
  });

  it("carries a version marker", () => {
    expect(SCHEMA_VERSION).toMatch(/schema v\d+/);
    const last = schemaStatements().at(-1);
    expect(last?.sql).toContain("COMMENT ON TABLE messages");
    expect(last?.optional).toBe(false);
  });

  it("migrates every column added after the first version", () => {
    const alter = schemaStatements().find((s) => /^ALTER TABLE messages\s+ADD COLUMN/i.test(s.sql));
    expect(alter).toBeDefined();
    for (const col of [
      "variant",
      "in_memory",
      "surprise_opt_in",
      "contact",
      "starred",
      "removal_requested",
      "review_reason",
      "device_hash",
      "removal_kept",
      "flagged_at",
    ]) {
      expect(alter!.sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`));
    }
    const reports = schemaStatements().find((s) => /^ALTER TABLE message_reports\s+ADD COLUMN/i.test(s.sql));
    expect(reports?.sql).toMatch(/ADD COLUMN IF NOT EXISTS reason\b/);
    expect(reports?.sql).toMatch(/ADD COLUMN IF NOT EXISTS note\b/);
    expect(reports?.sql).toMatch(/ADD COLUMN IF NOT EXISTS ip_hash\b/);
    const likes = schemaStatements().find((s) => /^ALTER TABLE message_likes\s+ADD COLUMN/i.test(s.sql));
    expect(likes?.sql).toMatch(/ADD COLUMN IF NOT EXISTS ip_hash\b/);
    expect(SCHEMA_SQL).toMatch(/CHECK \(status IN \('published', 'pending', 'hidden'\)\)/);
  });

  it("marks only the trigram steps optional", () => {
    const statements = schemaStatements();
    const optional = statements.filter((s) => s.optional).map((s) => s.sql);
    expect(optional).toHaveLength(2);
    expect(optional[0]).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/);
    expect(optional[1]).toMatch(/gin_trgm_ops/);
    for (const s of statements) {
      expect(s.sql).not.toMatch(/;\s*$/);
      expect(s.sql.trim()).not.toBe("");
    }
  });

  it("keeps a $$-quoted DO block in one statement", () => {
    const blocks = schemaStatements().filter((s) => /^DO \$\$/.test(s.sql));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].sql).toMatch(/END IF;\s*END\s*\$\$$/);
    expect(blocks[0].sql).toMatch(/NOT VALID/);
    const split = schemaStatements("DO $$\nBEGIN\n  PERFORM 1;\nEND\n$$;\n\nSELECT 2;\n");
    expect(split.map((s) => s.sql)).toEqual(["DO $$\nBEGIN\n  PERFORM 1;\nEND\n$$", "SELECT 2"]);
  });

  it("is idempotent DDL only", () => {
    for (const { sql } of schemaStatements()) {
      if (/^CREATE (TABLE|INDEX|EXTENSION)/i.test(sql)) expect(sql).toMatch(/IF NOT EXISTS/i);
      expect(sql).not.toMatch(/^\s*(DROP TABLE|TRUNCATE|DELETE)/i);
    }
  });
});
