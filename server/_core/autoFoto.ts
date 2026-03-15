/**
 * Busca automática de fotos para itens usando:
 * 1. Gemini para gerar os melhores termos de busca em inglês
 * 2. API Openverse (gratuita, 600M+ imagens) para encontrar URLs reais
 * 3. Verificação de URL via HEAD request
 */

import { invokeLLM } from "./llm";

async function traduzirParaBuscaIngles(nomeItem: string): Promise<string[]> {
  try {
    const prompt = `Você é um especialista em busca de imagens de produtos de construção civil e EPIs brasileiros.

Item: "${nomeItem}"

Gere 3 termos de busca em INGLÊS (específicos e objetivos) para encontrar uma foto de produto deste item em bancos de imagens internacionais.
Foque no tipo do produto, não na marca.

Retorne APENAS JSON válido no formato:
{"termos": ["termo1", "termo2", "termo3"]}

Exemplos:
- "Disco de Corte 4.5 pol" → {"termos": ["cutting disc grinder", "angle grinder cutting wheel", "metal cutting disk"]}
- "Capacete de Segurança Amarelo" → {"termos": ["yellow hard hat construction", "safety helmet worker", "construction hard hat"]}
- "Luva de Raspa" → {"termos": ["leather work gloves", "safety work gloves construction", "protective gloves worker"]}
- "Cimento CP-II" → {"termos": ["cement bag concrete", "portland cement sack", "construction cement bag"]}
- "Prego 17x27" → {"termos": ["nails construction wood", "common wire nail", "building nails fasteners"]}
- "Rolo de Pintura" → {"termos": ["paint roller construction", "painting roller brush", "wall paint roller"]}`;

    const response = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      generationConfig: { thinkingBudget: 0, maxOutputTokens: 300 },
    });
    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || response?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.termos || [];
    }
  } catch (e) {
    console.warn("[autoFoto] Erro ao traduzir:", e);
  }
  // Fallback: usar o próprio nome
  return [nomeItem, nomeItem.split(" ").slice(0, 3).join(" ")];
}

async function buscarImagemOpenverse(query: string): Promise<string | null> {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=5&mature=false&license_type=commercial,modification`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "FC-ERP-System/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const results = data.results || [];
    // Prefere imagens do Wikimedia (mais confiáveis) e depois Flickr
    const sorted = results.sort((a: any, b: any) => {
      const aIsWiki = a.url?.includes("wikimedia.org") ? 0 : 1;
      const bIsWiki = b.url?.includes("wikimedia.org") ? 0 : 1;
      return aIsWiki - bIsWiki;
    });
    for (const item of sorted.slice(0, 5)) {
      const imageUrl = item.url;
      if (!imageUrl) continue;
      // Verifica se a URL retorna uma imagem válida
      try {
        const check = await fetch(imageUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        if (check.ok) {
          const ct = check.headers.get("content-type") || "";
          if (ct.startsWith("image/")) {
            return imageUrl;
          }
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch (e) {
    console.warn("[autoFoto] Erro Openverse:", query, e);
    return null;
  }
}

/**
 * Busca a melhor foto para um item dado o nome.
 * Retorna a URL da imagem ou null se não encontrar.
 */
export async function buscarFotoParaItem(nomeItem: string): Promise<string | null> {
  const termos = await traduzirParaBuscaIngles(nomeItem);
  for (const termo of termos) {
    const url = await buscarImagemOpenverse(termo);
    if (url) {
      console.log(`[autoFoto] ✓ ${nomeItem} → ${url.substring(0, 60)}`);
      return url;
    }
  }
  console.log(`[autoFoto] ✗ Sem resultado para: ${nomeItem}`);
  return null;
}
