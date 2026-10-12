// Renders the PNG icons from src/icons/icon.svg (run once, or after changing the mark).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './content.mjs';
const svg = fs.readFileSync(path.join(ROOT, 'src/icons/icon.svg'), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['apple-touch-icon.png', 180, 0], ['icon-maskable-512.png', 512, 0.12]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<body style="margin:0;background:#0b6b6b;display:grid;place-items:center;width:${size}px;height:${size}px"><div style="width:${inner}px;height:${inner}px">${svg}</div></body>`);
  await page.screenshot({ path: path.join(ROOT, 'src/icons', name) });
  await page.close();
}
await browser.close();
console.log('icons written');
