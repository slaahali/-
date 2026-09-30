#!/usr/bin/env node
// Downloads the generated media listed in src/lib/icons.json into /public:
//   icons  → public/3d/<name>.webp      (Higgsfield 3D icons, 640px)
//   seals  → public/seals/<key>.webp    (Higgsfield wax seals, 320px)
//   sfx    → public/sfx/<name>.mp3      (ElevenLabs sound effects)
// Existing files are skipped unless you pass --force.
//
//   npm run assets            # fetch missing files
//   npm run assets -- --force # re-download everything

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(root, "src/lib/icons.json"), "utf8"));
const force = process.argv.includes("--force");

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

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const jobs = [
  ...Object.entries(manifest.icons).map(([name, icon]) => ({
    label: `icon ${name}`,
    url: `${manifest.cdn}/${icon.remote}`,
    out: path.join(root, "public/3d", `${name}.webp`),
    size: 640,
    alphaFloor: icon.alphaFloor ?? 0,
  })),
  ...Object.entries(manifest.seals ?? {}).map(([key, file]) => ({
    label: `seal ${key}`,
    url: `${manifest.cdn}/${file}`,
    out: path.join(root, "public/seals", `${key}.webp`),
    size: 320,
  })),
  ...Object.entries(manifest.sfx ?? {})
    .filter(([name]) => !name.startsWith("_"))
    .map(([name, url]) => ({
      label: `sound ${name}`,
      url,
      out: path.join(root, "public/sfx", `${name}.mp3`),
      size: 0,
    })),
];

let failed = 0;
for (const job of jobs) {
  await fs.mkdir(path.dirname(job.out), { recursive: true });
  if (!force && (await exists(job.out))) {
    console.log(`✓ ${job.label} (exists)`);
    continue;
  }
  try {
    const buf = await download(job.url);
    if (job.size) {
      let img = sharp(buf);
      if (job.alphaFloor) {
        // Some renders carry a faint full-frame haze: drop near-transparent pixels.
        const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 3; i < data.length; i += 4) if (data[i] < job.alphaFloor) data[i] = 0;
        img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
      }
      await img
        .resize(job.size, job.size, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86, alphaQuality: 90, effort: 6 })
        .toFile(job.out);
    } else {
      await fs.writeFile(job.out, buf);
    }
    console.log(`↓ ${job.label} -> ${path.relative(root, job.out)}`);
  } catch (err) {
    failed++;
    console.warn(`✗ ${job.label}: ${err.message}`);
  }
}

if (failed) {
  console.warn(`\n${failed} file(s) could not be downloaded. The site falls back to built-in art and synthesized sounds.`);
}
