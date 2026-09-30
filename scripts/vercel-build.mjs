#!/usr/bin/env node
// Vercel runs `npm run vercel-build` when it exists: migrate the database
// (when one is configured) before building, so traffic never hits an old schema.
import { execSync } from "node:child_process";

const hasDb = ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"].some((k) =>
  process.env[k]?.trim(),
);
if (hasDb) execSync("node scripts/db-schema.mjs", { stdio: "inherit" });
else console.log("[vercel-build] no database URL — skipping schema migration (demo/file-store deploy)");
execSync("next build", { stdio: "inherit" });
