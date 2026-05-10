// Preenche valor_unitario via IA para TODOS os itens sem preço (company 60002).
// Usa Anthropic se disponível, senão Gemini. Batches de 20.
import pg from "pg";

const COMPANY_ID = 60002;
const BATCH = 20;

const client = new pg.Client({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: itens } = await client.query(
  `SELECT id, nome, unidade, categoria
   FROM almoxarifado_itens
   WHERE company_id = $1 AND ativo = true
     AND (valor_unitario IS NULL OR valor_unitario = 0)
   ORDER BY id`,
  [COMPANY_ID]
);

console.log(`Total de itens sem preço: ${itens.length}`);
if (itens.length === 0) { await client.end(); process.exit(0); }

const useAnthropic = !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const googleKey = process.env.GOOGLE_API_KEY;
console.log(`Usando: ${useAnthropic ? "Anthropic Claude" : googleKey ? "Google Gemini" : "NENHUMA IA configurada!"}`);
if (!useAnthropic && !googleKey) { await client.end(); process.exit(1); }

async function callAnthropic(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0,200)}`);
  const j = await r.json();
  return j.content?.[0]?.text || "";
}
async function callGemini(prompt) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": `Bearer ${googleKey}` },
      body: JSON.stringify({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4096,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0,200)}`);
    const j = await r.json();
    return j.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(t);
  }
}

const callIA = useAnthropic ? callAnthropic : callGemini;

let totalAtualizados = 0;
let totalFalhas = 0;
const totalLotes = Math.ceil(itens.length / BATCH);

for (let li = 0; li < totalLotes; li++) {
  const lote = itens.slice(li * BATCH, (li + 1) * BATCH);
  const linhas = lote.map(it => `${it.id}|${it.nome}|${it.unidade}|${it.categoria ?? "-"}`).join("\n");
  const prompt = `Você é um especialista em precificação de materiais e equipamentos de construção civil no Brasil em 2025.

Para CADA item abaixo (formato: id|nome|unidade|categoria), estime o PREÇO MÉDIO UNITÁRIO de mercado para compra/aquisição em Reais (R$). Use seu conhecimento de mercado para itens comuns (cimento, aço, ferramentas, EPIs, hidráulica, elétrica, etc).

Itens:
${linhas}

REGRAS IMPORTANTES:
- Se o nome for muito vago (ex.: "Almoço", "Diversos", "Material X") ou se for impossível estimar com confiança, use preco=0 e confianca="baixa".
- Caso contrário, dê o melhor preço médio realista para o varejo brasileiro de construção.
- Considere a unidade (kg, m², un, sc, L etc) ao precificar.
- NÃO invente valores absurdos. Para itens incertos, prefira preco=0.

Responda APENAS com um JSON no formato (sem markdown, sem comentários):
{"itens":[{"id":<id>,"preco":<numero_em_reais>,"confianca":"alta"|"media"|"baixa"}]}`;

  process.stdout.write(`\nLote ${li+1}/${totalLotes} (${lote.length} itens)... `);
  if (li > 0) await new Promise(r => setTimeout(r, 2500)); // ~24 req/min — abaixo do limite 30 do flash-lite
  try {
    const text = await callIA(prompt);
    let parsed = null;
    // Tentativa 1: JSON completo
    try {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {}
    // Tentativa 2: salvar entradas individuais via regex (resilient a vírgulas/aspas malformadas)
    if (!parsed || !Array.isArray(parsed.itens)) {
      const re = /\{\s*"id"\s*:\s*(\d+)\s*,\s*"preco"\s*:\s*([\d.]+)\s*(?:,\s*"confianca"\s*:\s*"(\w+)")?[^}]*\}/g;
      const recovered = [];
      let m2;
      while ((m2 = re.exec(text)) !== null) {
        recovered.push({ id: Number(m2[1]), preco: Number(m2[2]), confianca: m2[3] || "media" });
      }
      if (recovered.length > 0) parsed = { itens: recovered };
    }
    if (!parsed || !Array.isArray(parsed.itens)) { console.log("✗ JSON irrecuperável"); totalFalhas += lote.length; continue; }
    const respostas = parsed.itens;
    const byId = new Map(respostas.map(r => [Number(r.id), r]));
    let okLote = 0;
    for (const it of lote) {
      const r = byId.get(it.id);
      if (!r || !Number.isFinite(Number(r.preco)) || Number(r.preco) <= 0) { totalFalhas++; continue; }
      await client.query(
        `UPDATE almoxarifado_itens
         SET valor_unitario = $1, preco_preenchido_ia = true, preco_ia_em = NOW()
         WHERE id = $2`,
        [Number(r.preco).toFixed(2), it.id]
      );
      okLote++; totalAtualizados++;
    }
    process.stdout.write(`✓ ${okLote}/${lote.length} atualizados`);
  } catch (e) {
    console.log(`✗ ERRO: ${e.message}`);
    totalFalhas += lote.length;
  }
}

console.log(`\n\n═══════════════════════════════════════`);
console.log(`Total: ${totalAtualizados} atualizados · ${totalFalhas} falharam · ${itens.length} processados`);
console.log(`═══════════════════════════════════════`);

const { rows: stat } = await client.query(
  `SELECT count(*) FILTER (WHERE preco_preenchido_ia = true) ia,
          count(*) FILTER (WHERE valor_unitario > 0) com_preco,
          count(*) total
   FROM almoxarifado_itens WHERE company_id = $1 AND ativo = true`,
  [COMPANY_ID]
);
console.log(`Estado final: ${stat[0].com_preco}/${stat[0].total} com preço (${stat[0].ia} marcados como IA)`);

await client.end();
