import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const EMAIL = "Felipe1268@gmail.com";
const SENHA = "142168Fe@";
const OBRA_ID = 12;
const OUT = "docs/portal-prints";
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 85, fullPage: !!opts.full });
  console.log("✓", file);
}

async function clickByText(page, selector, text) {
  const handle = await page.evaluateHandle(
    (sel, txt) => {
      const els = Array.from(document.querySelectorAll(sel));
      return els.find((e) => (e.innerText || e.textContent || "").trim().toLowerCase().includes(txt.toLowerCase()));
    },
    selector,
    text,
  );
  const el = handle.asElement();
  if (!el) {
    console.log("  ! botão não encontrado:", text);
    return false;
  }
  await el.click();
  return true;
}

(async () => {
  console.log("BASE:", BASE);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("ERROR") || t.includes("Failed")) console.log("  [browser]", t.slice(0, 200));
  });

  try {
    // --- LOGIN ---
    await page.goto(`${BASE}/portal/cliente/login`, { waitUntil: "networkidle2" });
    await sleep(800);
    await shot(page, "01-login");

    // Preencher campos. PortalLoginCliente usa rótulo "Usuário"/"Senha"
    const inputs = await page.$$("input");
    if (inputs.length < 2) throw new Error("inputs login não encontrados");
    await inputs[0].click();
    await inputs[0].type(EMAIL, { delay: 20 });
    await inputs[1].click();
    await inputs[1].type(SENHA, { delay: 20 });
    await shot(page, "02-login-preenchido");

    // Clica "Entrar"
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
      clickByText(page, "button", "Entrar"),
    ]);
    await sleep(2000);
    console.log("URL pós-login:", page.url());
    if (page.url().includes("/login")) {
      await shot(page, "_login-falhou");
      throw new Error("login falhou — ainda em /login");
    }
    await shot(page, "03-hub", { full: true });

    // --- SELECIONAR OBRA (planejamento) ---
    await page.goto(`${BASE}/portal/cliente/modulo/planejamento`, { waitUntil: "networkidle2" });
    await sleep(1500);
    await shot(page, "04-selecionar-obra-planejamento", { full: true });

    // --- PLANEJAMENTO DA OBRA — abas ---
    await page.goto(`${BASE}/portal/cliente/obra/${OBRA_ID}`, { waitUntil: "networkidle2" });
    await sleep(2500);
    await shot(page, "05-planejamento-visao-geral", { full: true });

    const abas = [
      ["cronograma", "Cronograma"],
      ["avanco-semanal", "Avanço"],
      ["prog-semanal", "Programação"],
      ["curva-s", "Curva"],
      ["refis", "RefIs"],
      ["gantt", "Gantt"],
      ["caminho-critico", "Caminho"],
      ["efetivo", "Efetivo"],
      ["revisoes", "Revis"],
      ["diagrama-rede", "Diagrama"],
    ];
    for (const [slug, label] of abas) {
      const ok = await clickByText(page, '[role="tab"], button', label);
      if (!ok) { console.log("  pulando aba:", label); continue; }
      await sleep(1800);
      await shot(page, `06-planejamento-${slug}`, { full: true });
    }

    // --- PROJ/DOC ---
    await page.goto(`${BASE}/portal/cliente/modulo/proj_doc`, { waitUntil: "networkidle2" });
    await sleep(1500);
    await shot(page, "07-selecionar-obra-projdoc", { full: true });
    await page.goto(`${BASE}/portal/cliente/projdoc/${OBRA_ID}`, { waitUntil: "networkidle2" });
    await sleep(2000);
    await shot(page, "08-projdoc-obra", { full: true });

    // --- AVALIAÇÃO ---
    await page.goto(`${BASE}/portal/cliente/modulo/avaliacao`, { waitUntil: "networkidle2" });
    await sleep(2000);
    await shot(page, "09-modulo-avaliacao", { full: true });

    // --- ESQUECI SENHA (público) ---
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/portal/cliente/login`, { waitUntil: "networkidle2" });
    await sleep(600);
    await clickByText(page, "a, button", "Esqueci");
    await sleep(1500);
    await shot(page, "10-esqueci-senha");

    console.log("\n✅ Concluído.");
  } catch (e) {
    console.error("ERRO:", e.message);
    try { await page.screenshot({ path: path.join(OUT, "_erro.jpg"), type: "jpeg", quality: 80 }); } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
