/**
 * DOM Monkey-Patch: Silencia o erro "removeChild" do React em produção.
 * 
 * O React 19 em modo produção (minificado) às vezes tenta remover nós DOM
 * que já foram removidos por portais do Radix UI ou por extensões do browser.
 * Isso causa um "NotFoundError: Failed to execute 'removeChild' on 'Node'".
 * 
 * Este patch intercepta removeChild e insertBefore para ignorar silenciosamente
 * esses erros ao invés de crashar a aplicação inteira.
 * 
 * Referência: https://github.com/facebook/react/issues/11538
 */

export function patchDomForReact() {
  if (typeof window === 'undefined') return;

  // Patch removeChild
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      // O nó já foi removido ou movido - ignorar silenciosamente
      if (console && console.warn) {
        console.warn('[DOM Patch] removeChild chamado em nó que não é filho - ignorado silenciosamente');
      }
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  // Patch insertBefore
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // O nó de referência não é mais filho deste nó - ignorar silenciosamente
      if (console && console.warn) {
        console.warn('[DOM Patch] insertBefore chamado com referenceNode que não é filho - ignorado silenciosamente');
      }
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
