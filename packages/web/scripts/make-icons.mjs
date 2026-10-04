// Builds the favicon set and brand exports from src/lib/brand.ts, using the Chromium that Playwright already has.
//   node scripts/make-icons.mjs
// Outputs: src/app/icon.svg, src/app/favicon.ico, src/app/apple-icon.png, public/icon-512.png, public/brand/*.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/lib/brand.ts"), "utf8");
const num = (re) => Number(new RegExp(re).exec(src)[1]);
const M = {
  u: /u: "([^"]+)"/.exec(src)[1],
  stroke: num("uStroke: (\\d+)"),
  cx: num("cx: ([\\d.]+)"),
  cy: num("cy: ([\\d.]+)"),
  r: num("r: ([\\d.]+)"),
};

const INK = "#111311";
const BONE = "#f3efe6";
const SIGNAL = "#ff5a1f";

const svg = ({ u, coin, coinR = M.r, coinCy = M.cy, bg = null, pad = 0, extra = "" }) => {
  const vb = 64 + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${vb} ${vb}" fill="none">${extra}${
    bg ? `<rect x="${-pad}" y="${-pad}" width="${vb}" height="${vb}" rx="${vb * 0.22}" fill="${bg}"/>` : ""
  }<path d="${M.u}" stroke="${u}" stroke-width="${M.stroke}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${M.cx}" cy="${coinCy}" r="${coinR}" fill="${coin}"/></svg>\n`;
};

// Favicon: coin in Signal, U in Ink, transparent. On a dark browser tab the U switches to Bone so it stays visible.
const favicon = svg({
  u: "var(--u)",
  coin: SIGNAL,
  extra: `<style>:root{--u:${INK}}@media (prefers-color-scheme:dark){:root{--u:${BONE}}}</style>`,
});
writeFileSync(join(root, "src/app/icon.svg"), favicon);

// Small sizes get a bigger coin so it is still visible at 16px.
const small = svg({ u: INK, coin: SIGNAL, coinR: M.r + 3, coinCy: M.cy - 1 });

writeFileSync(join(root, "public/brand/mark.svg"), svg({ u: INK, coin: SIGNAL }));
writeFileSync(join(root, "public/brand/mark-ink.svg"), svg({ u: INK, coin: INK }));
writeFileSync(join(root, "public/brand/mark-bone.svg"), svg({ u: BONE, coin: BONE }));
const appIcon = svg({ u: BONE, coin: SIGNAL, bg: INK, pad: 14 });

const found = readdirSync("/opt/pw-browsers").find((d) => /^chromium-\d+$/.test(d));
const executablePath = found && existsSync(`/opt/pw-browsers/${found}/chrome-linux/chrome`) ? `/opt/pw-browsers/${found}/chrome-linux/chrome` : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

async function png(markup, size, background = false) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
  const buf = await page.screenshot({ omitBackground: !background, type: "png" });
  await page.close();
  return buf;
}

// Wordmark exports need the real display font, so they are drawn in the browser with the font that ships with the site.
async function wordmark(colour, mark, file) {
  const font = readFileSync(join(root, "node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2")).toString("base64");
  const page = await browser.newPage({ viewport: { width: 960, height: 240 }, deviceScaleFactor: 2 });
  await page.setContent(`<style>@font-face{font-family:B;src:url(data:font/woff2;base64,${font});font-weight:200 800}
    html,body{margin:0;background:transparent}div{display:inline-flex;align-items:center;gap:24px;padding:40px}
    svg{width:160px;height:160px}span{font:700 120px/1 B;letter-spacing:-0.04em;color:${colour}}</style>
    <div>${mark}<span>upfront</span></div>`);
  const el = await page.$("div");
  writeFileSync(join(root, "public/brand", file), await el.screenshot({ omitBackground: true, type: "png" }));
  await page.close();
}
await wordmark(INK, svg({ u: INK, coin: SIGNAL }), "logo.png");
await wordmark(INK, svg({ u: INK, coin: INK }), "logo-ink.png");
await wordmark(BONE, svg({ u: BONE, coin: BONE }), "logo-bone.png");

writeFileSync(join(root, "public/brand/app-icon-1024.png"), await png(appIcon, 1024, true));
writeFileSync(join(root, "public/icon-512.png"), await png(svg({ u: INK, coin: SIGNAL }), 512));
// iOS fills transparency with black, which would hide the Ink U, so the touch icon sits on Bone.
writeFileSync(join(root, "src/app/apple-icon.png"), await png(svg({ u: INK, coin: SIGNAL, bg: BONE, pad: 10 }), 180, true));

// favicon.ico with 32px and 16px PNGs inside.
const p32 = await png(small, 32);
const p16 = await png(small, 16);
const entries = [[32, p32], [16, p16]];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = 6 + entries.length * 16;
const dir = entries.map(([size, data]) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0);
  e.writeUInt8(size, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
writeFileSync(join(root, "src/app/favicon.ico"), Buffer.concat([header, ...dir, ...entries.map(([, d]) => d)]));

await browser.close();
console.log("Icons written.");
