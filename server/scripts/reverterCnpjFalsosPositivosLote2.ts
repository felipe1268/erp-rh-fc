import { getDb } from "../db";
import { fornecedores } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const REVERT_IDS = [
  11, 29, 69, 160, 194, 231, 295, 341, 371, 452, 460, 523, 544, 668, 758, 783,
  788, 878, 919, 921, 995, 1049, 1059, 1075, 1163,
];

const CAMPOS_ENRIQUECIMENTO = [
  "endereco", "numero", "complemento", "bairro", "cidade", "estado", "cep",
  "telefone", "email", "naturezaJuridica", "porte", "atividadePrincipal", "dataAbertura",
] as const;

async function main() {
  const db = await getDb();
  if (!db) { console.error("Sem conexão com o banco."); process.exit(1); }

  let revertidos = 0;
  for (const id of REVERT_IDS) {
    const [existing] = await db.select().from(fornecedores).where(eq(fornecedores.id, id));
    if (!existing) { console.log(id, "não encontrado, pulando"); continue; }
    const patch: Record<string, any> = { cnpj: null };
    for (const campo of CAMPOS_ENRIQUECIMENTO) {
      patch[campo] = null;
    }
    patch.categorias = [];
    patch.atualizadoEm = new Date().toISOString();
    await db.update(fornecedores).set(patch).where(eq(fornecedores.id, id));
    revertidos++;
    console.log("revertido:", id, (existing as any).razaoSocial);
  }
  console.log(`TOTAL REVERTIDOS: ${revertidos} de ${REVERT_IDS.length}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
