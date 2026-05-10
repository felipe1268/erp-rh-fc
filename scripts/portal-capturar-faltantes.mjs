#!/usr/bin/env node
/**
 * Captura as telas que faltavam no manual iniciante:
 *   - Cronograma
 *   - Prog. Semanal
 *   - Avaliação (NPS)
 * Salva em docs/portal-prints-anotado/ para serem reaproveitadas
 * pelo scripts/portal-pdf-manual-iniciante.mjs.
 */
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
    const els = Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"], li'));
    const norm = (s) => (s || "").trim().toLowerCase();
    const t = norm(txt);
    return els.find((e) => {
      const own = norm(e.innerText || e.textContent);
      return own.includes(t) && own.length < 80;
    });
  }, text);
  const el = handle.asElement();
  if (!el) { console.log(`   ✗ não achei "${text}"`); return false; }
  await el.click();
  return true;
}

const TARGETS = [
  {
    id: "06-planejamento-cronograma", url: `/portal/cliente/obra/${OBRA_ID}`,
    click: "Cronograma", label: "Cronograma",
  },
  {
    id: "06-planejamento-prog-semanal", url: `/portal/cliente/obra/${OBRA_ID}`,
    click: "Prog. Semanal", label: "Prog. Semanal",
  },
  {
    id: "09-avaliacao-nps", url: `/portal/cliente/dashboard?tab=avaliacao`,
    click: null, label: "Avaliação NPS",
  },
];

const browser = await puppeteer.launch({
  headless: true, executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.setDefaultTimeout(30000);

console.log("→ login");
await page.goto(`${BASE}/portal/cliente/login`, { waitUntil: "networkidle2" });
await sleep(800);
const inputs = await page.$$("input");
await inputs[0].type(EMAIL, { delay: 15 });
await inputs[1].type(SENHA, { delay: 15 });
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
  clickByText(page, "Entrar"),
]);
await sleep(1500);
console.log("  ✓ logado, url=", page.url());

for (const t of TARGETS) {
  console.log(`\n→ ${t.id} (${t.label})`);
  await page.goto(`${BASE}${t.url}`, { waitUntil: "networkidle2" });
  await sleep(2200);
  if (t.click) {
    const ok = await clickByText(page, t.click);
    console.log(`   click "${t.click}" → ${ok}`);
    await sleep(2000);
  }
  // scroll up to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  const file = `${OUT}/${t.id}.jpg`;
  await page.screenshot({ path: file, type: "jpeg", quality: 88, fullPage: true });
  const sz = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`   ✓ ${file} (${sz} KB)`);
}

await browser.close();
console.log("\n✅ Capturas concluídas");
