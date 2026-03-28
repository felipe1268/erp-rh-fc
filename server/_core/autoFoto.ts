/**
 * Busca automática de fotos para itens de almoxarifado.
 * 
 * Estratégia:
 * 1. Busca de imagens via DuckDuckGo (nome do produto em PT-BR)
 * 2. Preferência para sites de e-commerce (Leroy Merlin, ML, etc.)
 * 3. Validação de URL retornando imagem real
 * 
 * Executa em background após entrada de itens sem foto.
 */

import { invokeLLM } from "./llm";

function limparNomeProduto(nome: string): string {
  return nome
    .replace(/\[[\d.]+\]/g, "")
    .replace(/\s*-\s*P\.\d[\d.]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function obterVQDToken(query: string): Promise<string | null> {
  try {
    const resp = await fetch(
      "https://duckduckgo.com/?q=" + encodeURIComponent(query) + "&iax=images&ia=images",
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!resp.ok) return null;
    const html = await resp.text();
    const match = html.match(/vqd=['"]([^'"]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function buscarImagensDDG(query: string): Promise<string[]> {
  try {
    const vqd = await obterVQDToken(query);
    if (!vqd) return [];

    const url = "https://duckduckgo.com/i.js?l=br-pt&o=json&q=" +
      encodeURIComponent(query) + "&vqd=" + vqd + "&f=,,,,,&p=1";

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        "Referer": "https://duckduckgo.com/",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return (data.results || [])
      .map((r: any) => r.image)
      .filter((u: any) => typeof u === "string" && u.startsWith("http"));
  } catch (e) {
    console.warn("[autoFoto] Erro DDG:", e);
    return [];
  }
}

const PREFERRED_DOMAINS = [
  "leroymerlin", "telhanorte", "cec.com", "obramax",
  "mlstatic.com", "mercadolivre", "magazineluiza", "magalu",
  "casasbahia", "americanas", "shopee", "amazon.com.br",
  "tcdn.com.br", "vteximg", "vtexassets",
];

async function validarImagem(url: string): Promise<boolean> {
  try {
    const check = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0" },
    });
    if (!check.ok) return false;
    const ct = check.headers.get("content-type") || "";
    const cl = parseInt(check.headers.get("content-length") || "0");
    return ct.startsWith("image/") && (cl === 0 || cl > 3000);
  } catch {
    return false;
  }
}

async function gerarTermosIA(nome: string): Promise<string[]> {
  try {
    const limpo = limparNomeProduto(nome);
    const response = await invokeLLM({
      messages: [{
        role: "user",
        content: `Dado o item de construção civil: "${limpo}"

Gere 2 termos de busca curtos em PORTUGUÊS para encontrar a foto deste produto em lojas online brasileiras.
Foque no tipo+marca. Sem códigos.

Retorne APENAS JSON: {"termos": ["termo1", "termo2"]}`
      }],
      maxTokens: 150,
    });
    const text = response?.choices?.[0]?.message?.content || response?.content || response?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return parsed.termos || [];
    }
  } catch {}
  return [];
}

/**
 * Busca a melhor foto para um item dado o nome.
 * Retorna a URL da imagem ou null se não encontrar.
 */
export async function buscarFotoParaItem(nomeItem: string): Promise<string | null> {
  const limpo = limparNomeProduto(nomeItem);

  const termos = [limpo];
  const termosIA = await gerarTermosIA(nomeItem);
  termos.push(...termosIA);

  for (const termo of termos) {
    const urls = await buscarImagensDDG(termo);
    if (urls.length === 0) continue;

    const preferred = urls.filter(u => PREFERRED_DOMAINS.some(d => u.includes(d)));
    const candidates = preferred.length > 0 ? preferred : urls;

    for (const url of candidates.slice(0, 6)) {
      if (await validarImagem(url)) {
        console.log(`[autoFoto] ✓ ${nomeItem} → ${url.substring(0, 100)}`);
        return url;
      }
    }

    for (const url of urls.slice(0, 10)) {
      if (candidates.includes(url)) continue;
      if (await validarImagem(url)) {
        console.log(`[autoFoto] ✓ ${nomeItem} → ${url.substring(0, 100)}`);
        return url;
      }
    }
  }

  console.log(`[autoFoto] ✗ Sem resultado para: ${nomeItem}`);
  return null;
}
