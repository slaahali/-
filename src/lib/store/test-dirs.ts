// Temp directories for store/API tests (never inside the repo).

import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** A fresh temp dir under TEST_SCRATCH_DIR (if set) or the OS temp dir. */
export function makeTestDir(prefix: string): string {
  const base = process.env.TEST_SCRATCH_DIR || os.tmpdir();
  mkdirSync(base, { recursive: true });
  return mkdtempSync(path.join(base, prefix));
}
