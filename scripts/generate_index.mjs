#!/usr/bin/env node
/**
 * Generate index.html listing all gambling disorder daily reports.
 * Includes clinic, newsletter, and Buy Me a Coffee links.
 */

import { readdir, writeFile } from "node:fs/promises";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

async function main() {
  const docsDir = new URL("../docs/", import.meta.url);
  let files;
  try {
    files = await readdir(docsDir);
  } catch {
    files = [];
  }

  const reports = files
    .filter((f) => /^gambling-\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .sort()
    .reverse();

  const linksHtml = reports.map((name) => {
    const dateStr = name.replace("gambling-", "").replace(".html", "");
    let display;
    try {
      const parts = dateStr.split("-").map(Number);
      const y = parts[0];
      const m = parts[1];
      const day = parts[2];
      const d = new Date(Date.UTC(y, m - 1, day));
      const wd = WEEKDAYS[d.getUTCDay()];
      display = `${y}年${m}月${day}日（週${wd}）`;
    } catch {
      display = dateStr;
    }
    return `<li><a href="${name}">📅 ${display}</a></li>`;
  }).join("\n");

  const total = reports.length;

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Gambling Disorder Research · 賭博疾患研究文獻日報</title>
<style>
  :root { --bg: #f6f1e8; --surface: #fffaf2; --line: #d8c5ab; --text: #2b2118; --muted: #766453; --accent: #8c4f2b; --accent-soft: #ead2bf; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: radial-gradient(circle at top, #fff6ea 0, var(--bg) 55%, #ead8c6 100%); color: var(--text); font-family: "Noto Sans TC", "PingFang TC", "Helvetica Neue", Arial, sans-serif; min-height: 100vh; }
  .container { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; padding: 80px 24px; }
  .logo { font-size: 48px; text-align: center; margin-bottom: 16px; }
  h1 { text-align: center; font-size: 24px; color: var(--text); margin-bottom: 8px; }
  .subtitle { text-align: center; color: var(--accent); font-size: 14px; margin-bottom: 48px; }
  .count { text-align: center; color: var(--muted); font-size: 13px; margin-bottom: 32px; }
  ul { list-style: none; }
  li { margin-bottom: 8px; }
  a { color: var(--text); text-decoration: none; display: block; padding: 14px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; transition: all 0.2s; font-size: 15px; }
  a:hover { background: var(--accent-soft); border-color: var(--accent); transform: translateX(4px); }
  .links-section { margin-top: 48px; display: flex; flex-direction: column; gap: 10px; }
  .ext-link { display: flex; align-items: center; gap: 14px; padding: 18px 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; text-decoration: none; color: var(--text); transition: all 0.2s; box-shadow: 0 8px 30px rgba(61,36,15,0.04); }
  .ext-link:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 12px 40px rgba(61,36,15,0.08); }
  .ext-icon { font-size: 28px; flex-shrink: 0; }
  .ext-name { font-size: 15px; font-weight: 700; color: var(--text); flex: 1; }
  .ext-arrow { font-size: 18px; color: var(--accent); font-weight: 700; }
  footer { margin-top: 56px; text-align: center; font-size: 12px; color: var(--muted); }
  footer a { display: inline; padding: 0; background: none; border: none; color: var(--muted); }
  footer a:hover { color: var(--accent); }
</style>
</head>
<body>
<div class="container">
  <div class="logo">🎲</div>
  <h1>Gambling Disorder Research</h1>
  <p class="subtitle">賭博疾患研究文獻日報 · 每日自動更新</p>
  <p class="count">共 ${total} 期日報</p>
  <ul>
${linksHtml}
  </ul>
  <div class="links-section">
    <a href="https://www.leepsyclinic.com/" class="ext-link" target="_blank" rel="noopener">
      <span class="ext-icon">🏥</span>
      <span class="ext-name">李政洋身心診所首頁</span>
      <span class="ext-arrow">→</span>
    </a>
    <a href="https://blog.leepsyclinic.com/" class="ext-link" target="_blank" rel="noopener">
      <span class="ext-icon">📬</span>
      <span class="ext-name">訂閱電子報</span>
      <span class="ext-arrow">→</span>
    </a>
    <a href="https://buymeacoffee.com/CYlee" class="ext-link" target="_blank" rel="noopener">
      <span class="ext-icon">☕</span>
      <span class="ext-name">Buy Me a Coffee</span>
      <span class="ext-arrow">→</span>
    </a>
  </div>
  <footer>
    <p>Powered by PubMed + Zhipu AI · <a href="https://github.com/u8901006/gambling-disorder">GitHub</a></p>
  </footer>
</div>
</body>
</html>`;

  const indexPath = new URL("../docs/index.html", import.meta.url);
  await writeFile(indexPath, html, "utf-8");
  console.error(`[INFO] Index page generated (${total} reports)`);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
