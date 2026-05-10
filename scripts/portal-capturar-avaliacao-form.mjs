#!/usr/bin/env node
/**
 * Captura o formulário COMPLETO de Avaliação NPS do Portal,
 * interceptando a resposta de podeAvaliarEsteMes para forçar
 * jaAvaliou=false (sem alterar nada no banco).
 */
import puppeteer from "puppeteer";
import fs from "node:fs";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const EMAIL = "Felipe1268@gmail.com";
const SENHA = "142168Fe@";
const OUT = "docs/portal-prints-anotado";
const CHROMIUM = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, text) {
  const handle = await page.evaluateHandle((txt) => {
    const els = Array.from(document.querySelectorAll('button, a'));
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

// Intercepta respostas tRPC da query podeAvaliarEsteMes e força jaAvaliou=false
await page.setRequestInterception(true);
page.on("request", (req) => req.continue());
page.on("response", async (resp) => {
  const url = resp.url();
  if (url.includes("podeAvaliarEsteMes") && resp.request().method() === "GET") {
    // Não dá pra mutar a resposta diretamente; será feito via override fetch abaixo.
  }
});

// Override do fetch no contexto da página antes de carregar
await page.evaluateOnNewDocument(() => {
  const origFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const resp = await origFetch(input, init);
    if (url.includes("podeAvaliarEsteMes")) {
      const clone = resp.clone();
      try {
        const json = await clone.json();
        // tRPC v11 batch shape
        const patch = (obj) => {
          if (!obj) return obj;
          if (obj?.result?.data?.json) {
            obj.result.data.json.jaAvaliou = false;
            obj.result.data.json.podeAvaliar = true;
          }
          if (obj?.result?.data) {
            obj.result.data.jaAvaliou = false;
            obj.result.data.podeAvaliar = true;
          }
          return obj;
        };
        const fixed = Array.isArray(json) ? json.map(patch) : patch(json);
        return new Response(JSON.stringify(fixed), {
          status: resp.status, statusText: resp.statusText, headers: resp.headers,
        });
      } catch (e) { return resp; }
    }
    return resp;
  };
});

console.log("→ login");
await page.goto(`${BASE}/portal/cliente/login`, { waitUntil: "networkidle2" });
await sleep(800);
const inputs = await page.$$("input");
await inputs[0].type(EMAIL, { delay: 12 });
await inputs[1].type(SENHA, { delay: 12 });
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(()=>null), clickByText(page, "Entrar")]);
await sleep(1500);

console.log("→ /portal/cliente/dashboard?tab=avaliacao com fetch interceptado");
await page.goto(`${BASE}/portal/cliente/dashboard?tab=avaliacao`, { waitUntil: "networkidle2" });
await sleep(3500);

// fechar modal de lembrete se aparecer
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const mt = btns.find(b => /mais tarde/i.test(b.innerText || ''));
  if (mt) mt.click();
});
await sleep(800);
await page.evaluate(() => window.scrollTo(0, 0));

const file = `${OUT}/09-avaliacao-formulario-completo.jpg`;
await page.screenshot({ path: file, type: "jpeg", quality: 88, fullPage: true });
console.log(`✓ ${file} (${(fs.statSync(file).size/1024).toFixed(1)} KB)`);

await browser.close();
