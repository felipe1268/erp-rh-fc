#!/usr/bin/env node
import puppeteer from "puppeteer";
import fs from "node:fs";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const EMAIL = "Felipe1268@gmail.com";
const SENHA = "142168Fe@";
const OBRA_ID = 12;
const OUT = "docs/portal-prints-anotado";
const CHROMIUM = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, text) {
  const handle = await page.evaluateHandle((txt) => {
    const els = Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"]'));
    const t = (txt || "").trim().toLowerCase();
    return els.find((e) => ((e.innerText || e.textContent) || "").trim().toLowerCase().includes(t));
  }, text);
  const el = handle.asElement();
  if (!el) return false;
  await el.click();
  return true;
}

const browser = await puppeteer.launch({
  headless: true, executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  defaultViewport: { width: 1440, height: 1100, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.setDefaultTimeout(30000);

console.log("→ login");
await page.goto(`${BASE}/portal/cliente/login`, { waitUntil: "networkidle2" });
await sleep(800);
const inputs = await page.$$("input");
await inputs[0].type(EMAIL, { delay: 12 });
await inputs[1].type(SENHA, { delay: 12 });
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(()=>null), clickByText(page, "Entrar")]);
await sleep(1500);

// 1) Proj/Doc fullPage detalhado
console.log("→ proj/doc fullPage");
await page.goto(`${BASE}/portal/cliente/projdoc/${OBRA_ID}`, { waitUntil: "networkidle2" });
await sleep(2500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: `${OUT}/08-projdoc-detalhado.jpg`, type: "jpeg", quality: 88, fullPage: true });
console.log(`  ✓ ${(fs.statSync(`${OUT}/08-projdoc-detalhado.jpg`).size/1024).toFixed(1)} KB`);

// 2) Avaliação — tela atual (Felipe já avaliou)
console.log("→ avaliação (estado atual)");
await page.goto(`${BASE}/portal/cliente/dashboard?tab=avaliacao`, { waitUntil: "networkidle2" });
await sleep(2500);
// fechar modal se aparecer
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const mt = btns.find(b => /mais tarde/i.test(b.innerText || ''));
  if (mt) mt.click();
});
await sleep(800);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: `${OUT}/09-avaliacao-ja-respondida.jpg`, type: "jpeg", quality: 88, fullPage: true });
console.log(`  ✓ ${(fs.statSync(`${OUT}/09-avaliacao-ja-respondida.jpg`).size/1024).toFixed(1)} KB`);

// 3) Avaliação form aberto — forçar mostrando tab=avaliacao e injetando estado
// Como Felipe já avaliou, vou capturar o lembrete modal indo no /dashboard direto
console.log("→ modal lembrete avaliação");
await page.goto(`${BASE}/portal/cliente/dashboard`, { waitUntil: "networkidle2" });
await sleep(2500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: `${OUT}/09-avaliacao-dashboard.jpg`, type: "jpeg", quality: 88, fullPage: true });
console.log(`  ✓ ${(fs.statSync(`${OUT}/09-avaliacao-dashboard.jpg`).size/1024).toFixed(1)} KB`);

await browser.close();
console.log("\n✅ done");
