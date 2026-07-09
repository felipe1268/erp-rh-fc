import { getDb } from "../db";
import { fornecedores } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

const COMPANY_ID = 60002;

async function main() {
  const db = await getDb();
  if (!db) { console.error("DB indisponível"); process.exit(1); }

  const rows = await db.select().from(fornecedores).where(eq(fornecedores.companyId, COMPANY_ID));
  const ativos = (rows as any[]).filter(f => f.ativo !== false);

  const categoriasSet = new Set<string>();
  ativos.forEach(f => { if (Array.isArray(f.categorias)) f.categorias.forEach((c: string) => categoriasSet.add(c)); });
  const listaCategorias = Array.from(categoriasSet).sort();

  const semCategoria = ativos.filter(f => !Array.isArray(f.categorias) || f.categorias.length === 0);

  const LIMIT = Number(process.env.BATCH_LIMIT || 0) || semCategoria.length;
  const lote = semCategoria.slice(0, LIMIT);

  console.log(`Total sem categoria restantes: ${semCategoria.length} — processando lote de ${lote.length}`);
  console.log(`Categorias disponíveis (${listaCategorias.length}): ${listaCategorias.join(", ")}`);

  let sucesso = 0, falhas = 0;
  const falhasDetalhe: any[] = [];
  for (let i = 0; i < lote.length; i++) {
    const f = lote[i];
    try {
      const atividade = f.atividadePrincipal || "";
      let categoriaEscolhida = "Materiais diversos";
      const result = await invokeLLM({
        messages: [{
          role: "user",
          content: `Classifique este fornecedor de uma empresa de construção civil em UMA categoria da lista abaixo (responda só o nome exato da categoria, sem explicações, sem aspas).\n\nFornecedor (razão social): ${f.razaoSocial}\nNome fantasia: ${f.nomeFantasia || "—"}\nAtividade principal (CNAE, se conhecida): ${atividade || "desconhecida"}\n\nCategorias disponíveis:\n${listaCategorias.join("\n")}\n\nSe nenhuma categoria da lista fizer sentido pelo nome/atividade, responda exatamente: Materiais diversos`,
        }],
        maxTokens: 30,
      });
      const conteudo = result.choices?.[0]?.message?.content;
      const resposta = (typeof conteudo === "string" ? conteudo : "").trim();
      categoriaEscolhida = listaCategorias.find(c => c.toLowerCase() === resposta.toLowerCase()) || "Materiais diversos";
      categoriasSet.add(categoriaEscolhida);

      await db.update(fornecedores)
        .set({ categorias: [categoriaEscolhida], atualizadoEm: new Date().toISOString() })
        .where(eq(fornecedores.id, f.id));
      sucesso++;
    } catch (e: any) {
      falhas++;
      falhasDetalhe.push({ id: f.id, razaoSocial: f.razaoSocial, erro: e?.message });
    }
    if ((i + 1) % 25 === 0 || i === lote.length - 1) {
      console.log(`Progresso: ${i + 1}/${lote.length} — sucesso=${sucesso} falhas=${falhas}`);
    }
  }

  console.log("=== RESULTADO FINAL ===");
  console.log(`Sucesso: ${sucesso}`);
  console.log(`Falhas: ${falhas}`);
  if (falhasDetalhe.length > 0) console.log("Detalhe falhas:", JSON.stringify(falhasDetalhe.slice(0, 20), null, 2));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
