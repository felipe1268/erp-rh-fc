// Rev. 3901 — APR Análise Preliminar de Risco
// Wizard 3 passos: Dados Gerais → Tabela de Riscos → EPIs + Aprovação
// Matriz de risco P×G colorida, assinatura canvas do aprovador
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "sonner";
import {
  ShieldAlert, Plus, ChevronRight, ChevronLeft, Check, X as XIcon,
  Loader2, AlertTriangle, CheckCircle2, Clock, FileText, MapPin,
  User, PenLine, Eraser, Trash2, Eye, Pencil, Ban, HardHat, Printer,
  RefreshCw, AlertCircle, BarChart3, ArrowRight, Building2,
  ListChecks, Layers, CircleCheck, CircleX, Minus,
} from "lucide-react";

// ── Probabilidade / Gravidade ────────────────────────────────────────────────
const PROB_LABELS: Record<number, string> = {
  1: "1 — Rara", 2: "2 — Improvável", 3: "3 — Possível",
  4: "4 — Provável", 5: "5 — Quase certa",
};
const GRAV_LABELS: Record<number, string> = {
  1: "1 — Insignificante", 2: "2 — Menor", 3: "3 — Moderada",
  4: "4 — Maior", 5: "5 — Catastrófica",
};

function nivelRisco(p: number, g: number) { return p * g; }

function nivelConfig(nivel: number) {
  if (nivel <= 4)  return { label: "Baixo",    bg: "bg-green-100",  text: "text-green-800",  border: "border-green-300" };
  if (nivel <= 9)  return { label: "Médio",    bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" };
  if (nivel <= 16) return { label: "Alto",     bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" };
  return                  { label: "Crítico",  bg: "bg-red-100",    text: "text-red-800",    border: "border-red-300" };
}

const TIPO_RISCO_OPTS = [
  { value: "seguranca",      label: "🦺 Segurança" },
  { value: "saude",          label: "🏥 Saúde" },
  { value: "meio_ambiente",  label: "🌿 Meio Ambiente" },
  { value: "qualidade",      label: "✅ Qualidade" },
];

const TIPO_MEDIDA_OPTS = [
  { value: "eliminacao",    label: "Eliminação" },
  { value: "substituicao",  label: "Substituição" },
  { value: "epc",           label: "EPC" },
  { value: "admin",         label: "Adm. / Proc." },
  { value: "epi",           label: "EPI" },
];

const EPI_SUGESTOES = [
  "Capacete de segurança", "Óculos de proteção", "Luvas de vaqueta",
  "Luvas de borracha", "Calçado de segurança", "Protetor auricular",
  "Máscara PFF2", "Cinto de segurança", "Talabarte", "Trava-quedas",
  "Colete refletivo", "Uniforme de trabalho",
];

// ── Tipos de Atividade APR (construção civil) ────────────────────────────────
type ChecklistResposta = "sim" | "nao" | "na" | "";
type ChecklistItem = { pergunta: string; resposta: ChecklistResposta };

type AprTipo = {
  id: string; label: string; nr: string; emoji: string;
  colorBg: string; colorBorder: string; colorText: string; colorBtn: string;
  descricao: string; checklist: string[]; episSugeridos: string[];
  riscosPredef: Array<Partial<RiscoItem>>;
};

const APR_TIPOS: AprTipo[] = [
  {
    id: "altura", label: "Trabalho em Altura", nr: "NR-35", emoji: "⬆️",
    colorBg: "bg-blue-50", colorBorder: "border-blue-300", colorText: "text-blue-800", colorBtn: "bg-blue-600 hover:bg-blue-700",
    descricao: "Atividades realizadas acima de 2m com risco de queda",
    checklist: [
      "Trabalhador possui treinamento NR-35 válido (não vencido)?",
      "Cinturão de segurança tipo paraquedista e talabarte duplo disponíveis e inspecionados?",
      "Trava-quedas (auto-retrátil ou de cabo guia) disponível e certificado?",
      "Pontos de ancoragem identificados e estruturalmente seguros?",
      "Linha de vida instalada e homologada pelo responsável técnico?",
      "Área abaixo isolada e sinalizada contra queda de objetos?",
      "Plano de resgate para trabalho em altura elaborado?",
      "Condições meteorológicas favoráveis (sem chuva, raio ou vento forte)?",
      "Escadas, andaimes ou plataformas em boas condições?",
      "Comunicação com equipe de resgate estabelecida?",
    ],
    episSugeridos: ["Capacete de segurança", "Cinturão tipo paraquedista", "Talabarte duplo", "Trava-quedas", "Linha de vida", "Luvas de vaqueta", "Calçado de segurança", "Colete refletivo"],
    riscosPredef: [
      { etapaAtividade: "Acesso/Descida", perigo: "Trabalho em altura", risco: "Queda de nível diferente", tipoRisco: "seguranca", probabilidade: 4, gravidade: 5, tipoMedida: "epc", medidasControle: "Utilizar sistema de proteção contra queda (linha de vida + talabarte duplo). Instalar guarda-corpo quando aplicável.", responsavelNome: "", prazo: "", situacao: "aberta" },
      { etapaAtividade: "Execução", perigo: "Queda de ferramentas/materiais", risco: "Impacto em pessoa no nível inferior", tipoRisco: "seguranca", probabilidade: 3, gravidade: 4, tipoMedida: "epc", medidasControle: "Isolar área abaixo. Usar sacolas porta-ferramentas. Instalar tela/bandeja de proteção.", responsavelNome: "", prazo: "", situacao: "aberta" },
    ],
  },
  {
    id: "espaco_confinado", label: "Espaço Confinado", nr: "NR-33", emoji: "🕳️",
    colorBg: "bg-purple-50", colorBorder: "border-purple-300", colorText: "text-purple-800", colorBtn: "bg-purple-600 hover:bg-purple-700",
    descricao: "Entrada e trabalho em espaços com acesso e saída restritos",
    checklist: [
      "Permissão de Entrada e Trabalho (PET) emitida e assinada pelo supervisor?",
      "Identificação e avaliação dos riscos atmosféricos realizada?",
      "Análise atmosférica (O₂, CO, H₂S, LEL) realizada antes da entrada?",
      "Ventilação forçada instalada e operando durante o trabalho?",
      "Vigias treinados em NR-33 posicionados no exterior?",
      "Sistema de resgate (tripé, talha, cabo de vida) preparado e testado?",
      "Bloqueio e etiquetagem (LOTO) de energias perigosas aplicados?",
      "Comunicação entre equipe interna e vigia estabelecida?",
      "EPIs específicos (máscara SCBA ou ar puro, arnês) disponíveis?",
      "Plano de resgate de emergência definido e comunicado a todos?",
    ],
    episSugeridos: ["Capacete de segurança", "Arnês completo", "Máscara de ar puro (SCBA)", "Detector de gases portátil", "Luvas de borracha", "Calçado de segurança", "Colete refletivo", "Lanterna ou iluminação de emergência"],
    riscosPredef: [
      { etapaAtividade: "Entrada no espaço", perigo: "Atmosfera deficiente de O₂ / contaminada", risco: "Asfixia ou intoxicação", tipoRisco: "seguranca", probabilidade: 4, gravidade: 5, tipoMedida: "epc", medidasControle: "Análise atmosférica antes e durante. Ventilação forçada contínua. EPIs respiratórios.", responsavelNome: "", prazo: "", situacao: "aberta" },
      { etapaAtividade: "Resgate", perigo: "Dificuldade de acesso", risco: "Agravamento por demora no resgate", tipoRisco: "seguranca", probabilidade: 3, gravidade: 5, tipoMedida: "epc", medidasControle: "Tripé de resgate montado. Vigia treinado. Plano de resgate testado.", responsavelNome: "", prazo: "", situacao: "aberta" },
    ],
  },
  {
    id: "escavacao", label: "Escavação / Fundação", nr: "NR-18", emoji: "⛏️",
    colorBg: "bg-amber-50", colorBorder: "border-amber-300", colorText: "text-amber-800", colorBtn: "bg-amber-600 hover:bg-amber-700",
    descricao: "Escavações, valas, fundações e rebaixamento de terreno",
    checklist: [
      "Sondagem e análise do tipo de solo realizada por profissional habilitado?",
      "Levantamento de interferências (água, esgoto, gás, elétrica) concluído?",
      "Inclinação dos taludes ou escoramento adequado instalado?",
      "Sinalização, barricadas e telas de proteção instaladas ao redor?",
      "Plataformas de acesso (escadas) instaladas a cada 3m de profundidade?",
      "Maquinário pesado a distância segura das bordas da escavação?",
      "Sistema de drenagem/esgotamento disponível (bomba)?",
      "Inspeção visual das paredes realizada antes de cada turno?",
      "EPIs adequados disponíveis (capacete, bota, colete)?",
      "Plano de emergência para solapamento/desmoronamento elaborado?",
    ],
    episSugeridos: ["Capacete de segurança", "Calçado de segurança (impermeável)", "Luvas de vaqueta", "Óculos de proteção", "Colete refletivo", "Protetor auricular"],
    riscosPredef: [
      { etapaAtividade: "Escavação", perigo: "Instabilidade de talude/parede", risco: "Solapamento ou desmoronamento sobre trabalhador", tipoRisco: "seguranca", probabilidade: 3, gravidade: 5, tipoMedida: "epc", medidasControle: "Escoramento ou taludes conforme projeto. Inspeção diária.", responsavelNome: "", prazo: "", situacao: "aberta" },
      { etapaAtividade: "Operação de equipamentos", perigo: "Maquinário pesado em movimento", risco: "Atropelamento ou colisão com trabalhador", tipoRisco: "seguranca", probabilidade: 2, gravidade: 5, tipoMedida: "admin", medidasControle: "Delimitar área de operação. Sinaleiro presente durante operação.", responsavelNome: "", prazo: "", situacao: "aberta" },
    ],
  },
  {
    id: "andaime", label: "Montagem de Andaime", nr: "NR-35 / NR-18", emoji: "🏗️",
    colorBg: "bg-sky-50", colorBorder: "border-sky-300", colorText: "text-sky-800", colorBtn: "bg-sky-600 hover:bg-sky-700",
    descricao: "Montagem, uso e desmontagem de andaimes tubulares",
    checklist: [
      "Projeto ou esquema de montagem aprovado pelo responsável técnico?",
      "Travamentos horizontais e diagonais instalados conforme projeto?",
      "Plataformas de trabalho com guarda-corpo (mínimo 1,20m) e rodapé?",
      "Fixações à estrutura verificadas (a cada 4m de altura)?",
      "Capacidade de carga máxima identificada e respeitada?",
      "Trabalhadores possuem treinamento NR-35 válido?",
      "Acesso ao andaime seguro (escada interna ou gato-de-obra fixo)?",
      "Área ao redor isolada e sinalizada?",
      "Andaime inspecionado por profissional habilitado antes do uso?",
      "EPIs de trabalho em altura disponíveis para todos?",
    ],
    episSugeridos: ["Capacete de segurança", "Cinturão tipo paraquedista", "Talabarte duplo", "Trava-quedas", "Luvas de vaqueta", "Calçado de segurança", "Colete refletivo"],
    riscosPredef: [
      { etapaAtividade: "Montagem/Desmontagem", perigo: "Trabalho em altura", risco: "Queda de trabalhador", tipoRisco: "seguranca", probabilidade: 3, gravidade: 5, tipoMedida: "epc", medidasControle: "EPI de proteção contra queda obrigatório. Linha de vida durante montagem.", responsavelNome: "", prazo: "", situacao: "aberta" },
      { etapaAtividade: "Uso do andaime", perigo: "Sobrecarga estrutural", risco: "Colapso do andaime com trabalhadores", tipoRisco: "seguranca", probabilidade: 2, gravidade: 5, tipoMedida: "epc", medidasControle: "Respeitar carga máxima. Inspeção diária. Travamentos verificados.", responsavelNome: "", prazo: "", situacao: "aberta" },
    ],
  },
  {
    id: "eletrica", label: "Instalação Elétrica", nr: "NR-10", emoji: "⚡",
    colorBg: "bg-yellow-50", colorBorder: "border-yellow-300", colorText: "text-yellow-800", colorBtn: "bg-yellow-600 hover:bg-yellow-700",
    descricao: "Serviços em instalações e equipamentos elétricos",
    checklist: [
      "Trabalhadores possuem treinamento NR-10 válido (SEP se aplicável)?",
      "Sistema elétrico bloqueado e etiquetado (LOTO) antes do início?",
      "Ausência de tensão verificada com multímetro certificado?",
      "EPIs elétricos (luvas isolantes, botas isolantes, óculos) disponíveis?",
      "EPC (barreiras, isolamentos temporários) instalados?",
      "Distâncias de segurança de partes energizadas respeitadas?",
      "Ferramentas com isolamento adequado certificadas (1000V)?",
      "Ponto de aterramento instalado e verificado?",
      "Iluminação adequada no local do serviço?",
      "Plano de emergência para choque elétrico elaborado?",
    ],
    episSugeridos: ["Luvas isolantes (classe compatível com tensão)", "Botas isolantes", "Óculos de proteção", "Capacete de segurança (Classe B)", "Colete refletivo"],
    riscosPredef: [
      { etapaAtividade: "Execução elétrica", perigo: "Contato com parte energizada", risco: "Choque elétrico / eletrocução", tipoRisco: "seguranca", probabilidade: 3, gravidade: 5, tipoMedida: "epc", medidasControle: "LOTO completo. Verificação de tensão zero. EPIs dielétricos certificados.", responsavelNome: "", prazo: "", situacao: "aberta" },
      { etapaAtividade: "Execução elétrica", perigo: "Arco elétrico", risco: "Queimaduras graves por flash elétrico", tipoRisco: "seguranca", probabilidade: 2, gravidade: 5, tipoMedida: "epi", medidasControle: "EPI adequado à categoria de risco de arco. Distâncias de segurança.", responsavelNome: "", prazo: "", situacao: "aberta" },
    ],
  },
  {
    id: "demolicao", label: "Demolição", nr: "NR-18", emoji: "🔨",
    colorBg: "bg-red-50", colorBorder: "border-red-300", colorText: "text-red-800", colorBtn: "bg-red-600 hover:bg-red-700",
    descricao: "Demolição total ou parcial de estruturas civis",
    checklist: [
      "Laudo técnico de demolição elaborado por responsável técnico habilitado?",
      "Desligamento de todas as redes de utilidades (gás, elétrica, água) confirmado?",
      "Área de demolição isolada com raio de segurança adequado?",
      "Estruturas adjacentes monitoradas e/ou escoradas?",
      "Método de demolição definido no laudo técnico?",
      "Plano de remoção de entulho e resíduos elaborado?",
      "EPIs específicos disponíveis (capacete, óculos, respirador, protetor auricular)?",
      "Estabilidade estrutural residual verificada antes de cada etapa?",
      "Plano de emergência para colapso estrutural elaborado?",
      "Vizinhança notificada sobre os trabalhos de demolição?",
    ],
    episSugeridos: ["Capacete de segurança", "Óculos de proteção (vedação total)", "Respirador PFF2", "Protetor auricular", "Luvas de vaqueta", "Calçado de segurança", "Colete refletivo"],
    riscosPredef: [
      { etapaAtividade: "Demolição", perigo: "Instabilidade estrutural", risco: "Colapso não controlado sobre trabalhadores", tipoRisco: "seguranca", probabilidade: 3, gravidade: 5, tipoMedida: "admin", medidasControle: "Seguir sequência definida no laudo. Inspeção antes de cada etapa.", responsavelNome: "", prazo: "", situacao: "aberta" },
      { etapaAtividade: "Demolição", perigo: "Poeira e partículas", risco: "Doenças respiratórias e lesões oculares", tipoRisco: "saude", probabilidade: 4, gravidade: 3, tipoMedida: "epi", medidasControle: "Umectação da área. Respirador PFF2. Óculos de proteção.", responsavelNome: "", prazo: "", situacao: "aberta" },
    ],
  },
  {
    id: "icamento", label: "Içamento de Cargas", nr: "NR-11", emoji: "🏋️",
    colorBg: "bg-green-50", colorBorder: "border-green-300", colorText: "text-green-800", colorBtn: "bg-green-600 hover:bg-green-700",
    descricao: "Movimentação, içamento e transporte de cargas pesadas",
    checklist: [
      "Operador de guincho/guindaste/grua com habilitação válida?",
      "Capacidade de carga do equipamento verificada e dentro dos limites?",
      "Inspeção pré-operacional do equipamento realizada?",
      "Acessórios de içamento (cintas, manilhas, ganchos) inspecionados e certificados?",
      "Área de içamento sinalizada e livre de pessoas durante a operação?",
      "Rigger treinado e responsável pelo encalhe (slinging) da carga?",
      "Condições de vento favoráveis para içamento (< 42 km/h)?",
      "Plano de içamento com rotas e área de segurança definidos?",
      "Comunicação entre operador e rigger estabelecida (rádio/sinal)?",
      "Carga inspecionada e eslingada sem risco de queda de partes?",
    ],
    episSugeridos: ["Capacete de segurança", "Luvas de vaqueta", "Calçado de segurança", "Colete refletivo", "Óculos de proteção"],
    riscosPredef: [
      { etapaAtividade: "Içamento", perigo: "Queda da carga", risco: "Esmagamento de trabalhador", tipoRisco: "seguranca", probabilidade: 3, gravidade: 5, tipoMedida: "epc", medidasControle: "Área livre de pessoas. Cintas/manilhas certificadas. Inspeção do encalhe.", responsavelNome: "", prazo: "", situacao: "aberta" },
      { etapaAtividade: "Içamento", perigo: "Tombamento do equipamento", risco: "Colapso do guindaste sobre trabalhadores", tipoRisco: "seguranca", probabilidade: 2, gravidade: 5, tipoMedida: "admin", medidasControle: "Verificar capacidade e estabilidade do terreno. Plano de içamento aprovado.", responsavelNome: "", prazo: "", situacao: "aberta" },
    ],
  },
  {
    id: "soldagem", label: "Soldagem / Corte a Quente", nr: "NR-18", emoji: "🔥",
    colorBg: "bg-orange-50", colorBorder: "border-orange-300", colorText: "text-orange-800", colorBtn: "bg-orange-600 hover:bg-orange-700",
    descricao: "Soldagem elétrica, oxicorte e trabalhos com chama aberta",
    checklist: [
      "Área de soldagem/corte isolada e ventilada adequadamente?",
      "Materiais combustíveis e inflamáveis removidos da área (raio mínimo 10m)?",
      "Extintores de incêndio disponíveis e operantes na área?",
      "EPIs de soldagem disponíveis (máscara, avental, luvas, perneiras, respirador)?",
      "Cilindros de gás armazenados verticalmente e afastados de fontes de calor?",
      "Trabalhadores com treinamento para trabalho a quente?",
      "Vigias de incêndio designados durante e 30 min após o serviço?",
      "Permissão de Trabalho a Quente (hot work permit) emitida?",
      "Sistema elétrico de soldagem inspecionado e aterrado?",
      "Plano de emergência para incêndio elaborado e comunicado?",
    ],
    episSugeridos: ["Máscara de solda (escurecimento automático)", "Avental de couro", "Luvas de solda (raspa)", "Perneiras de couro", "Respirador para fumos metálicos", "Capacete de segurança", "Calçado de segurança", "Colete refletivo"],
    riscosPredef: [
      { etapaAtividade: "Soldagem/Corte", perigo: "Fumos metálicos e gases", risco: "Intoxicação por inalação", tipoRisco: "saude", probabilidade: 4, gravidade: 3, tipoMedida: "epc", medidasControle: "Ventilação forçada ou local ventilado. Respirador para fumos.", responsavelNome: "", prazo: "", situacao: "aberta" },
      { etapaAtividade: "Soldagem/Corte", perigo: "Faíscas e respingos", risco: "Incêndio ou queimadura", tipoRisco: "seguranca", probabilidade: 3, gravidade: 4, tipoMedida: "epi", medidasControle: "Remover combustíveis. EPIs de soldagem completos. Vigia de incêndio.", responsavelNome: "", prazo: "", situacao: "aberta" },
    ],
  },
  {
    id: "cobertura", label: "Serviços em Cobertura / Telhado", nr: "NR-18 / NR-35", emoji: "🏠",
    colorBg: "bg-teal-50", colorBorder: "border-teal-300", colorText: "text-teal-800", colorBtn: "bg-teal-600 hover:bg-teal-700",
    descricao: "Substituição, reparo e impermeabilização de coberturas",
    checklist: [
      "Trabalhadores possuem treinamento NR-35 válido?",
      "Sistema de proteção coletiva (guarda-corpo, tela perimetral) instalado?",
      "Linha de vida horizontal instalada em estrutura resistente?",
      "Materiais e ferramentas transportados com sacola/balde (sem arremessar)?",
      "Telhas verificadas quanto à capacidade de suporte antes de pisá-las?",
      "Plataformas temporárias sobre telhas frágeis (fibrocimento, vidro) instaladas?",
      "Área abaixo isolada contra queda de materiais?",
      "Condições meteorológicas verificadas (sem chuva, raio ou vento forte)?",
      "EPIs completos disponíveis (cinto paraquedista, talabarte, capacete)?",
      "Inspeção da cobertura após chuva ou período sem uso realizada?",
    ],
    episSugeridos: ["Capacete de segurança", "Cinturão tipo paraquedista", "Talabarte duplo", "Trava-quedas", "Calçado antiderrapante", "Luvas de vaqueta", "Colete refletivo"],
    riscosPredef: [
      { etapaAtividade: "Trabalho em cobertura", perigo: "Telha frágil ou desgastada", risco: "Queda por rompimento de telha", tipoRisco: "seguranca", probabilidade: 3, gravidade: 5, tipoMedida: "epc", medidasControle: "Usar plataformas de distribuição de carga. EPI contra queda obrigatório.", responsavelNome: "", prazo: "", situacao: "aberta" },
      { etapaAtividade: "Trabalho em cobertura", perigo: "Borda desprotegida", risco: "Queda do nível da cobertura", tipoRisco: "seguranca", probabilidade: 3, gravidade: 5, tipoMedida: "epc", medidasControle: "Guarda-corpo perimetral + linha de vida + talabarte.", responsavelNome: "", prazo: "", situacao: "aberta" },
    ],
  },
  {
    id: "geral", label: "Atividade Geral de Construção Civil", nr: "NR-18", emoji: "🦺",
    colorBg: "bg-slate-50", colorBorder: "border-slate-300", colorText: "text-slate-800", colorBtn: "bg-slate-600 hover:bg-slate-700",
    descricao: "Serviços gerais de obra sem classificação específica acima",
    checklist: [
      "PCMSO e PPRA/PGR da obra atualizados e disponíveis?",
      "Trabalhadores com ASO (Atestado de Saúde Ocupacional) em vigor?",
      "Ferramentas e equipamentos em bom estado de conservação?",
      "EPIs básicos disponíveis para todos (capacete, colete, bota de segurança)?",
      "Área de trabalho sinalizada e organizada (Housekeeping / 5S)?",
      "Vias de circulação livres e desobstruídas?",
      "Primeiros socorros e extintores disponíveis no canteiro?",
      "DDS (Diálogo Diário de Segurança) realizado antes do início?",
      "Descarte correto de resíduos da construção organizado?",
      "Terceiros e visitantes com EPIs básicos e acompanhados por responsável?",
    ],
    episSugeridos: ["Capacete de segurança", "Calçado de segurança", "Colete refletivo", "Luvas de vaqueta", "Óculos de proteção"],
    riscosPredef: [
      { etapaAtividade: "Geral", perigo: "Ferramentas e materiais no piso", risco: "Queda no mesmo nível / tropeço", tipoRisco: "seguranca", probabilidade: 4, gravidade: 2, tipoMedida: "admin", medidasControle: "Organização do canteiro. Remoção de obstáculos e resíduos.", responsavelNome: "", prazo: "", situacao: "aberta" },
      { etapaAtividade: "Geral", perigo: "Esforço físico / postura inadequada", risco: "Lesões musculoesqueléticas (LER/DORT)", tipoRisco: "saude", probabilidade: 3, gravidade: 2, tipoMedida: "admin", medidasControle: "Treinamento em ergonomia. Ginástica laboral. Rodízio de funções.", responsavelNome: "", prazo: "", situacao: "aberta" },
    ],
  },
];

// ── Status helpers ─────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  em_analise: { label: "Em Análise",  color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",  icon: Clock },
  aprovada:   { label: "Aprovada",    color: "text-green-700",  bg: "bg-green-50 border-green-200",  icon: CheckCircle2 },
  concluida:  { label: "Concluída",   color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",    icon: Check },
  cancelada:  { label: "Cancelada",   color: "text-red-700",    bg: "bg-red-50 border-red-200",      icon: Ban },
  rascunho:   { label: "Rascunho",    color: "text-slate-600",  bg: "bg-slate-50 border-slate-200",  icon: FileText },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.rascunho;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

// ── Canvas de assinatura do aprovador ────────────────────────────────────────
function AssinaturaPadApr({
  open, onOpenChange, onSave,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (dataUrl: string) => void; }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);

  function getCtx() {
    const c = canvasRef.current; if (!c) return null;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2.5;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    return ctx;
  }

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const src = "touches" in e ? (e as React.TouchEvent).touches[0] : (e as React.MouseEvent);
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function onStart(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault(); drawing.current = true;
    const ctx = getCtx()!; const { x, y } = getPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  }
  function onMove(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return; e.preventDefault();
    const ctx = getCtx()!; const { x, y } = getPos(e);
    ctx.lineTo(x, y); ctx.stroke();
  }
  function onEnd() { drawing.current = false; }

  function limpar() {
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  }

  function salvar() {
    const c = canvasRef.current; if (!c) return;
    const blank = document.createElement("canvas");
    blank.width = c.width; blank.height = c.height;
    if (c.toDataURL() === blank.toDataURL()) { toast.error("Desenhe a assinatura primeiro."); return; }
    onSave(c.toDataURL("image/png"));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Assinatura do Aprovador</DialogTitle></DialogHeader>
        <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50">
          <canvas ref={canvasRef} width={380} height={160} className="block w-full cursor-crosshair touch-none"
            onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
            onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} />
        </div>
        <p className="text-xs text-slate-500 text-center">Assine acima com o dedo ou mouse</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={limpar}><Eraser className="h-4 w-4 mr-1" />Limpar</Button>
          <Button size="sm" onClick={salvar} className="bg-green-600 hover:bg-green-700"><PenLine className="h-4 w-4 mr-1" />Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Linha de risco (tabela) ──────────────────────────────────────────────────
type RiscoItem = {
  id?: number; etapaAtividade: string; perigo: string; risco: string;
  tipoRisco: string; probabilidade: number; gravidade: number;
  medidasControle: string; tipoMedida: string; responsavelNome: string;
  prazo: string; situacao: string;
};

function RiscoRow({
  risco, index, onChange, onRemove, readOnly,
}: { risco: RiscoItem; index: number; onChange: (r: RiscoItem) => void; onRemove: () => void; readOnly?: boolean }) {
  const nivel = risco.probabilidade && risco.gravidade ? nivelRisco(risco.probabilidade, risco.gravidade) : null;
  const cfg   = nivel ? nivelConfig(nivel) : null;

  function upd(patch: Partial<RiscoItem>) { onChange({ ...risco, ...patch }); }

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Risco #{index + 1}</span>
        <div className="flex items-center gap-2">
          {nivel && cfg && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              {nivel} — {cfg.label}
            </span>
          )}
          {!readOnly && (
            <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-500 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Etapa / Atividade</label>
          <Input value={risco.etapaAtividade} disabled={readOnly} placeholder="Ex.: Concretagem de pilar"
            onChange={e => upd({ etapaAtividade: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Perigo</label>
          <Input value={risco.perigo} disabled={readOnly} placeholder="Ex.: Trabalho em altura"
            onChange={e => upd({ perigo: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Risco</label>
          <Input value={risco.risco} disabled={readOnly} placeholder="Ex.: Queda de nível diferente"
            onChange={e => upd({ risco: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Tipo</label>
          <Select value={risco.tipoRisco} disabled={readOnly} onValueChange={v => upd({ tipoRisco: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>{TIPO_RISCO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Probabilidade</label>
          <Select value={String(risco.probabilidade || "")} disabled={readOnly}
            onValueChange={v => upd({ probabilidade: Number(v) })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="P" /></SelectTrigger>
            <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{PROB_LABELS[n]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Gravidade</label>
          <Select value={String(risco.gravidade || "")} disabled={readOnly}
            onValueChange={v => upd({ gravidade: Number(v) })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="G" /></SelectTrigger>
            <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{GRAV_LABELS[n]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Tipo de Medida</label>
          <Select value={risco.tipoMedida} disabled={readOnly} onValueChange={v => upd({ tipoMedida: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Medida" /></SelectTrigger>
            <SelectContent>{TIPO_MEDIDA_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 font-medium mb-1 block">Medidas de Controle</label>
        <Textarea value={risco.medidasControle} disabled={readOnly} rows={2}
          placeholder="Descreva as medidas de controle para eliminar ou reduzir o risco..."
          onChange={e => upd({ medidasControle: e.target.value })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Responsável</label>
          <Input value={risco.responsavelNome} disabled={readOnly} placeholder="Nome do responsável"
            onChange={e => upd({ responsavelNome: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Prazo</label>
          <Input type="date" value={risco.prazo} disabled={readOnly} onChange={e => upd({ prazo: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

// ── Wizard de criação ────────────────────────────────────────────────────────
function NovaAprDialog({
  open, onOpenChange, companyId, employeeId, onCreated,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  companyId: number; employeeId: number; onCreated: () => void;
}) {
  const [step, setStep] = useState(0);
  const STEPS = ["Tipo", "Dados Gerais", "Checklist", "Riscos", "EPIs & Aprovação"];

  // Step 0 — tipo de atividade
  const [tipoId, setTipoId] = useState("");

  // Step 1 — dados gerais
  const [obraId, setObraId]             = useState<string>("");
  const [dataEmissao, setDataEmissao]   = useState(new Date().toISOString().slice(0, 10));
  const [atividade, setAtividade]       = useState("");
  const [localServico, setLocalServico] = useState("");
  const [equipe, setEquipe]             = useState<string[]>([""]);

  // Step 2 — checklist específico
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  // Step 3 — tabela de riscos
  const [riscos, setRiscos] = useState<RiscoItem[]>([novoRisco()]);

  // Step 4 — EPIs + aprovação
  const [epis, setEpis]               = useState<string[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [aprovNome, setAprovNome]     = useState("");
  const [aprovAss, setAprovAss]       = useState<string | null>(null);
  const [padOpen, setPadOpen]         = useState(false);

  const obrasQ  = trpc.obras.list.useQuery({ companyId }, { enabled: open });
  const createM = trpc.aprAnalises.create.useMutation({
    onSuccess: () => { toast.success("APR criada com sucesso!"); onCreated(); onOpenChange(false); resetForm(); },
    onError: e => toast.error(e.message),
  });

  function resetForm() {
    setStep(0); setTipoId(""); setObraId(""); setDataEmissao(new Date().toISOString().slice(0, 10));
    setAtividade(""); setLocalServico(""); setEquipe([""]);
    setChecklist([]); setRiscos([novoRisco()]); setEpis([]);
    setObservacoes(""); setAprovNome(""); setAprovAss(null);
  }

  function novoRisco(): RiscoItem {
    return { etapaAtividade:"", perigo:"", risco:"", tipoRisco:"seguranca",
      probabilidade:0, gravidade:0, medidasControle:"", tipoMedida:"epc",
      responsavelNome:"", prazo:"", situacao:"aberta" };
  }

  function handleSelectTipo(id: string) {
    const tipo = APR_TIPOS.find(t => t.id === id);
    if (!tipo) return;
    setTipoId(id);
    setAtividade(tipo.label);
    setChecklist(tipo.checklist.map(p => ({ pergunta: p, resposta: "" as ChecklistResposta })));
    setRiscos(tipo.riscosPredef.map(r => ({ ...novoRisco(), ...r })));
    setEpis(tipo.episSugeridos);
    setStep(1);
  }

  function setChecklistResposta(idx: number, resposta: ChecklistResposta) {
    setChecklist(prev => prev.map((item, i) => i === idx ? { ...item, resposta } : item));
  }

  function toggleEpi(epi: string) {
    setEpis(prev => prev.includes(epi) ? prev.filter(e => e !== epi) : [...prev, epi]);
  }

  function canNext() {
    if (step === 0) return tipoId !== "";
    if (step === 1) return atividade.trim().length > 0;
    if (step === 2) return checklist.every(c => c.resposta !== "");
    if (step === 3) return riscos.length > 0;
    return aprovNome.trim().length > 0;
  }

  function handleSubmit() {
    const riscosValid = riscos.filter(r => r.perigo || r.risco || r.etapaAtividade);
    createM.mutate({
      companyId,
      obraId:        obraId ? Number(obraId) : null,
      employeeId,
      tipoAtividade: tipoId || null,
      checklistJson: checklist.length ? JSON.stringify(checklist) : null,
      dataEmissao,
      atividade,
      localServico,
      equipeJson:    JSON.stringify(equipe.filter(Boolean)),
      epiJson:       JSON.stringify(epis),
      observacoes:   observacoes || null,
      riscos:        riscosValid.map((r, i) => ({
        ...r, ordem: i,
        probabilidade: r.probabilidade || null,
        gravidade:     r.gravidade || null,
      })),
    });
  }

  const tipoSelecionado = APR_TIPOS.find(t => t.id === tipoId);
  const naoConformes    = checklist.filter(c => c.resposta === "nao");

  // Todos os EPIs (pré-selecionados + genéricos sem duplicar)
  const todosEpis = tipoSelecionado
    ? [...new Set([...tipoSelecionado.episSugeridos, ...EPI_SUGESTOES])]
    : EPI_SUGESTOES;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-600" />
            Nova Análise Preliminar de Risco
            {tipoSelecionado && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ml-1 ${tipoSelecionado.colorBg} ${tipoSelecionado.colorBorder} ${tipoSelecionado.colorText}`}>
                {tipoSelecionado.emoji} {tipoSelecionado.label}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── Stepper ── */}
        <div className="flex items-center gap-1 py-2 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border-2 transition-all
                ${i < step ? "bg-orange-600 border-orange-600 text-white"
                : i === step ? "bg-white border-orange-600 text-orange-600"
                : "bg-white border-slate-200 text-slate-400"}`}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium hidden sm:block whitespace-nowrap
                ${i === step ? "text-orange-700" : i < step ? "text-orange-400" : "text-slate-400"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`w-4 h-0.5 shrink-0 ${i < step ? "bg-orange-400" : "bg-slate-200"}`} />}
            </div>
          ))}
        </div>

        {/* ── Step 0: Tipo de Atividade ── */}
        {step === 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-orange-600" />
              <p className="text-sm font-semibold text-slate-700">Selecione o tipo de atividade</p>
            </div>
            <p className="text-xs text-slate-500">O sistema carregará o checklist e os riscos típicos para o tipo selecionado.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
              {APR_TIPOS.map(tipo => (
                <button key={tipo.id} type="button"
                  onClick={() => handleSelectTipo(tipo.id)}
                  className={`text-left p-3 rounded-xl border-2 transition-all hover:shadow-sm
                    ${tipoId === tipo.id
                      ? `${tipo.colorBg} ${tipo.colorBorder}`
                      : "bg-white border-slate-200 hover:border-slate-300"
                    }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{tipo.emoji}</span>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold leading-tight ${tipoId === tipo.id ? tipo.colorText : "text-slate-800"}`}>
                        {tipo.label}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tipoId === tipo.id ? `${tipo.colorBg} ${tipo.colorText}` : "bg-slate-100 text-slate-500"}`}>
                        {tipo.nr}
                      </span>
                    </div>
                    {tipoId === tipo.id && <Check className={`h-4 w-4 ml-auto shrink-0 ${tipo.colorText}`} />}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">{tipo.descricao}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{tipo.checklist.length} itens de checklist • {tipo.riscosPredef.length} riscos pré-definidos</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 1: Dados Gerais ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Obra / Unidade</label>
                <Select value={obraId} onValueChange={setObraId}>
                  <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {(obrasQ.data ?? []).map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Data da Emissão</label>
                <Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Atividade / Serviço <span className="text-red-500">*</span></label>
              <Input value={atividade} onChange={e => setAtividade(e.target.value)}
                placeholder="Ex.: Concretagem de pilares do 2º pavimento" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Local do Serviço</label>
              <Input value={localServico} onChange={e => setLocalServico(e.target.value)}
                placeholder="Ex.: Bloco A, 2º pavimento" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Equipe Envolvida</label>
              <div className="space-y-2">
                {equipe.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={m} placeholder={`Membro ${i + 1}`}
                      onChange={e => { const n = [...equipe]; n[i] = e.target.value; setEquipe(n); }} />
                    {equipe.length > 1 && (
                      <button type="button" onClick={() => setEquipe(equipe.filter((_, j) => j !== i))}
                        className="text-slate-400 hover:text-red-500"><XIcon className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setEquipe([...equipe, ""])}>
                  <Plus className="h-4 w-4 mr-1" />Adicionar membro
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Checklist específico ── */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <ListChecks className="h-4 w-4 text-orange-600" />
              <p className="text-sm font-semibold text-slate-700">
                Checklist — {tipoSelecionado?.label ?? "Atividade"}
                <span className="ml-2 text-xs font-normal text-slate-400">(todos os itens precisam ser respondidos)</span>
              </p>
            </div>

            {naoConformes.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 font-medium">
                  {naoConformes.length} item(ns) não conforme(s). Aplique medidas corretivas antes de iniciar o serviço.
                </p>
              </div>
            )}

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {checklist.map((item, idx) => (
                <div key={idx} className={`rounded-xl border p-3 transition-colors ${
                  item.resposta === "sim" ? "bg-green-50 border-green-200"
                  : item.resposta === "nao" ? "bg-red-50 border-red-200"
                  : item.resposta === "na"  ? "bg-slate-50 border-slate-200"
                  : "bg-white border-slate-200"
                }`}>
                  <p className="text-xs text-slate-700 font-medium mb-2 leading-snug">
                    <span className="text-slate-400 mr-1">{idx + 1}.</span>{item.pergunta}
                  </p>
                  <div className="flex gap-1.5">
                    <button type="button"
                      onClick={() => setChecklistResposta(idx, "sim")}
                      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all
                        ${item.resposta === "sim" ? "bg-green-600 text-white border-green-600" : "bg-white text-green-700 border-green-300 hover:bg-green-50"}`}>
                      <CircleCheck className="h-3.5 w-3.5" />Sim
                    </button>
                    <button type="button"
                      onClick={() => setChecklistResposta(idx, "nao")}
                      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all
                        ${item.resposta === "nao" ? "bg-red-600 text-white border-red-600" : "bg-white text-red-700 border-red-300 hover:bg-red-50"}`}>
                      <CircleX className="h-3.5 w-3.5" />Não
                    </button>
                    <button type="button"
                      onClick={() => setChecklistResposta(idx, "na")}
                      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all
                        ${item.resposta === "na" ? "bg-slate-500 text-white border-slate-500" : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"}`}>
                      <Minus className="h-3.5 w-3.5" />N/A
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Progresso */}
            <div className="text-xs text-slate-500 text-right">
              {checklist.filter(c => c.resposta !== "").length} / {checklist.length} respondidos
            </div>
          </div>
        )}

        {/* ── Step 3: Tabela de Riscos ── */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Riscos pré-carregados para <strong>{tipoSelecionado?.label}</strong>. Revise, edite e adicione mais se necessário.
              </p>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />Baixo
                <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block ml-1" />Médio
                <span className="w-3 h-3 rounded-full bg-orange-400 inline-block ml-1" />Alto
                <span className="w-3 h-3 rounded-full bg-red-500 inline-block ml-1" />Crítico
              </div>
            </div>
            {riscos.map((r, i) => (
              <RiscoRow key={i} risco={r} index={i}
                onChange={upd => setRiscos(riscos.map((x, j) => j === i ? upd : x))}
                onRemove={() => setRiscos(riscos.filter((_, j) => j !== i))} />
            ))}
            <Button type="button" variant="outline" className="w-full border-dashed border-orange-300 text-orange-700 hover:bg-orange-50"
              onClick={() => setRiscos([...riscos, novoRisco()])}>
              <Plus className="h-4 w-4 mr-1" />Adicionar Risco
            </Button>
          </div>
        )}

        {/* ── Step 4: EPIs + Aprovação ── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                EPIs Necessários
                {tipoSelecionado && <span className="ml-1 text-xs font-normal text-slate-400">(pré-selecionados para {tipoSelecionado.label})</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                {todosEpis.map(epi => (
                  <button key={epi} type="button"
                    onClick={() => toggleEpi(epi)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all
                      ${epis.includes(epi) ? "bg-orange-600 text-white border-orange-600" : "bg-white text-slate-700 border-slate-300 hover:border-orange-400"}`}>
                    {epis.includes(epi) && <Check className="h-3 w-3 inline mr-1" />}{epi}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Observações</label>
              <Textarea value={observacoes} rows={3} onChange={e => setObservacoes(e.target.value)}
                placeholder="Condições especiais, instruções adicionais..." />
            </div>
            <div className="border border-orange-200 rounded-xl p-4 bg-orange-50 space-y-3">
              <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                <PenLine className="h-4 w-4" />Aprovação do Técnico/Engenheiro de SST
              </p>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Nome do Aprovador <span className="text-red-500">*</span></label>
                <Input value={aprovNome} onChange={e => setAprovNome(e.target.value)}
                  placeholder="Nome completo do aprovador" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Assinatura</label>
                {aprovAss ? (
                  <div className="relative border rounded-lg overflow-hidden bg-white">
                    <img src={aprovAss} alt="Assinatura" className="h-16 object-contain mx-auto block" />
                    <button type="button" onClick={() => setAprovAss(null)}
                      className="absolute top-1 right-1 text-slate-400 hover:text-red-500"><XIcon className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setPadOpen(true)}>
                    <PenLine className="h-4 w-4 mr-2" />Coletar Assinatura Canvas
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between gap-2 pt-2">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : onOpenChange(false)}>
            {step > 0 ? <><ChevronLeft className="h-4 w-4 mr-1" />Voltar</> : "Cancelar"}
          </Button>
          {step === 0 ? null : step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}
              className="bg-orange-600 hover:bg-orange-700">
              Próximo<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canNext() || createM.isPending}
              className="bg-orange-600 hover:bg-orange-700 min-w-[120px]">
              {createM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" />Criar APR</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
      <AssinaturaPadApr open={padOpen} onOpenChange={setPadOpen} onSave={url => setAprovAss(url)} />
    </Dialog>
  );
}

// ── Detalhe de uma APR ───────────────────────────────────────────────────────
function AprDetalheDialog({
  open, onOpenChange, aprId, companyId, onRefetch,
}: { open: boolean; onOpenChange: (v: boolean) => void; aprId: number | null; companyId: number; onRefetch: () => void; }) {
  const utils       = trpc.useUtils();
  const { confirm } = useConfirm();

  const [printLoading, setPrintLoading] = useState(false);

  const handlePrint = async () => {
    if (!aprId) return;
    setPrintLoading(true);
    try {
      const res = await utils.aprAnalises.gerarHtml.fetch({ id: aprId, companyId });
      const w = window.open("", "_blank");
      if (w) { w.document.write(res.html); w.document.close(); setTimeout(() => w.print(), 400); }
    } catch (e: any) { toast.error(e?.message ?? "Erro ao gerar PDF."); }
    finally { setPrintLoading(false); }
  };

  const detQ = trpc.aprAnalises.getById.useQuery(
    { id: aprId!, companyId },
    { enabled: open && aprId !== null }
  );
  const aprovarM  = trpc.aprAnalises.aprovar.useMutation({ onSuccess: () => { detQ.refetch(); onRefetch(); toast.success("APR aprovada!"); } });
  const concluirM = trpc.aprAnalises.concluir.useMutation({ onSuccess: () => { detQ.refetch(); onRefetch(); toast.success("APR concluída!"); } });
  const cancelarM = trpc.aprAnalises.cancelar.useMutation({ onSuccess: () => { detQ.refetch(); onRefetch(); toast.success("APR cancelada."); } });

  const apr = detQ.data;
  if (!apr) return null;

  const riscosCriticos = (apr.riscos ?? []).filter((r: any) => (r.probabilidade ?? 0) * (r.gravidade ?? 0) > 16);

  async function handleAprovar() {
    const ok = await confirm("Confirmar aprovação desta APR?");
    if (!ok) return;
    aprovarM.mutate({ id: apr.id, companyId });
  }
  async function handleConcluir() {
    const ok = await confirm("Confirmar conclusão desta APR?");
    if (!ok) return;
    concluirM.mutate({ id: apr.id, companyId });
  }
  async function handleCancelar() {
    const ok = await confirm("Cancelar esta APR? Esta ação não pode ser desfeita.");
    if (!ok) return;
    cancelarM.mutate({ id: apr.id, companyId });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-orange-600" />
              {apr.numero} — {apr.atividade}
            </DialogTitle>
            <StatusBadge status={apr.status} />
          </div>
        </DialogHeader>

        {detQ.isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>}

        {apr && (
          <div className="space-y-5">
            {/* Cabeçalho */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border text-sm">
              <div><span className="text-slate-500 block text-xs">Data</span><span className="font-medium">{apr.dataEmissao || "—"}</span></div>
              <div><span className="text-slate-500 block text-xs">Responsável</span><span className="font-medium">{apr.responsavelNome || "—"}</span></div>
              <div><span className="text-slate-500 block text-xs">Obra</span><span className="font-medium">{apr.obraNome || "—"}</span></div>
              <div><span className="text-slate-500 block text-xs">Local</span><span className="font-medium">{apr.localServico || "—"}</span></div>
            </div>

            {/* Alerta riscos críticos */}
            {riscosCriticos.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <p className="text-sm text-red-800 font-medium">
                  {riscosCriticos.length} risco{riscosCriticos.length > 1 ? "s" : ""} crítico{riscosCriticos.length > 1 ? "s" : ""} identificado{riscosCriticos.length > 1 ? "s" : ""}. Medidas de controle obrigatórias antes de iniciar o serviço.
                </p>
              </div>
            )}

            {/* Equipe */}
            {(apr.equipe ?? []).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1"><User className="h-4 w-4" />Equipe</h4>
                <div className="flex flex-wrap gap-2">
                  {apr.equipe.map((m: string, i: number) => (
                    <span key={i} className="text-xs bg-slate-100 border border-slate-200 rounded-full px-3 py-1 font-medium">{m}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Checklist */}
            {(() => {
              const cl: ChecklistItem[] = (() => { try { return JSON.parse(apr.checklistJson ?? "[]"); } catch { return []; } })();
              const tipoAPR = APR_TIPOS.find(t => t.id === apr.tipoAtividade);
              if (!cl.length) return null;
              const naoConf = cl.filter((c: ChecklistItem) => c.resposta === "nao");
              return (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-orange-600" />
                    Checklist
                    {tipoAPR && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tipoAPR.colorBg} ${tipoAPR.colorText}`}>
                        {tipoAPR.emoji} {tipoAPR.label} — {tipoAPR.nr}
                      </span>
                    )}
                  </h4>
                  {naoConf.length > 0 && (
                    <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-xl mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                      <p className="text-xs text-red-800 font-medium">{naoConf.length} item(ns) não conforme(s) registrado(s).</p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {cl.map((item: ChecklistItem, i: number) => (
                      <div key={i} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs
                        ${item.resposta === "sim" ? "bg-green-50 border-green-200"
                        : item.resposta === "nao" ? "bg-red-50 border-red-200"
                        : "bg-slate-50 border-slate-200"}`}>
                        <span className="shrink-0 mt-0.5">
                          {item.resposta === "sim" ? <CircleCheck className="h-3.5 w-3.5 text-green-600" />
                          : item.resposta === "nao" ? <CircleX className="h-3.5 w-3.5 text-red-600" />
                          : <Minus className="h-3.5 w-3.5 text-slate-400" />}
                        </span>
                        <span className={`flex-1 leading-snug ${item.resposta === "nao" ? "text-red-800 font-medium" : "text-slate-700"}`}>
                          <span className="text-slate-400 mr-1">{i + 1}.</span>{item.pergunta}
                        </span>
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full
                          ${item.resposta === "sim" ? "bg-green-100 text-green-700"
                          : item.resposta === "nao" ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-500"}`}>
                          {item.resposta === "sim" ? "SIM" : item.resposta === "nao" ? "NÃO" : "N/A"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Tabela de riscos */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                <BarChart3 className="h-4 w-4 text-orange-600" />Matriz de Riscos
              </h4>
              <div className="space-y-3">
                {(apr.riscos ?? []).map((r: any, i: number) => {
                  const nivel = (r.probabilidade ?? 0) * (r.gravidade ?? 0);
                  const cfg = nivel > 0 ? nivelConfig(nivel) : null;
                  return (
                    <div key={i} className={`border rounded-xl p-3 ${cfg ? `${cfg.bg} ${cfg.border}` : "bg-white border-slate-200"}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="text-xs font-bold text-slate-600 uppercase">#{i + 1} — {r.etapaAtividade || "—"}</span>
                          <p className="text-sm font-semibold">{r.perigo} → {r.risco}</p>
                        </div>
                        {cfg && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            P{r.probabilidade}×G{r.gravidade}={nivel} {cfg.label}
                          </span>
                        )}
                      </div>
                      {r.medidasControle && (
                        <p className="text-xs text-slate-600"><span className="font-semibold">Controle:</span> {r.medidasControle}</p>
                      )}
                      {r.responsavelNome && (
                        <p className="text-xs text-slate-500 mt-1"><span className="font-semibold">Resp.:</span> {r.responsavelNome} {r.prazo ? `| Prazo: ${r.prazo}` : ""}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* EPIs */}
            {(apr.epis ?? []).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1"><HardHat className="h-4 w-4 text-orange-600" />EPIs Necessários</h4>
                <div className="flex flex-wrap gap-2">
                  {apr.epis.map((e: string, i: number) => (
                    <span key={i} className="text-xs bg-orange-50 border border-orange-200 text-orange-800 rounded-full px-3 py-1 font-medium">
                      <Check className="h-3 w-3 inline mr-1" />{e}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Observações */}
            {apr.observacoes && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700">
                <span className="font-semibold block text-xs text-slate-500 mb-1">Observações</span>
                {apr.observacoes}
              </div>
            )}

            {/* Aprovação */}
            {(apr.aprovadoPorNome || apr.aprovadoPorAss) && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <h4 className="text-sm font-semibold text-green-800 mb-2">Aprovado por</h4>
                <p className="text-sm font-medium">{apr.aprovadoPorNome}</p>
                {apr.aprovadoPorAss && <img src={apr.aprovadoPorAss} alt="Assinatura" className="h-14 object-contain mt-2" />}
                {apr.aprovadoEm && <p className="text-xs text-green-600 mt-1">{new Date(apr.aprovadoEm).toLocaleString("pt-BR")}</p>}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex flex-wrap gap-2 justify-end pt-2">
          {/* Imprimir — disponível em qualquer status */}
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={printLoading}
            className="border-slate-200 text-slate-600 hover:bg-slate-50">
            {printLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
            {printLoading ? "Gerando..." : "Imprimir / PDF"}
          </Button>
          {apr?.status === "em_analise" && (
            <>
              <Button variant="outline" size="sm" onClick={handleCancelar} className="text-red-600 border-red-300 hover:bg-red-50">
                <Ban className="h-4 w-4 mr-1" />Cancelar APR
              </Button>
              <Button size="sm" onClick={handleAprovar} className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-4 w-4 mr-1" />Aprovar APR
              </Button>
            </>
          )}
          {apr?.status === "aprovada" && (
            <Button size="sm" onClick={handleConcluir} className="bg-blue-600 hover:bg-blue-700">
              <Check className="h-4 w-4 mr-1" />Concluir APR
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function AprAnalise() {
  const { selectedCompany } = useCompany();
  const { user }            = useAuth();
  const companyId           = selectedCompany?.id ?? 0;
  const employeeId          = (user as any)?.employeeId ?? 0;

  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [novaOpen, setNovaOpen]         = useState(false);
  const [detalheId, setDetalheId]       = useState<number | null>(null);
  const [detalheOpen, setDetalheOpen]   = useState(false);

  const statsQ = trpc.aprAnalises.stats.useQuery({ companyId }, { enabled: !!companyId, refetchInterval: 30000 });
  const listQ  = trpc.aprAnalises.list.useQuery(
    { companyId, status: filtroStatus ?? undefined, limit: 60, offset: 0 },
    { enabled: !!companyId }
  );

  function refetch() { statsQ.refetch(); listQ.refetch(); }

  function abrirDetalhe(id: number) { setDetalheId(id); setDetalheOpen(true); }

  const stats = statsQ.data ?? { total: 0, rascunho: 0, em_analise: 0, aprovada: 0, concluida: 0, cancelada: 0 };

  const CARDS = [
    { key: null,        label: "Total",      value: stats.total,       color: "from-orange-500 to-orange-600", icon: ShieldAlert },
    { key: "em_analise",label: "Em Análise", value: stats.em_analise,  color: "from-amber-500 to-amber-600",   icon: Clock },
    { key: "aprovada",  label: "Aprovadas",  value: stats.aprovada,    color: "from-green-500 to-green-600",   icon: CheckCircle2 },
    { key: "concluida", label: "Concluídas", value: stats.concluida,   color: "from-blue-500 to-blue-600",     icon: Check },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-7 w-7 text-orange-600" />
              APR — Análise Preliminar de Risco
            </h1>
            <p className="text-slate-500 text-sm mt-1">Identifique, avalie e controle riscos antes de iniciar atividades perigosas</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refetch} disabled={listQ.isFetching}>
              <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => setNovaOpen(true)} className="bg-orange-600 hover:bg-orange-700">
              <Plus className="h-4 w-4 mr-1.5" />Nova APR
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CARDS.map(card => {
            const Icon = card.icon;
            const active = filtroStatus === card.key;
            return (
              <button key={String(card.key)} type="button" onClick={() => setFiltroStatus(active ? null : card.key)}
                className={`relative overflow-hidden rounded-2xl p-4 text-left transition-all shadow-sm hover:shadow-md
                  ${active ? "ring-2 ring-orange-500 ring-offset-1 scale-[1.02]" : "hover:scale-[1.01]"}`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-90`} />
                <div className="relative text-white">
                  <Icon className="h-5 w-5 mb-1 opacity-80" />
                  <div className="text-2xl font-bold">{card.value}</div>
                  <div className="text-xs font-medium opacity-80">{card.label}</div>
                </div>
                {active && <div className="absolute top-2 right-2 bg-white/30 rounded-full p-0.5"><Check className="h-3 w-3 text-white" /></div>}
              </button>
            );
          })}
        </div>

        {/* Filter label */}
        {filtroStatus && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Filtrando por:</span>
            <StatusBadge status={filtroStatus} />
            <button onClick={() => setFiltroStatus(null)} className="text-xs text-slate-400 hover:text-slate-600 underline">limpar</button>
          </div>
        )}

        {/* Lista */}
        {listQ.isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        )}

        {!listQ.isLoading && (listQ.data ?? []).length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShieldAlert className="h-16 w-16 text-slate-200 mb-4" />
            <h3 className="text-lg font-semibold text-slate-600">Nenhuma APR encontrada</h3>
            <p className="text-slate-400 text-sm mt-1 mb-4">Crie uma nova APR para identificar e controlar os riscos da atividade.</p>
            <Button onClick={() => setNovaOpen(true)} className="bg-orange-600 hover:bg-orange-700">
              <Plus className="h-4 w-4 mr-1" />Nova APR
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {(listQ.data ?? []).map((apr: any) => {
            const cfg = STATUS_CONFIG[apr.status] ?? STATUS_CONFIG.rascunho;
            return (
              <div key={apr.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                onClick={() => abrirDetalhe(apr.id)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-xs font-bold text-orange-600 tracking-wide">{apr.numero}</span>
                    <h3 className="font-semibold text-slate-800 text-sm mt-0.5 line-clamp-2">{apr.atividade || "Sem atividade"}</h3>
                  </div>
                  <StatusBadge status={apr.status} />
                </div>

                <div className="space-y-1 text-xs text-slate-500">
                  {apr.obraNome && (
                    <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{apr.obraNome}</div>
                  )}
                  {apr.localServico && (
                    <div className="flex items-center gap-1"><Building2 className="h-3 w-3" />{apr.localServico}</div>
                  )}
                  <div className="flex items-center gap-1"><User className="h-3 w-3" />{apr.responsavelNome ?? apr.criadoPorNome ?? "—"}</div>
                  {apr.dataEmissao && (
                    <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{apr.dataEmissao}</div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                      {apr.totalRiscos} risco{apr.totalRiscos !== 1 ? "s" : ""}
                    </span>
                    {(apr.equipe ?? []).length > 0 && (
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />{apr.equipe.length} membro{apr.equipe.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-orange-500 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <NovaAprDialog
        open={novaOpen} onOpenChange={setNovaOpen}
        companyId={companyId} employeeId={employeeId}
        onCreated={refetch}
      />

      <AprDetalheDialog
        open={detalheOpen} onOpenChange={setDetalheOpen}
        aprId={detalheId} companyId={companyId} onRefetch={refetch}
      />
    </DashboardLayout>
  );
}
