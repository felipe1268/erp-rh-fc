/**
 * Padronização de nomes de empresas (razão social / nome fantasia).
 *
 * Rev. 2883 — REGRA ATUAL (substitui o Title Case da Rev. 2881): não importa como o
 * usuário digitar (tudo minúsculo, misturado, Title Case), o nome é SEMPRE salvo em
 * CAIXA ALTA (TUDO EM MAIÚSCULAS), padronizando a lista de fornecedores / empresas
 * terceiras conforme pedido do usuário.
 *
 * Regras:
 *   1. Trim + colapsar espaços múltiplos.
 *   2. Tudo em maiúsculas (`toUpperCase`).
 *
 * Idempotente: aplicar duas vezes dá o mesmo resultado.
 *
 * Usado no backend (compras/terceiros — todos os writes de nome) e no frontend
 * (onBlur dos campos Razão Social / Nome Fantasia).
 */
export function upperCaseEmpresa(input?: string | null): string {
  return (input || "").trim().replace(/\s+/g, " ").toUpperCase();
}
