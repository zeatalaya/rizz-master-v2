#!/usr/bin/env node
/**
 * Generate PWA icons for Rizz Master v2.
 *
 * Uses sharp to render SVG → PNG at 192x192, 512x512, and 512x512 maskable.
 * Run:  node packages/web/scripts/generate-icons.mjs
 */

import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");

// ---------- SVG helpers ----------

/**
 * Build the icon SVG at a given size.
 * @param {number} size  - width & height in px
 * @param {boolean} maskable - if true, the gradient fills the entire canvas
 *   (no rounded-rect clipping) so the OS can apply its own mask.
 */
function buildSvg(size, maskable = false) {
  // Scale all coordinates relative to a 512 viewBox, then set width/height.
  const vb = 512;

  // Gradient goes top-left → bottom-right
  const gradientDef = `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stop-color="#FD297B"/>
        <stop offset="50%"  stop-color="#FF5864"/>
        <stop offset="100%" stop-color="#FF655B"/>
      </linearGradient>
    </defs>`;

  // Background: full rect for maskable, rounded rect otherwise
  const background = maskable
    ? `<rect width="${vb}" height="${vb}" fill="url(#bg)"/>`
    : `<rect x="32" y="32" width="448" height="448" rx="96" ry="96" fill="url(#bg)"/>`;

  // Flame / fire icon  (centered, white)
  // This is a hand-tuned path that looks like a stylised flame.
  const flame = `
    <g transform="translate(256,256) scale(1.1)" fill="white">
      <path d="
        M 0,-130
        C  30,-90  70,-40  70,10
        C  70, 60  40, 95  20, 110
        C  30, 80  25, 50  10, 30
        C  -5, 55 -15, 85 -10,110
        C -35, 90 -70, 55 -70, 10
        C -70,-40 -30,-90   0,-130
        Z
      " />
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}">
  ${gradientDef}
  ${background}
  ${flame}
</svg>`;
}

// ---------- Generate ----------

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const specs = [
    { name: "icon-192.png", size: 192, maskable: false },
    { name: "icon-512.png", size: 512, maskable: false },
    { name: "icon-512-maskable.png", size: 512, maskable: true },
  ];

  for (const { name, size, maskable } of specs) {
    const svg = buildSvg(size, maskable);
    const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    const out = join(OUT_DIR, name);
    await writeFile(out, buf);
    console.log(`  wrote ${out}  (${buf.length} bytes)`);
  }

  console.log("\nDone – all PWA icons generated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
