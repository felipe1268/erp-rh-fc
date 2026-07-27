/**
 * Rev. 4680 — Pilha de navegação interna do app (SPA).
 *
 * O botão "Voltar" usava window.history.back(), mas no Safari/iPad o histórico
 * do navegador nem sempre reflete a navegação interna (ex.: voltava pra tela
 * inicial em vez da tela anterior). Esta pilha registra cada rota visitada na
 * sessão e permite voltar EXATAMENTE uma tela dentro do sistema.
 */
const KEY = "_fcNavStack";

function lerPilha(): string[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function gravarPilha(stack: string[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-50))); } catch {}
}

// Rotas fora do fluxo autenticado — não entram na pilha (e /login limpa ela,
// senão o Voltar poderia levar de volta a contextos públicos/expirados).
const ROTAS_EXCLUIDAS = [/^\/login/, /^\/assinar\//, /^\/cipa\/votar\//, /^\/ciencia\//, /^\/portal\//, /^\/verificar\//, /^\/fluxo\//];

/** Registra a rota atual (chamado a cada mudança de location no Router). */
export function recordNav(pathname: string) {
  if (ROTAS_EXCLUIDAS.some((re) => re.test(pathname))) {
    if (/^\/login/.test(pathname)) gravarPilha([]); // login/logout zera o contexto
    return;
  }
  // pathname (wouter) + querystring atual → volta pra TELA exata (?tab=, ?emp=…)
  const loc = pathname + (window.location.search || "");
  const stack = lerPilha();
  if (stack[stack.length - 1] === loc) return; // refresh/re-render — não duplica
  // Se o usuário "voltou" pra rota que era a penúltima, desempilha em vez de
  // empilhar de novo (mantém a pilha coerente com Voltar em cadeia).
  if (stack.length >= 2 && stack[stack.length - 2] === loc) {
    stack.pop();
  } else {
    stack.push(loc);
  }
  gravarPilha(stack);
}

/** Retorna a rota anterior (sem mutar a pilha) ou null se não houver. */
export function peekPrevNav(): string | null {
  const stack = lerPilha();
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}

/**
 * Volta UMA tela: retorna a rota anterior da pilha (já desempilhando a atual),
 * ou null se a sessão começou nesta tela (caller decide o fallback).
 */
export function popNavBack(): string | null {
  const stack = lerPilha();
  if (stack.length < 2) return null;
  stack.pop(); // rota atual
  const prev = stack[stack.length - 1];
  gravarPilha(stack);
  return prev;
}
