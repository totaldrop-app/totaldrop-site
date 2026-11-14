// SPDX-FileCopyrightText: 2026 The TotalDrop Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Post-deployment health probe for totaldrop.app Cloudflare Pages:
// verifies the home page, the download page, and Android App Links
// (.well-known/assetlinks.json without redirects).

const tries = 12;
const timeout = 10_000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(url, text) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!(await res.text()).includes(text)) throw new Error(`${url}: "${text}" missing`);
}

async function assetLinks(url) {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeout) });
  if (res.status !== 200) throw new Error(`${url}: HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json")) throw new Error(`${url}: content type ${type}`);
  const statements = JSON.parse(await res.text());
  if (!statements.some((s) => s.target?.package_name === "app.totaldrop")) {
    throw new Error(`${url}: app.totaldrop missing`);
  }
}

for (let i = 1; ; i++) {
  try {
    await page("https://totaldrop.app/", "TotalDrop");
    await page("https://totaldrop.app/download/", "releases/download/");
    await assetLinks("https://totaldrop.app/.well-known/assetlinks.json");
    console.log("site: ok");
    break;
  } catch (e) {
    console.log(`site: try ${i}: ${e.message}`);
    if (i === tries) process.exit(1);
    await wait(5_000);
  }
}
