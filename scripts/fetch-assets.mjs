#!/usr/bin/env node
// Downloads the Higgsfield 3D icons listed in src/lib/icons.json and saves web
// sized copies to public/3d/<name>.webp (640px, transparent). Safe to re-run:
// existing files are skipped unless you pass --force.
//
//   npm run assets            # fetch missing icons
//   npm run assets -- --force # re-download everything

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(root, "src/lib/icons.json"), "utf8"));
const outDir = path.join(root, "public/3d");
const force = process.argv.includes("--force");
const SIZE = 640;

await fs.mkdir(outDir, { recursive: true });

async function download(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

let failed = 0;
for (const [name, icon] of Object.entries(manifest.icons)) {
  const out = path.join(outDir, `${name}.webp`);
  if (!force) {
    try {
      await fs.access(out);
      console.log(`✓ ${name} (exists)`);
      continue;
    } catch {}
  }
  try {
    const png = await download(`${manifest.cdn}/${icon.remote}`);
    await sharp(png)
      .resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, alphaQuality: 90, effort: 6 })
      .toFile(out);
    console.log(`↓ ${name} -> public/3d/${name}.webp`);
  } catch (err) {
    failed++;
    console.warn(`✗ ${name}: ${err.message}`);
  }
}

if (failed) {
  console.warn(`\n${failed} icon(s) could not be downloaded. The site falls back to the CDN / emoji.`);
}
