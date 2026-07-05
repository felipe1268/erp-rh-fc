/**
 * Rev. 4054 — Screenshots REAIS do sistema autenticado pra cada módulo,
 * usados em `/planos/modulos/:id` junto com o `ModulePreviewMock` (que
 * continua existindo como fallback conceitual quando um módulo não tem
 * print ainda). Objetivo: valorizar a ferramenta mostrando telas de
 * verdade, não só mockup abstrato.
 *
 * Rev. 4055 — As screenshots de RH & DP (`painel.png` e
 * `dashboard-funcionarios.png`) usam dados 100% FICTÍCIOS (empresa/obra/
 * colaboradores inventados), nunca dados reais de cliente. As demais
 * (`top-funcoes-setores.png`, `folha-comparativo.png`) já não continham
 * nomes de pessoa e foram mantidas.
 *
 * Rev. 4058 — Cada módulo ganhou uma 2ª tela real (dados reais da FC
 * Engenharia, sem PII), pra alimentar o carrossel "multitela" — antes só
 * havia 1 print por módulo (exceto RH & DP), o que deixava a seção rasa.
 */

import rhDpPainel from "@/assets/screenshots/rh-dp/painel.png";
import rhDpDashboard from "@/assets/screenshots/rh-dp/dashboard-funcionarios.png";
import rhDpTopFuncoes from "@/assets/screenshots/rh-dp/top-funcoes-setores.png";
import rhDpFolha from "@/assets/screenshots/rh-dp/folha-comparativo.png";

import sst from "@/assets/screenshots/sst.jpg";
import sst2 from "@/assets/screenshots/sst-2.jpg";
import juridico from "@/assets/screenshots/juridico.jpg";
import juridico2 from "@/assets/screenshots/juridico-2.jpg";
import avaliacao from "@/assets/screenshots/avaliacao.jpg";
import avaliacao2 from "@/assets/screenshots/avaliacao-2.jpg";
import terceiros from "@/assets/screenshots/terceiros.jpg";
import terceiros2 from "@/assets/screenshots/terceiros-2.jpg";
import parceiros from "@/assets/screenshots/parceiros.jpg";
import parceiros2 from "@/assets/screenshots/parceiros-2.jpg";
import planejamento from "@/assets/screenshots/planejamento.jpg";
import planejamento2 from "@/assets/screenshots/planejamento-2.jpg";
import orcamento from "@/assets/screenshots/orcamento.jpg";
import orcamento2 from "@/assets/screenshots/orcamento-2.jpg";
import compras from "@/assets/screenshots/compras.jpg";
import compras2 from "@/assets/screenshots/compras-2.jpg";
import financeiro from "@/assets/screenshots/financeiro.jpg";
import financeiro2 from "@/assets/screenshots/financeiro-2.jpg";
import medicao from "@/assets/screenshots/medicao.jpg";
import medicao2 from "@/assets/screenshots/medicao-2.jpg";
import almoxarifado from "@/assets/screenshots/almoxarifado.jpg";
import almoxarifado2 from "@/assets/screenshots/almoxarifado-2.jpg";
import gestaoDocumentos from "@/assets/screenshots/gestao-documentos.jpg";
import gestaoDocumentos2 from "@/assets/screenshots/gestao-documentos-2.jpg";
import frotas from "@/assets/screenshots/frotas.jpg";
import frotas2 from "@/assets/screenshots/frotas-2.jpg";

export const MODULE_SCREENSHOTS: Record<string, string[]> = {
  "rh-dp": [rhDpPainel, rhDpDashboard, rhDpTopFuncoes, rhDpFolha],
  sst: [sst, sst2],
  juridico: [juridico, juridico2],
  avaliacao: [avaliacao, avaliacao2],
  terceiros: [terceiros, terceiros2],
  parceiros: [parceiros, parceiros2],
  planejamento: [planejamento, planejamento2],
  orcamento: [orcamento, orcamento2],
  compras: [compras, compras2],
  financeiro: [financeiro, financeiro2],
  medicao: [medicao, medicao2],
  almoxarifado: [almoxarifado, almoxarifado2],
  "gestao-documentos": [gestaoDocumentos, gestaoDocumentos2],
  frotas: [frotas, frotas2],
};
