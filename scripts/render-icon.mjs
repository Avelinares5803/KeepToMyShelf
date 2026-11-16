// Renders build/icon.svg into build/icon.png, the app icon electron-builder turns into the .exe,
// installer and shortcut icons. Run it after editing the SVG: `node scripts/render-icon.mjs`.
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';

const SIZE = 512;
const svg = readFileSync(fileURLToPath(new URL('../build/icon.svg', import.meta.url)));
// 72 dpi is the SVG's own size; a higher density renders the 512 px from vectors, not by scaling.
await sharp(svg, { density: 288 })
  .resize(SIZE, SIZE)
  .png()
  .toFile(fileURLToPath(new URL('../build/icon.png', import.meta.url)));
