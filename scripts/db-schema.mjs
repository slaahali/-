#!/usr/bin/env node
// Applies db/schema.sql (npm run db:schema). Idempotent: run it on every deploy,
// before traffic, so request-time code only has to verify the version marker.
// Reads .env.local / .env when no database URL is exported. Prefers the
// provider's direct (non-pooled) URL for DDL when one is available.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_VARS = ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"];
const pick = () => URL_VARS.map((k) => process.env[k]?.trim()).find(Boolean);

if (!pick()) {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(root, name);
    if (existsSync(file) && typeof process.loadEnvFile === "function") process.loadEnvFile(file);
    if (pick()) break;
  }
}

const url = pick();
if (!url) {
  console.error(`No database URL (${URL_VARS.join(" / ")}) — export one or put it in .env.local.`);
  process.exit(1);
}

/** Same splitting rules as src/lib/store/schema.ts (";" at a line end, outside $$ blocks). */
function statements(source) {
  const out = [];
  let buf = [];
  let optional = false;
  let inDollar = false;
  for (const line of source.split(/\r?\n/)) {
    const t = line.trim();
    if (!inDollar && t.startsWith("--")) {
      if (buf.length === 0 && /^--\s*optional\b/i.test(t)) optional = true;
      continue;
    }
    if (!t && buf.length === 0) continue;
    buf.push(line);
    if ((line.match(/\$\$/g)?.length ?? 0) % 2 === 1) inDollar = !inDollar;
    if (!inDollar && t.endsWith(";")) {
      out.push({ sql: buf.join("\n").trim().replace(/;$/, ""), optional });
      buf = [];
      optional = false;
    }
  }
  return out;
}

const schema = readFileSync(path.join(root, "db", "schema.sql"), "utf8");
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 15 });

try {
  await sql.begin(async (tx) => {
    // Same lock as the app's cold-start check, so the two never interleave.
    await tx`select pg_advisory_xact_lock(${7_231_005})`;
    for (const st of statements(schema)) {
      const label = st.sql.split("\n")[0].slice(0, 90);
      if (!st.optional) {
        await tx.unsafe(st.sql);
        console.log(`✓ ${label}`);
        continue;
      }
      try {
        await tx.savepoint((sp) => sp.unsafe(st.sql));
        console.log(`✓ ${label}`);
      } catch (e) {
        console.warn(`⚠ skipped (optional): ${label}\n  ${e.message}`);
      }
    }
  });
  console.log("Schema applied.");
} catch (e) {
  console.error(`Schema failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
