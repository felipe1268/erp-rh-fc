/**
 * Rev. 4054 — Screenshots REAIS do sistema autenticado (dados reais da FC
 * Engenharia, empresa 60002) pra cada módulo, usados em `/planos/modulos/:id`
 * junto com o `ModulePreviewMock` (que continua existindo como fallback
 * conceitual quando um módulo não tem print ainda). Objetivo: valorizar a
 * ferramenta mostrando telas de verdade, não só mockup abstrato.
 */

import rhDpPainel from "@/assets/screenshots/rh-dp/painel.png";
import rhDpDashboard from "@/assets/screenshots/rh-dp/dashboard-funcionarios.png";
import rhDpTopFuncoes from "@/assets/screenshots/rh-dp/top-funcoes-setores.png";
import rhDpFolha from "@/assets/screenshots/rh-dp/folha-comparativo.png";

import sst from "@/assets/screenshots/sst.jpg";
import juridico from "@/assets/screenshots/juridico.jpg";
import avaliacao from "@/assets/screenshots/avaliacao.jpg";
import terceiros from "@/assets/screenshots/terceiros.jpg";
import parceiros from "@/assets/screenshots/parceiros.jpg";
import planejamento from "@/assets/screenshots/planejamento.jpg";
import orcamento from "@/assets/screenshots/orcamento.jpg";
import compras from "@/assets/screenshots/compras.jpg";
import financeiro from "@/assets/screenshots/financeiro.jpg";
import medicao from "@/assets/screenshots/medicao.jpg";
import almoxarifado from "@/assets/screenshots/almoxarifado.jpg";
import gestaoDocumentos from "@/assets/screenshots/gestao-documentos.jpg";
import frotas from "@/assets/screenshots/frotas.jpg";

export const MODULE_SCREENSHOTS: Record<string, string[]> = {
  "rh-dp": [rhDpPainel, rhDpDashboard, rhDpTopFuncoes, rhDpFolha],
  sst: [sst],
  juridico: [juridico],
  avaliacao: [avaliacao],
  terceiros: [terceiros],
  parceiros: [parceiros],
  planejamento: [planejamento],
  orcamento: [orcamento],
  compras: [compras],
  financeiro: [financeiro],
  medicao: [medicao],
  almoxarifado: [almoxarifado],
  "gestao-documentos": [gestaoDocumentos],
  frotas: [frotas],
};
