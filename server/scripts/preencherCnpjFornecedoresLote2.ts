import { getDb } from "../db";
import { fornecedores } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import fs from "fs";

const CANDIDATOS: { id: number; nome: string; cidade?: string; cnpjCandidates: string[] }[] = JSON.parse(
  fs.readFileSync("/tmp/candidatos_lote2.json", "utf8")
);

const MAX_LEN: Record<string, number> = {
  endereco: 255, numero: 20, complemento: 100, bairro: 100, cidade: 100, estado: 2,
  cep: 10, telefone: 20, email: 255, naturezaJuridica: 255, porte: 100,
  atividadePrincipal: 500, dataAbertura: 20,
};

function normaliza(s: string) {
  return (s || "")
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(LTDA|EIRELI|ME|EPP|SA|S A|COMERCIO|COM|DE|E|DO|DA|DOS|DAS|LTADA)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similaridade(a: string, b: string): number {
  const na = normaliza(a);
  const nb = normaliza(b);
  if (!na || !nb) return 0;
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  let inter = 0;
  wa.forEach(w => { if (wb.has(w)) inter++; });
  return inter / Math.max(wa.size, wb.size);
}

async function buscarBrasilAPI(cnpjLimpo: string) {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const d = await res.json() as any;
  return {
    razaoSocial: d.razao_social ?? "",
    nomeFantasia: d.nome_fantasia ?? "",
    situacao: d.descricao_situacao_cadastral ?? "",
    municipio: d.municipio ?? "",
    endereco: d.logradouro ? `${d.descricao_tipo_de_logradouro ?? ""} ${d.logradouro}`.trim() : "",
    numero: d.numero ?? "",
    complemento: d.complemento ?? "",
    bairro: d.bairro ?? "",
    cidade: d.municipio ?? "",
    estado: d.uf ?? "",
    cep: d.cep ?? "",
    telefone: d.ddd_telefone_1 ?? "",
    email: d.email ?? "",
    naturezaJuridica: d.natureza_juridica ?? "",
    porte: d.porte ?? "",
    atividadePrincipal: d.cnae_fiscal_descricao ?? "",
    dataAbertura: d.data_inicio_atividade ?? "",
  };
}

function formatCnpj(digits: string) {
  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`;
}

async function main() {
  const db = await getDb();
  if (!db) { console.error("Sem conexão com o banco."); process.exit(1); }

  const resultado: any[] = [];

  for (const cand of CANDIDATOS) {
    const [existing] = await db.select().from(fornecedores).where(eq(fornecedores.id, cand.id));
    if (!existing) { resultado.push({ id: cand.id, status: "não encontrado no banco" }); continue; }
    if ((existing as any).cnpj) { resultado.push({ id: cand.id, nome: cand.nome, status: "já tem CNPJ, pulado" }); continue; }
    if (cand.cnpjCandidates.length === 0) { resultado.push({ id: cand.id, nome: cand.nome, status: "nenhum CNPJ encontrado na busca web" }); continue; }

    let escolhido: any = null;
    let cnpjFormatado: string | null = null;
    let melhorSim = 0;
    for (const cnpjLimpo of cand.cnpjCandidates.slice(0, 3)) {
      let dados: any = null;
      try { dados = await buscarBrasilAPI(cnpjLimpo); } catch { continue; }
      if (!dados) continue;
      const sim = Math.max(similaridade(cand.nome, dados.razaoSocial), similaridade(cand.nome, dados.nomeFantasia));
      const ativa = /ATIVA/i.test(dados.situacao);
      if (sim > melhorSim) melhorSim = sim;
      if (sim >= 0.4 && ativa) {
        const cnpjFmt = formatCnpj(cnpjLimpo);
        const [duplicado] = await db.select({ id: fornecedores.id }).from(fornecedores).where(eq(fornecedores.cnpj, cnpjFmt));
        if (duplicado && duplicado.id !== cand.id) continue;
        escolhido = dados;
        cnpjFormatado = cnpjFmt;
        break;
      }
    }

    if (!escolhido || !cnpjFormatado) {
      resultado.push({ id: cand.id, nome: cand.nome, melhorSimilaridade: melhorSim.toFixed(2), status: "sem correspondência confiável — pulado por segurança" });
      continue;
    }

    const patch: Record<string, any> = { cnpj: cnpjFormatado };
    const campos = ["endereco", "numero", "complemento", "bairro", "cidade", "estado", "cep", "telefone", "email", "naturezaJuridica", "porte", "atividadePrincipal", "dataAbertura"] as const;
    for (const campo of campos) {
      const atual = (existing as any)[campo];
      let novo = (escolhido as any)[campo];
      if (novo && MAX_LEN[campo] && String(novo).length > MAX_LEN[campo]) {
        novo = campo === "telefone" ? String(novo).split("/")[0].trim() : String(novo).slice(0, MAX_LEN[campo]);
      }
      if ((!atual || String(atual).trim() === "") && novo) patch[campo] = novo;
    }

    let categoriaEscolhida: string | null = null;
    const semCategoria = !Array.isArray((existing as any).categorias) || (existing as any).categorias.length === 0;
    if (semCategoria) {
      const outrasCategorias = await db.select({ categorias: fornecedores.categorias })
        .from(fornecedores)
        .where(and(eq(fornecedores.companyId, (existing as any).companyId), eq(fornecedores.ativo, true)));
      const set = new Set<string>();
      outrasCategorias.forEach((r: any) => { if (Array.isArray(r.categorias)) r.categorias.forEach((c: string) => set.add(c)); });
      const listaCategorias = Array.from(set).sort();
      const atividade = patch.atividadePrincipal || (existing as any).atividadePrincipal || "";
      try {
        if (listaCategorias.length > 0) {
          const result = await invokeLLM({
            messages: [{
              role: "user",
              content: `Classifique este fornecedor de uma empresa de construção civil em UMA categoria da lista abaixo (responda só o nome exato da categoria, sem explicações).\n\nFornecedor: ${(existing as any).razaoSocial}\nAtividade principal (CNAE): ${atividade || "desconhecida"}\n\nCategorias disponíveis:\n${listaCategorias.join("\n")}\n\nSe nenhuma categoria da lista fizer sentido, responda exatamente: Materiais diversos`,
            }],
            maxTokens: 30,
          });
          const conteudo = result.choices?.[0]?.message?.content;
          const resposta = (typeof conteudo === "string" ? conteudo : "").trim();
          categoriaEscolhida = listaCategorias.find(c => c.toLowerCase() === resposta.toLowerCase()) || "Materiais diversos";
        } else {
          categoriaEscolhida = "Materiais diversos";
        }
      } catch {
        categoriaEscolhida = "Materiais diversos";
      }
      patch.categorias = [categoriaEscolhida];
    }

    patch.atualizadoEm = new Date().toISOString();
    await db.update(fornecedores).set(patch).where(eq(fornecedores.id, cand.id));
    resultado.push({ id: cand.id, nome: cand.nome, cnpj: cnpjFormatado, razaoSocialOficial: escolhido.razaoSocial, situacao: escolhido.situacao, similaridade: melhorSim.toFixed(2), categoria: categoriaEscolhida });
  }

  fs.writeFileSync("/tmp/resultado_lote2.json", JSON.stringify(resultado, null, 0));
  const aplicados = resultado.filter((r: any) => r.cnpj).length;
  console.log(`TOTAL APLICADOS: ${aplicados} de ${CANDIDATOS.length} candidatos.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
