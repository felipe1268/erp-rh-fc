import { getDb } from "../db";
import { fornecedores } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

const CANDIDATOS: { id: number; cnpj: string }[] = [
  { id: 132, cnpj: "55.500.941/0001-86" },
  { id: 139, cnpj: "90.400.888/0001-42" },
  { id: 473, cnpj: "92.660.406/0001-19" },
  { id: 476, cnpj: "44.384.620/0001-47" },
  { id: 582, cnpj: "66.294.976/0001-22" },
  { id: 635, cnpj: "51.356.743/0001-30" },
  { id: 643, cnpj: "41.577.732/0001-26" },
  { id: 661, cnpj: "19.561.419/0001-40" },
  { id: 666, cnpj: "13.158.588/0001-58" },
  { id: 714, cnpj: "48.746.332/0001-46" },
  { id: 961, cnpj: "44.914.992/0001-38" },
  { id: 1066, cnpj: "03.812.693/0001-05" },
  { id: 1102, cnpj: "04.330.318/0001-91" },
  { id: 1129, cnpj: "53.266.889/0001-10" },
  { id: 1236, cnpj: "04.379.147/0001-95" },
  { id: 81, cnpj: "10.419.015/0001-42" },
];

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
    .replace(/\b(LTDA|EIRELI|ME|EPP|SA|S A|COMERCIO|COM|DE|E|DO|DA|DOS|DAS)\b/g, " ")
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
    situacao: d.descricao_situacao_cadastral ?? "",
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

async function main() {
  const db = await getDb();
  if (!db) { console.error("Sem conexão com o banco."); process.exit(1); }

  const resultado: any[] = [];

  for (const cand of CANDIDATOS) {
    const cnpjLimpo = cand.cnpj.replace(/\D/g, "");
    const [existing] = await db.select().from(fornecedores).where(eq(fornecedores.id, cand.id));
    if (!existing) { resultado.push({ id: cand.id, status: "não encontrado no banco" }); continue; }
    if ((existing as any).cnpj) { resultado.push({ id: cand.id, razaoSocial: (existing as any).razaoSocial, status: "já tem CNPJ, pulado" }); continue; }

    const [duplicado] = await db.select({ id: fornecedores.id }).from(fornecedores).where(eq(fornecedores.cnpj, cand.cnpj));
    if (duplicado) { resultado.push({ id: cand.id, razaoSocial: (existing as any).razaoSocial, status: `CNPJ já usado por fornecedor #${duplicado.id}, pulado (evita duplicidade)` }); continue; }

    let dados: any = null;
    try {
      dados = await buscarBrasilAPI(cnpjLimpo);
    } catch (e) {
      resultado.push({ id: cand.id, razaoSocial: (existing as any).razaoSocial, status: "erro ao consultar BrasilAPI" });
      continue;
    }
    if (!dados) { resultado.push({ id: cand.id, razaoSocial: (existing as any).razaoSocial, status: "CNPJ não encontrado na BrasilAPI" }); continue; }

    const sim = similaridade((existing as any).razaoSocial, dados.razaoSocial);
    const ativa = /ATIVA/i.test(dados.situacao);
    if (sim < 0.5) {
      resultado.push({ id: cand.id, razaoSocial: (existing as any).razaoSocial, receitaRazaoSocial: dados.razaoSocial, similaridade: sim.toFixed(2), status: "BAIXA SIMILARIDADE — pulado por segurança" });
      continue;
    }
    if (!ativa) {
      resultado.push({ id: cand.id, razaoSocial: (existing as any).razaoSocial, situacao: dados.situacao, status: "CNPJ encontrado mas NÃO ATIVA — pulado por segurança" });
      continue;
    }

    const patch: Record<string, any> = { cnpj: cand.cnpj };
    const campos = ["endereco", "numero", "complemento", "bairro", "cidade", "estado", "cep", "telefone", "email", "naturezaJuridica", "porte", "atividadePrincipal", "dataAbertura"] as const;
    for (const campo of campos) {
      const atual = (existing as any)[campo];
      let novo = (dados as any)[campo];
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
    resultado.push({ id: cand.id, razaoSocial: (existing as any).razaoSocial, cnpj: cand.cnpj, situacao: dados.situacao, similaridade: sim.toFixed(2), categoria: categoriaEscolhida, camposPreenchidos: Object.keys(patch) });
  }

  console.log(JSON.stringify(resultado, null, 2));
  const aplicados = resultado.filter(r => r.cnpj).length;
  console.log(`\nTOTAL APLICADOS: ${aplicados} de ${CANDIDATOS.length} candidatos.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
