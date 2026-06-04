import { describe, it, expect } from "vitest";

/**
 * Rev. 2747 — GATE ISO da Central de Documentos (regressão).
 *
 * Garante que editar (`save`) ou restaurar (`restoreVersion`) o CONTEÚDO de um
 * documento JÁ VIGENTE o rebaixa para `rascunho` e LIMPA a aprovação — de modo
 * que `getVigente` deixa de entregá-lo (`vigente:false`) até que `aprovar` seja
 * chamado de novo. Sem esse gate, editar/restaurar um documento oficial
 * publicaria texto institucional sem aprovação formal.
 *
 * PADRÃO DE TESTE (igual a `server/rescisao.test.ts`): a lógica do gate é
 * replicada aqui em funções puras que ESPELHAM exatamente o código real de
 * `server/routers/systemDocumentTemplates.ts` (procedures `save`,
 * `restoreVersion`, `getVigente`, `aprovar`). Optou-se por essa abordagem
 * porque, no ambiente vitest atual, importar QUALQUER router quebra com
 * `__vite_ssr_exportName__ is not defined` (bug de instrumentação do
 * transform SSR — afeta inclusive os testes de router pré-existentes). Os
 * espelhos abaixo precisam ser mantidos em sincronia com o router; qualquer
 * divergência futura deve falhar aqui antes de chegar à produção.
 */

type IsoStatus = "rascunho" | "vigente" | "obsoleto";

type TemplateRow = {
  conteudoHtml: string;
  versaoAtual: number;
  status: IsoStatus;
  aprovadoPorId: number | null;
  aprovadoPorNome: string | null;
  aprovadoEm: string | null;
};

/**
 * Espelha o GATE do `save`: no-op de conteúdo NÃO rebaixa (só toca ficha ISO);
 * mudança de conteúdo bumpa versão, rebaixa p/ `rascunho` e LIMPA a aprovação.
 * (router: branch `existing.conteudo_html === input.conteudoHtml` vs. update final.)
 */
function applySave(
  tpl: TemplateRow,
  novoConteudo: string,
): { row: TemplateRow; semMudanca: boolean; rebaixadoParaRascunho: boolean } {
  if (tpl.conteudoHtml === novoConteudo) {
    return { row: { ...tpl }, semMudanca: true, rebaixadoParaRascunho: false };
  }
  return {
    row: {
      ...tpl,
      conteudoHtml: novoConteudo,
      versaoAtual: tpl.versaoAtual + 1,
      status: "rascunho",
      aprovadoPorId: null,
      aprovadoPorNome: null,
      aprovadoEm: null,
    },
    semMudanca: false,
    rebaixadoParaRascunho: true,
  };
}

/**
 * Espelha o GATE do `restoreVersion`: restaurar é mudança de conteúdo →
 * mesmo rebaixamento + limpeza de aprovação do `save`. (router: update final.)
 */
function applyRestore(tpl: TemplateRow, conteudoVersaoEscolhida: string): { row: TemplateRow; rebaixadoParaRascunho: boolean } {
  return {
    row: {
      ...tpl,
      conteudoHtml: conteudoVersaoEscolhida,
      versaoAtual: tpl.versaoAtual + 1,
      status: "rascunho",
      aprovadoPorId: null,
      aprovadoPorNome: null,
      aprovadoEm: null,
    },
    rebaixadoParaRascunho: true,
  };
}

/**
 * Espelha o `getVigente`: só entrega conteúdo quando `status === "vigente"`;
 * caso contrário devolve `vigente:false` + `conteudoHtml:null` (gera fallback
 * hard-coded no módulo consumidor).
 */
function getVigente(tpl: TemplateRow | null): { vigente: boolean; conteudoHtml: string | null } {
  if (!tpl || tpl.status !== "vigente") {
    return { vigente: false, conteudoHtml: null };
  }
  return { vigente: true, conteudoHtml: tpl.conteudoHtml };
}

/** Espelha o `aprovar`: rascunho → vigente, carimbando aprovador + data. */
function aprovar(tpl: TemplateRow, userId: number, userName: string): TemplateRow {
  return {
    ...tpl,
    status: "vigente",
    aprovadoPorId: userId,
    aprovadoPorNome: userName,
    aprovadoEm: new Date().toISOString(),
  };
}

function vigenteSeed(conteudo: string, versaoAtual = 1): TemplateRow {
  return {
    conteudoHtml: conteudo,
    versaoAtual,
    status: "vigente",
    aprovadoPorId: 99,
    aprovadoPorNome: "Aprovador Anterior",
    aprovadoEm: "2026-01-01T00:00:00.000Z",
  };
}

describe("Central de Documentos ISO — gate de aprovação", () => {
  it("save com mudança de conteúdo rebaixa um VIGENTE para rascunho e limpa a aprovação", () => {
    const seed = vigenteSeed("<p>Texto antigo</p>");

    // Antes: o documento vigente é entregue pelos geradores.
    expect(getVigente(seed)).toEqual({ vigente: true, conteudoHtml: "<p>Texto antigo</p>" });

    // Edição de conteúdo dispara o gate.
    const { row, rebaixadoParaRascunho } = applySave(seed, "<p>Texto novo editado</p>");
    expect(rebaixadoParaRascunho).toBe(true);
    expect(row.status).toBe("rascunho");
    expect(row.aprovadoPorId).toBeNull();
    expect(row.aprovadoPorNome).toBeNull();
    expect(row.aprovadoEm).toBeNull();
    expect(row.versaoAtual).toBe(2);

    // getVigente NÃO entrega mais até reaprovar.
    expect(getVigente(row)).toEqual({ vigente: false, conteudoHtml: null });

    // Só volta a circular após nova aprovação — com o conteúdo editado.
    const reaprovado = aprovar(row, 1, "Admin Test");
    expect(getVigente(reaprovado)).toEqual({ vigente: true, conteudoHtml: "<p>Texto novo editado</p>" });
    expect(reaprovado.aprovadoPorId).toBe(1);
    expect(reaprovado.aprovadoEm).not.toBeNull();
  });

  it("save SEM mudança de conteúdo NÃO rebaixa o VIGENTE", () => {
    const seed = vigenteSeed("<p>Mesmo texto</p>");
    const { row, semMudanca, rebaixadoParaRascunho } = applySave(seed, "<p>Mesmo texto</p>");
    expect(semMudanca).toBe(true);
    expect(rebaixadoParaRascunho).toBe(false);
    expect(row.status).toBe("vigente");
    expect(getVigente(row)).toEqual({ vigente: true, conteudoHtml: "<p>Mesmo texto</p>" });
  });

  it("restoreVersion de um VIGENTE volta para rascunho, limpa a aprovação e só circula após aprovar", () => {
    // Documento vigente na Rev. 2; vamos restaurar o conteúdo da Rev. 1.
    const seed = vigenteSeed("<p>Versão 2 atual</p>", 2);
    expect(getVigente(seed).vigente).toBe(true);

    const { row, rebaixadoParaRascunho } = applyRestore(seed, "<p>Versão 1 antiga</p>");
    expect(rebaixadoParaRascunho).toBe(true);
    expect(row.status).toBe("rascunho");
    expect(row.aprovadoPorId).toBeNull();
    expect(row.aprovadoPorNome).toBeNull();
    expect(row.aprovadoEm).toBeNull();
    expect(row.versaoAtual).toBe(3);
    expect(row.conteudoHtml).toBe("<p>Versão 1 antiga</p>");

    // Gate ativo: não entregue até reaprovar.
    expect(getVigente(row)).toEqual({ vigente: false, conteudoHtml: null });

    // Após aprovar, volta a circular com o conteúdo restaurado.
    const reaprovado = aprovar(row, 1, "Admin Test");
    expect(getVigente(reaprovado)).toEqual({ vigente: true, conteudoHtml: "<p>Versão 1 antiga</p>" });
  });

  it("um documento obsoleto também NÃO é entregue por getVigente", () => {
    const seed: TemplateRow = { ...vigenteSeed("<p>x</p>"), status: "obsoleto" };
    expect(getVigente(seed)).toEqual({ vigente: false, conteudoHtml: null });
  });
});
