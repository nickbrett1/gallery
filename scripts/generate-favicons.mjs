import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('/workspaces/gallery/node_modules/sharp');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Gallery: art and video games">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1f232d" />
      <stop offset="100%" stop-color="#14161a" />
    </linearGradient>
    <linearGradient id="palette" x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#4f8ff7" />
      <stop offset="55%" stop-color="#8b5cf6" />
      <stop offset="100%" stop-color="#d946ef" />
    </linearGradient>
    <filter id="dpad-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#050608" flood-opacity="0.6" />
    </filter>
  </defs>

  <!-- Squircle tile matching site theme -->
  <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#bg)" stroke="#2c313c" stroke-width="1.5" />

  <!-- Painter's palette body -->
  <path
    d="M 32 11
       C 45 11 53 19 53 29
       C 53 36 49 40 45 42
       C 40.5 44.2 39 47 41.5 50
       C 42.5 51.2 41.5 53 39 53.5
       C 35 54.3 27 52 20 46
       C 13 40 11 31 11 24
       C 11 16 19 11 32 11 Z"
    fill="url(#palette)"
  />

  <!-- 4 paint dabs arcing over the top (cyan, gold, emerald, coral) -->
  <circle cx="20" cy="22" r="3.4" fill="#38bdf8" />
  <circle cx="29" cy="17.5" r="3.4" fill="#fbbf24" />
  <circle cx="38.5" cy="18.5" r="3.4" fill="#34d399" />
  <circle cx="47" cy="25" r="3.4" fill="#f87171" />

  <!-- Game controller D-pad serving as the palette's thumb-hole -->
  <g filter="url(#dpad-shadow)">
    <path
      d="M 25 35.5 h 5 v -5 h 6 v 5 h 5 v 6 h -5 v 5 h -6 v -5 h -5 z"
      fill="#14161a"
      stroke="#2c313c"
      stroke-width="1"
      stroke-linejoin="round"
    />
    <circle cx="33" cy="38.5" r="1.3" fill="#3b4252" />
    <path d="M 33 32.5 v 1 M 33 44.5 v -1 M 27 38.5 h 1 M 39 38.5 h -1" stroke="#4c566a" stroke-width="0.9" stroke-linecap="round" />
  </g>
</svg>`;

const outDir = '/workspaces/gallery/static';
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'favicon.svg'), svg.trim() + '\n', 'utf8');

const svgBuffer = Buffer.from(svg);

async function build() {
  const targets = [
    { name: 'favicon.png', size: 32 },
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 }
  ];

  for (const { name, size } of targets) {
    const dest = path.join(outDir, name);
    await sharp(svgBuffer, { density: 600 })
      .resize(size, size)
      .png()
      .toFile(dest);
    console.log(`Generated ${name} (${size}x${size})`);
  }
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
