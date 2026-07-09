import { getDb } from "../db";
import { fornecedores } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

const COMPANY_ID = 60002;

async function buscarBrasilAPI(cnpjLimpo: string) {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const d = await res.json() as any;
    return {
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
  } catch { return null; }
}

async function buscarReceitaWS(cnpjLimpo: string) {
  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpjLimpo}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const d = await res.json() as any;
    if (d.status === "ERROR") return null;
    return {
      endereco: d.logradouro ?? "",
      numero: d.numero ?? "",
      complemento: d.complemento ?? "",
      bairro: d.bairro ?? "",
      cidade: d.municipio ?? "",
      estado: d.uf ?? "",
      cep: (d.cep ?? "").replace(/[.\-]/g, ""),
      telefone: d.telefone ?? "",
      email: d.email ?? "",
      naturezaJuridica: d.natureza_juridica ?? "",
      porte: d.porte ?? "",
      atividadePrincipal: d.atividade_principal?.[0]?.text ?? "",
      dataAbertura: d.abertura ?? "",
    };
  } catch { return null; }
}

const MAX_LEN: Record<string, number> = {
  endereco: 255, numero: 20, complemento: 100, bairro: 100, cidade: 100, estado: 2,
  cep: 10, telefone: 20, email: 255, naturezaJuridica: 255, porte: 100,
  atividadePrincipal: 500, dataAbertura: 20,
};

async function processarUm(db: any, existing: any, categoriasExistentesSet: Set<string>) {
  const cnpjLimpo = (existing.cnpj || "").replace(/\D/g, "");
  if (cnpjLimpo.length !== 14) return { id: existing.id, skipped: true, motivo: "sem_cnpj" };

  const dadosOficiais = await buscarBrasilAPI(cnpjLimpo) || await buscarReceitaWS(cnpjLimpo);
  const patch: Record<string, any> = {};
  if (dadosOficiais) {
    const campos = ["endereco","numero","complemento","bairro","cidade","estado","cep","telefone","email","naturezaJuridica","porte","atividadePrincipal","dataAbertura"] as const;
    for (const campo of campos) {
      const atual = (existing as any)[campo];
      let novo = (dadosOficiais as any)[campo];
      if (novo && MAX_LEN[campo] && String(novo).length > MAX_LEN[campo]) {
        novo = campo === "telefone" ? String(novo).split("/")[0].trim() : String(novo).slice(0, MAX_LEN[campo]);
      }
      if ((!atual || String(atual).trim() === "") && novo) patch[campo] = novo;
    }
  }

  const semCategoria = !Array.isArray(existing.categorias) || existing.categorias.length === 0;
  if (semCategoria) {
    const listaCategorias = Array.from(categoriasExistentesSet).sort();
    const atividade = patch.atividadePrincipal || existing.atividadePrincipal || "";
    let categoriaEscolhida = "Materiais diversos";
    try {
      if (listaCategorias.length > 0) {
        const result = await invokeLLM({
          messages: [{
            role: "user",
            content: `Classifique este fornecedor de uma empresa de construção civil em UMA categoria da lista abaixo (responda só o nome exato da categoria, sem explicações).\n\nFornecedor: ${existing.razaoSocial}\nAtividade principal (CNAE): ${atividade || "desconhecida"}\n\nCategorias disponíveis:\n${listaCategorias.join("\n")}\n\nSe nenhuma categoria da lista fizer sentido, responda exatamente: Materiais diversos`,
          }],
          maxTokens: 30,
        });
        const conteudo = result.choices?.[0]?.message?.content;
        const resposta = (typeof conteudo === "string" ? conteudo : "").trim();
        categoriaEscolhida = listaCategorias.find(c => c.toLowerCase() === resposta.toLowerCase()) || "Materiais diversos";
      }
    } catch { categoriaEscolhida = "Materiais diversos"; }
    patch.categorias = [categoriaEscolhida];
    categoriasExistentesSet.add(categoriaEscolhida);
  }

  if (Object.keys(patch).length === 0) return { id: existing.id, skipped: true, motivo: "nada_a_preencher" };
  patch.atualizadoEm = new Date().toISOString();
  await db.update(fornecedores).set(patch).where(eq(fornecedores.id, existing.id));
  return { id: existing.id, skipped: false, camposPreenchidos: Object.keys(patch) };
}

async function main() {
  const db = await getDb();
  if (!db) { console.error("DB indisponível"); process.exit(1); }

  const rows = await db.select().from(fornecedores).where(eq(fornecedores.companyId, COMPANY_ID));
  const ativos = (rows as any[]).filter(f => f.ativo !== false);

  const categoriasSet = new Set<string>();
  ativos.forEach(f => { if (Array.isArray(f.categorias)) f.categorias.forEach((c: string) => categoriasSet.add(c)); });

  const candidatos = ativos.filter(f => {
    const cnpjLimpo = (f.cnpj || "").replace(/\D/g, "");
    if (cnpjLimpo.length !== 14) return false;
    const semEndereco = !f.endereco || !f.cidade || (!f.telefone && !f.email);
    const semCategoria = !Array.isArray(f.categorias) || f.categorias.length === 0;
    return semEndereco || semCategoria;
  });

  const LIMIT = Number(process.env.BATCH_LIMIT || 0) || candidatos.length;
  const lote = candidatos.slice(0, LIMIT);

  console.log(`Total candidatos restantes (com CNPJ, dados incompletos): ${candidatos.length} — processando lote de ${lote.length}`);

  let sucesso = 0, semAlteracao = 0, falhas = 0;
  const falhasDetalhe: any[] = [];
  for (let i = 0; i < lote.length; i++) {
    const f = lote[i];
    try {
      const r = await processarUm(db, f, categoriasSet);
      if (r.skipped) semAlteracao++; else sucesso++;
    } catch (e: any) {
      falhas++;
      falhasDetalhe.push({ id: f.id, razaoSocial: f.razaoSocial, erro: e?.message });
    }
    if ((i + 1) % 25 === 0 || i === candidatos.length - 1) {
      console.log(`Progresso: ${i + 1}/${candidatos.length} — sucesso=${sucesso} semAlteracao=${semAlteracao} falhas=${falhas}`);
    }
  }

  console.log("=== RESULTADO FINAL ===");
  console.log(`Sucesso: ${sucesso}`);
  console.log(`Sem alteração: ${semAlteracao}`);
  console.log(`Falhas: ${falhas}`);
  if (falhasDetalhe.length > 0) console.log("Detalhe falhas:", JSON.stringify(falhasDetalhe.slice(0, 20), null, 2));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
