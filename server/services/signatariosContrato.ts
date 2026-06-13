import { sql } from "drizzle-orm";

// Rev. 3050 — Resolução dos signatários PADRÃO de TODO contrato online (FCSign).
// Regra de negócio: todo contrato deve ser assinado por 3 signatários — FORNECEDOR
// + GESTOR DA OBRA + SÓCIO ADMINISTRADOR — cada um com seus respectivos dados.
// Estes helpers resolvem o GESTOR DA OBRA e o SÓCIO ADMINISTRADOR a partir do banco.
// Compartilhados entre a geração automática (via OC, compras.ts) e a manual
// (integrasign.criarEnvelope). Qualquer falha NÃO quebra a criação do envelope.

// SÓCIO ADMINISTRADOR atual da empresa (definido em Configurações → Sócios;
// persistido em system_criteria). Retorna nome + CPF/CNPJ. Fallback "Diretor".
export async function resolveSocioAdministradorSigner(
  db: any,
  companyId: number,
): Promise<{ nome: string; cpfCnpj: string | null }> {
  try {
    const cr: any = await db.execute(
      sql`SELECT valor FROM system_criteria WHERE "companyId"=${companyId} AND chave='socio_administrador_employee_id' LIMIT 1`,
    );
    const valor = (cr?.rows ?? cr)?.[0]?.valor;
    const empId = valor ? Number(valor) : null;
    if (empId && !Number.isNaN(empId)) {
      const er: any = await db.execute(
        sql`SELECT "nomeCompleto" AS nome, cpf FROM employees WHERE id=${empId} AND "companyId"=${companyId} AND "tipoContrato"='Socio' LIMIT 1`,
      );
      const e = (er?.rows ?? er)?.[0];
      if (e?.nome) return { nome: e.nome, cpfCnpj: e.cpf ?? null };
    }
  } catch (err: any) {
    console.error("[IntegraSign] resolveSocioAdministradorSigner erro:", err?.message);
  }
  return { nome: "Diretor", cpfCnpj: null };
}

// GESTOR DA OBRA — o responsável cadastrado na obra (obras.responsavel, texto).
// A obra não armazena CPF do responsável, então cpfCnpj fica null. Sem obra
// vinculada, retorna nome vazio (o chamador decide o fallback).
export async function resolveGestorObraSigner(
  db: any,
  companyId: number,
  obraId: number | null,
): Promise<{ nome: string; cpfCnpj: string | null }> {
  if (!obraId) return { nome: "", cpfCnpj: null };
  try {
    const r: any = await db.execute(
      sql`SELECT responsavel FROM obras WHERE id=${obraId} AND "companyId"=${companyId} LIMIT 1`,
    );
    const o = (r?.rows ?? r)?.[0];
    if (o?.responsavel) return { nome: o.responsavel, cpfCnpj: null };
  } catch (err: any) {
    console.error("[IntegraSign] resolveGestorObraSigner erro:", err?.message);
  }
  return { nome: "", cpfCnpj: null };
}
