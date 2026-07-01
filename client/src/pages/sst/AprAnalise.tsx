// Rev. 3932 — APR equipe: NR check × atividade + tags CIPA + Aviso Prévio + bloqueio sem treinamento
import { useState, useRef, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "sonner";
import {
  ShieldAlert, Plus, ChevronRight, ChevronLeft, Check, X as XIcon,
  Loader2, AlertTriangle, CheckCircle2, Clock, FileText, MapPin,
  User, PenLine, Eraser, Trash2, Eye, Printer,
  RefreshCw, AlertCircle, BarChart3, Building2,
  ListChecks, Layers, CircleCheck, CircleX, Minus,
  HardHat, Ban, Calendar, Timer, Zap, Info, ChevronDown, ChevronUp,
  Shield, Activity, Clipboard, Users,
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

function nivelConfig(nivel: number) {
  if (nivel <= 4)  return { label: "Baixo",   bg: "bg-green-100",  text: "text-green-800",  border: "border-green-300",  dot: "bg-green-500" };
  if (nivel <= 9)  return { label: "Médio",   bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300", dot: "bg-yellow-500" };
  if (nivel <= 16) return { label: "Alto",    bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300", dot: "bg-orange-500" };
  return               { label: "Crítico", bg: "bg-red-100",    text: "text-red-800",    border: "border-red-300",    dot: "bg-red-600" };
}

const TIPO_RISCO_OPTS = [
  { value: "seguranca",     label: "🦺 Segurança" },
  { value: "saude",         label: "🏥 Saúde" },
  { value: "meio_ambiente", label: "🌿 Meio Ambiente" },
  { value: "qualidade",     label: "✅ Qualidade" },
];

const TIPO_MEDIDA_OPTS = [
  { value: "eliminacao",   label: "Eliminação" },
  { value: "substituicao", label: "Substituição" },
  { value: "epc",          label: "EPC" },
  { value: "admin",        label: "Adm. / Proc." },
  { value: "epi",          label: "EPI" },
];

const EPI_SUGESTOES = [
  "Capacete de segurança", "Óculos de proteção", "Luvas de vaqueta",
  "Luvas de borracha", "Calçado de segurança", "Protetor auricular",
  "Máscara PFF2", "Cinto de segurança", "Talabarte", "Trava-quedas",
  "Colete refletivo", "Uniforme de trabalho",
];

type ChecklistResposta = "sim" | "nao" | "na" | "";
type ChecklistItem = { pergunta: string; resposta: ChecklistResposta };

type AprTipo = {
  id: string; label: string; nr: string; emoji: string;
  colorBg: string; colorBorder: string; colorText: string; colorBtn: string; colorAccent: string;
  descricao: string; checklist: string[]; episSugeridos: string[];
  riscosPredef: Array<Partial<RiscoItem>>;
  guia: string;
};

const APR_TIPOS: AprTipo[] = [
  {
    id: "altura", label: "Trabalho em Altura", nr: "NR-35", emoji: "⬆️",
    colorBg: "bg-blue-50", colorBorder: "border-blue-300", colorText: "text-blue-800",
    colorBtn: "bg-blue-600 hover:bg-blue-700", colorAccent: "#2563eb",
    descricao: "Atividades realizadas acima de 2m com risco de queda",
    guia: "NR-35 exige capacitação periódica, plano de resgate e supervisão. Todos os pontos de ancoragem devem ser verificados antes do início.",
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
    colorBg: "bg-purple-50", colorBorder: "border-purple-300", colorText: "text-purple-800",
    colorBtn: "bg-purple-600 hover:bg-purple-700", colorAccent: "#7c3aed",
    descricao: "Entrada e trabalho em espaços com acesso e saída restritos",
    guia: "NR-33 exige PET (Permissão de Entrada e Trabalho) assinada, análise atmosférica prévia com detector 4-gases e vigia treinado posicionado externamente.",
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
    colorBg: "bg-amber-50", colorBorder: "border-amber-300", colorText: "text-amber-800",
    colorBtn: "bg-amber-600 hover:bg-amber-700", colorAccent: "#d97706",
    descricao: "Escavações, valas, fundações e rebaixamento de terreno",
    guia: "NR-18 exige sondagem prévia, levantamento de interferências (redes de utilidade) e escoramento para valas com mais de 1,25m de profundidade.",
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
    colorBg: "bg-sky-50", colorBorder: "border-sky-300", colorText: "text-sky-800",
    colorBtn: "bg-sky-600 hover:bg-sky-700", colorAccent: "#0284c7",
    descricao: "Montagem, uso e desmontagem de andaimes tubulares",
    guia: "Andaime deve ter projeto ou esquema de montagem aprovado por responsável técnico. Inspeção por profissional habilitado antes do primeiro uso é obrigatória (NR-35 item 35.7).",
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
    colorBg: "bg-yellow-50", colorBorder: "border-yellow-300", colorText: "text-yellow-800",
    colorBtn: "bg-yellow-600 hover:bg-yellow-700", colorAccent: "#ca8a04",
    descricao: "Serviços em instalações e equipamentos elétricos",
    guia: "NR-10 exige o procedimento LOTO (bloqueio e etiquetagem) antes de qualquer intervenção. Verificação de ausência de tensão com instrumento homologado é mandatória.",
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
    colorBg: "bg-red-50", colorBorder: "border-red-300", colorText: "text-red-800",
    colorBtn: "bg-red-600 hover:bg-red-700", colorAccent: "#dc2626",
    descricao: "Demolição total ou parcial de estruturas civis",
    guia: "NR-18 item 18.9 exige laudo técnico de demolição por responsável técnico (ART/RRT). Desligamento de TODAS as redes de utilidade antes do início é obrigatório.",
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
    colorBg: "bg-green-50", colorBorder: "border-green-300", colorText: "text-green-800",
    colorBtn: "bg-green-600 hover:bg-green-700", colorAccent: "#16a34a",
    descricao: "Movimentação, içamento e transporte de cargas pesadas",
    guia: "NR-11 exige operador habilitado com certificação. Rigger (Encalhe) deve ser treinado. Área de içamento deve ser completamente isolada e livre de pessoas durante a operação.",
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
    colorBg: "bg-orange-50", colorBorder: "border-orange-300", colorText: "text-orange-800",
    colorBtn: "bg-orange-600 hover:bg-orange-700", colorAccent: "#ea580c",
    descricao: "Soldagem elétrica, oxicorte e trabalhos com chama aberta",
    guia: "Todo trabalho a quente próximo a materiais combustíveis exige Permissão de Trabalho a Quente. Vigia de incêndio deve permanecer no local por no mínimo 30 min após o término.",
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
    id: "cobertura", label: "Serviços em Cobertura", nr: "NR-18 / NR-35", emoji: "🏠",
    colorBg: "bg-teal-50", colorBorder: "border-teal-300", colorText: "text-teal-800",
    colorBtn: "bg-teal-600 hover:bg-teal-700", colorAccent: "#0d9488",
    descricao: "Substituição, reparo e impermeabilização de coberturas",
    guia: "Combina NR-35 (trabalho em altura) com NR-18 (obras civis). Atenção especial para telhas de fibrocimento — nunca pisar diretamente. Exige plataformas distribuidoras de carga.",
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
    id: "geral", label: "Atividade Geral de Obra", nr: "NR-18", emoji: "🦺",
    colorBg: "bg-slate-50", colorBorder: "border-slate-300", colorText: "text-slate-800",
    colorBtn: "bg-slate-600 hover:bg-slate-700", colorAccent: "#475569",
    descricao: "Serviços gerais de obra sem classificação específica acima",
    guia: "NR-18 é a norma base para canteiros de obra. Verifique PCMSO/PGR atualizados, ASOs válidos para todos os trabalhadores e DDS realizado antes do início dos trabalhos.",
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
  em_analise: { label: "Em Análise", color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",  icon: Clock },
  aprovada:   { label: "Aprovada",   color: "text-green-700",  bg: "bg-green-50 border-green-200",  icon: CheckCircle2 },
  concluida:  { label: "Concluída",  color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",    icon: Check },
  cancelada:  { label: "Cancelada",  color: "text-red-700",    bg: "bg-red-50 border-red-200",      icon: Ban },
  rascunho:   { label: "Rascunho",   color: "text-slate-600",  bg: "bg-slate-50 border-slate-200",  icon: FileText },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.rascunho;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

// ── Assinatura canvas ─────────────────────────────────────────────────────
function AssinaturaPad({ open, onClose, onSave, title = "Assinatura" }: {
  open: boolean; onClose: () => void; onSave: (url: string) => void; title?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);

  function getCtx() {
    const c = canvasRef.current; if (!c) return null;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    return ctx;
  }
  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const src = "touches" in e ? (e as React.TouchEvent).touches[0] : (e as React.MouseEvent);
    return { x: (src.clientX - rect.left) * (c.width / rect.width), y: (src.clientY - rect.top) * (c.height / rect.height) };
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
  function limpar() { const c = canvasRef.current; if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height); }
  function salvar() {
    const c = canvasRef.current; if (!c) return;
    const blank = document.createElement("canvas"); blank.width = c.width; blank.height = c.height;
    if (c.toDataURL() === blank.toDataURL()) { toast.error("Desenhe a assinatura primeiro."); return; }
    onSave(c.toDataURL("image/png")); onClose();
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><PenLine className="h-4 w-4 text-orange-600" />{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XIcon className="h-5 w-5" /></button>
        </div>
        <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-slate-50">
          <canvas ref={canvasRef} width={460} height={180} className="block w-full cursor-crosshair touch-none"
            onMouseDown={onStart} onMouseMove={onMove} onMouseUp={() => { drawing.current = false; }} onMouseLeave={() => { drawing.current = false; }}
            onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={() => { drawing.current = false; }} />
        </div>
        <p className="text-xs text-center text-slate-400">Assine com o dedo ou mouse</p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={limpar}><Eraser className="h-4 w-4 mr-1" />Limpar</Button>
          <Button className="flex-1 bg-orange-600 hover:bg-orange-700" onClick={salvar}><Check className="h-4 w-4 mr-1" />Confirmar</Button>
        </div>
      </div>
    </div>
  );
}

// ── RiscoRow ──────────────────────────────────────────────────────────────
type RiscoItem = {
  id?: number; etapaAtividade: string; perigo: string; risco: string;
  tipoRisco: string; probabilidade: number; gravidade: number;
  medidasControle: string; tipoMedida: string; responsavelNome: string;
  prazo: string; situacao: string;
};

function novoRisco(): RiscoItem {
  return { etapaAtividade: "", perigo: "", risco: "", tipoRisco: "seguranca",
    probabilidade: 0, gravidade: 0, medidasControle: "", tipoMedida: "epc",
    responsavelNome: "", prazo: "", situacao: "aberta" };
}

function RiscoRow({ risco, index, onChange, onRemove, readOnly }: {
  risco: RiscoItem; index: number; onChange: (r: RiscoItem) => void; onRemove: () => void; readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const nivel = risco.probabilidade && risco.gravidade ? risco.probabilidade * risco.gravidade : null;
  const cfg   = nivel ? nivelConfig(nivel) : null;
  function upd(patch: Partial<RiscoItem>) { onChange({ ...risco, ...patch }); }

  return (
    <div className={`border-2 rounded-2xl overflow-hidden transition-all ${cfg ? `${cfg.border}` : "border-slate-200"}`}>
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none ${cfg ? cfg.bg : "bg-slate-50"}`}
        onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-3 min-w-0">
          {cfg && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />}
          <span className="text-xs font-bold text-slate-500 shrink-0">#{index + 1}</span>
          <span className="text-sm font-semibold text-slate-800 truncate">
            {risco.perigo || risco.risco || "Novo risco"}
          </span>
          {nivel && cfg && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 hidden sm:inline-flex ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              P{risco.probabilidade}×G{risco.gravidade}={nivel} — {cfg.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!readOnly && (
            <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }}
              className="text-slate-300 hover:text-red-500 transition-colors p-1">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3 bg-white space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Etapa / Atividade</label>
              <Input value={risco.etapaAtividade} disabled={readOnly} placeholder="Ex.: Concretagem de pilar"
                onChange={e => upd({ etapaAtividade: e.target.value })} className="text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Perigo / Fonte</label>
              <Input value={risco.perigo} disabled={readOnly} placeholder="Ex.: Trabalho em altura"
                onChange={e => upd({ perigo: e.target.value })} className="text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Risco / Consequência</label>
              <Input value={risco.risco} disabled={readOnly} placeholder="Ex.: Queda de nível diferente"
                onChange={e => upd({ risco: e.target.value })} className="text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Tipo de Risco</label>
              <Select value={risco.tipoRisco} disabled={readOnly} onValueChange={v => upd({ tipoRisco: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>{TIPO_RISCO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Probabilidade (P)</label>
              <Select value={String(risco.probabilidade || "")} disabled={readOnly}
                onValueChange={v => upd({ probabilidade: Number(v) })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="1–5" /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{PROB_LABELS[n]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Gravidade (G)</label>
              <Select value={String(risco.gravidade || "")} disabled={readOnly}
                onValueChange={v => upd({ gravidade: Number(v) })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="1–5" /></SelectTrigger>
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
            <Textarea value={risco.medidasControle} disabled={readOnly} rows={2} className="text-sm"
              placeholder="Descreva as medidas para eliminar ou reduzir este risco..."
              onChange={e => upd({ medidasControle: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Responsável</label>
              <Input value={risco.responsavelNome} disabled={readOnly} placeholder="Nome do responsável" className="text-sm"
                onChange={e => upd({ responsavelNome: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Prazo de Implantação</label>
              <Input type="date" value={risco.prazo} disabled={readOnly} onChange={e => upd({ prazo: e.target.value })} className="text-sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Guia por step ────────────────────────────────────────────────────────
const STEP_GUIDES: Record<number, { title: string; text: string; icon: any }> = {
  0: { title: "Escolha a Atividade", icon: Layers, text: "Selecione o tipo de atividade. O checklist, riscos típicos e EPIs obrigatórios serão carregados automaticamente conforme a NR correspondente." },
  1: { title: "Dados Gerais", icon: Clipboard, text: "Data, hora e responsável são preenchidos automaticamente. Ao selecionar a obra:\n• TST e encarregado → carregados como aprovador\n• Efetivo (CLT, PJ e terceiros) com fotos → selecionável direto na equipe" },
  2: { title: "Checklist de Segurança", icon: ListChecks, text: "Responda todos os itens:\n• SIM = Condição atendida\n• NÃO = Não conformidade — registre e corrija antes de iniciar\n• N/A = Não se aplica a esta atividade" },
  3: { title: "Matriz de Riscos P×G", icon: Activity, text: "Probabilidade × Gravidade = Nível de Risco\n• ≤4 Baixo (verde)\n• ≤9 Médio (amarelo)\n• ≤16 Alto (laranja)\n• >16 Crítico (vermelho)\n\nCadastre medidas de controle para todo risco Alto ou Crítico." },
  4: { title: "EPIs & Aprovação", icon: Shield, text: "Selecione todos os EPIs necessários para a atividade. A assinatura do Técnico ou Engenheiro de SST é obrigatória para aprovação do documento." },
};

// ── Tipo de membro da equipe ─────────────────────────────────────────────
type EquipeMembro = {
  nome: string;
  fotoUrl?: string | null;
  tipo?: "proprio" | "terceiro" | "manual";
  funcao?: string;
};

function getMembroNome(m: any): string {
  return typeof m === "string" ? m : (m?.nome ?? "—");
}
function getMembroFoto(m: any): string | null {
  return typeof m === "object" && m !== null ? (m.fotoUrl ?? null) : null;
}
function getMembroTipo(m: any): string | null {
  return typeof m === "object" && m !== null ? (m.tipo ?? null) : null;
}

function AvatarCircle({ nome, fotoUrl, size = "md" }: { nome: string; fotoUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-14 h-14 text-lg" : "w-10 h-10 text-sm";
  if (fotoUrl) return (
    <img src={fotoUrl} alt={nome}
      className={`${dim} rounded-full object-cover shrink-0 border-2 border-white shadow-sm`}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
  );
  return (
    <div className={`${dim} rounded-full bg-orange-100 border-2 border-white shadow-sm flex items-center justify-center font-bold text-orange-700 shrink-0`}>
      {nome.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Wizard Full-Screen ───────────────────────────────────────────────────
function AprWizardFullscreen({
  open, onClose, companyId, employeeId, userName, onCreated,
}: {
  open: boolean; onClose: () => void;
  companyId: number; employeeId: number; userName: string; onCreated: () => void;
}) {
  const STEPS = ["Tipo", "Dados Gerais", "Checklist", "Riscos", "EPIs & Aprovação"];
  const [step, setStep]     = useState(0);
  const [tipoId, setTipoId] = useState("");

  const now = new Date();
  const [dataEmissao, setDataEmissao] = useState(now.toISOString().slice(0, 10));
  const [horaInicio, setHoraInicio]   = useState(now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  const [obraId, setObraId]           = useState<string>("");
  const [atividade, setAtividade]     = useState("");
  const [localServico, setLocalServico] = useState("");
  const [equipeSelecao, setEquipeSelecao] = useState<EquipeMembro[]>([]);
  const [equipeManual, setEquipeManual]   = useState("");
  const [checklist, setChecklist]     = useState<ChecklistItem[]>([]);
  const [riscos, setRiscos]           = useState<RiscoItem[]>([novoRisco()]);
  const [epis, setEpis]               = useState<string[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [aprovNome, setAprovNome]     = useState(userName);
  const [aprovAss, setAprovAss]       = useState<string | null>(null);
  const [padOpen, setPadOpen]         = useState(false);

  const obrasQ      = trpc.obras.list.useQuery({ companyId }, { enabled: open });
  const obraSstQ    = trpc.ptPermissoes.getObraSST.useQuery(
    { companyId, obraId: Number(obraId) },
    { enabled: open && !!obraId && Number(obraId) > 0 }
  );
  const obraFuncsQ  = trpc.obras.funcionarios.useQuery(
    { obraId: Number(obraId) },
    { enabled: open && !!obraId && Number(obraId) > 0 }
  );
  const obraTercQ   = trpc.terceiros.funcionarios.list.useQuery(
    { companyId, obraId: Number(obraId) },
    { enabled: open && !!obraId && Number(obraId) > 0 }
  );
  const createM  = trpc.aprAnalises.create.useMutation({
    onSuccess: () => { toast.success("APR criada com sucesso!"); onCreated(); onClose(); resetForm(); },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    if (obraSstQ.data?.tstNome) setAprovNome(obraSstQ.data.tstNome);
  }, [obraSstQ.data]);

  function resetForm() {
    const n = new Date();
    setStep(0); setTipoId(""); setObraId(""); setDataEmissao(n.toISOString().slice(0, 10));
    setHoraInicio(n.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    setAtividade(""); setLocalServico(""); setEquipeSelecao([]); setEquipeManual("");
    setChecklist([]); setRiscos([novoRisco()]); setEpis([]);
    setObservacoes(""); setAprovNome(userName); setAprovAss(null);
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
      companyId, obraId: obraId ? Number(obraId) : null, employeeId,
      tipoAtividade: tipoId || null, checklistJson: checklist.length ? JSON.stringify(checklist) : null,
      dataEmissao, horaInicio: horaInicio || null, atividade, localServico,
      equipeJson: JSON.stringify(equipeSelecao),
      epiJson: JSON.stringify(epis), observacoes: observacoes || null,
      riscos: riscosValid.map((r, i) => ({ ...r, ordem: i, probabilidade: r.probabilidade || null, gravidade: r.gravidade || null })),
    });
  }

  const tipoSelecionado = APR_TIPOS.find(t => t.id === tipoId);
  const naoConformes    = checklist.filter(c => c.resposta === "nao");
  const todosEpis       = tipoSelecionado
    ? [...new Set([...tipoSelecionado.episSugeridos, ...EPI_SUGESTOES])]
    : EPI_SUGESTOES;
  const guide = STEP_GUIDES[step];
  const GuideIcon = guide?.icon ?? Info;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-500 text-white px-5 py-3.5 flex items-center gap-4 shrink-0 shadow-lg">
        <ShieldAlert className="h-6 w-6 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-base">Nova APR</span>
            {tipoSelecionado && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">
                {tipoSelecionado.emoji} {tipoSelecionado.label} — {tipoSelecionado.nr}
              </span>
            )}
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-1.5 mt-1.5">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className={`flex items-center justify-center rounded-full text-[9px] font-bold transition-all ${
                  i < step ? "w-5 h-5 bg-white text-orange-600"
                  : i === step ? "w-5 h-5 bg-white/30 border-2 border-white text-white"
                  : "w-4 h-4 bg-white/15 text-white/60"
                }`}>
                  {i < step ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </div>
                <span className={`text-[10px] hidden sm:block font-medium ${i === step ? "text-white" : i < step ? "text-orange-200" : "text-white/40"}`}>{s}</span>
                {i < STEPS.length - 1 && <div className={`w-3 h-px shrink-0 ${i < step ? "bg-white/60" : "bg-white/20"}`} />}
              </div>
            ))}
          </div>
        </div>
        <button onClick={() => { onClose(); resetForm(); }}
          className="shrink-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Left sidebar (desktop only) */}
        <div className="w-72 border-r bg-slate-50 overflow-y-auto shrink-0 hidden lg:flex flex-col">
          {/* Step list */}
          <div className="p-4 border-b">
            {STEPS.map((s, i) => (
              <div key={i} className={`flex items-center gap-3 py-2.5 px-3 rounded-xl mb-1 transition-all ${
                i === step ? "bg-orange-50 border border-orange-200" : i < step ? "opacity-60" : "opacity-40"
              }`}>
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                  i < step ? "bg-orange-500 text-white" : i === step ? "bg-orange-100 text-orange-700 border-2 border-orange-400" : "bg-slate-200 text-slate-400"
                }`}>
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold leading-tight ${i === step ? "text-orange-800" : "text-slate-600"}`}>{s}</p>
                  {i === 2 && checklist.length > 0 && (
                    <p className="text-[10px] text-slate-400">{checklist.filter(c => c.resposta !== "").length}/{checklist.length} respondidos</p>
                  )}
                  {i === 3 && (
                    <p className="text-[10px] text-slate-400">{riscos.length} risco{riscos.length !== 1 ? "s" : ""}</p>
                  )}
                  {i === 4 && (
                    <p className="text-[10px] text-slate-400">{epis.length} EPI{epis.length !== 1 ? "s" : ""} selecionado{epis.length !== 1 ? "s" : ""}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Guide text */}
          {guide && (
            <div className="p-4 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <GuideIcon className="h-4 w-4 text-orange-600" />
                <h4 className="text-sm font-semibold text-slate-700">{guide.title}</h4>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">{guide.text}</p>
              {tipoSelecionado && step > 0 && (
                <div className={`mt-4 p-3 rounded-xl border ${tipoSelecionado.colorBg} ${tipoSelecionado.colorBorder}`}>
                  <p className={`text-xs font-semibold ${tipoSelecionado.colorText} mb-1`}>
                    {tipoSelecionado.emoji} {tipoSelecionado.label}
                  </p>
                  <p className="text-[11px] text-slate-600 leading-snug">{tipoSelecionado.guia}</p>
                </div>
              )}
              {step === 1 && obraSstQ.data && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-xs font-semibold text-blue-800 mb-1 flex items-center gap-1"><Zap className="h-3 w-3" />Auto-preenchido da obra</p>
                  {obraSstQ.data.tstNome && <p className="text-[11px] text-blue-700">TST: {obraSstQ.data.tstNome}</p>}
                  {obraSstQ.data.encarregadoNome && <p className="text-[11px] text-blue-700">Encarregado: {obraSstQ.data.encarregadoNome}</p>}
                  {obraSstQ.data.responsavelNome && <p className="text-[11px] text-blue-700">Resp. obra: {obraSstQ.data.responsavelNome}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main form */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">

            {/* ── Step 0: Tipo ── */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Tipo de Atividade</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Selecione para carregar o checklist e riscos da NR correspondente</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {APR_TIPOS.map(tipo => (
                    <button key={tipo.id} type="button" onClick={() => handleSelectTipo(tipo.id)}
                      className={`text-left p-4 rounded-2xl border-2 transition-all hover:shadow-md active:scale-[0.98]
                        ${tipoId === tipo.id ? `${tipo.colorBg} ${tipo.colorBorder} shadow-sm` : "bg-white border-slate-200 hover:border-slate-300"}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{tipo.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className={`font-semibold text-sm leading-tight ${tipoId === tipo.id ? tipo.colorText : "text-slate-800"}`}>{tipo.label}</p>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${tipoId === tipo.id ? `${tipo.colorBg} ${tipo.colorText}` : "bg-slate-100 text-slate-500"}`}>{tipo.nr}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-snug">{tipo.descricao}</p>
                          <p className="text-[10px] text-slate-400 mt-1.5">
                            {tipo.checklist.length} itens checklist · {tipo.riscosPredef.length} riscos pré-definidos
                          </p>
                        </div>
                        {tipoId === tipo.id && <Check className={`h-4 w-4 shrink-0 mt-0.5 ${tipo.colorText}`} />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 1: Dados Gerais ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Dados Gerais</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Campos marcados com ★ foram preenchidos automaticamente</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1 block">
                      <Calendar className="h-3.5 w-3.5 text-orange-500" />Data de Emissão ★
                    </label>
                    <Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1 block">
                      <Timer className="h-3.5 w-3.5 text-orange-500" />Hora de Início ★
                    </label>
                    <Input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Obra / Unidade</label>
                  <Select value={obraId} onValueChange={v => { setObraId(v); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                    <SelectContent>
                      {(obrasQ.data ?? []).map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {obraSstQ.isFetching && <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Buscando TST e encarregado...</p>}
                  {obraSstQ.data?.tstNome && (
                    <p className="text-xs text-blue-700 mt-1 flex items-center gap-1"><Zap className="h-3 w-3" />TST: <strong>{obraSstQ.data.tstNome}</strong> — carregado automaticamente como aprovador</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                    Atividade / Serviço <span className="text-red-500">*</span>
                    <span className="text-xs font-normal text-orange-600 ml-1">★ carregada do tipo selecionado</span>
                  </label>
                  <Input value={atividade} onChange={e => setAtividade(e.target.value)}
                    placeholder="Descrição da atividade a ser executada" />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Local do Serviço</label>
                  <Input value={localServico} onChange={e => setLocalServico(e.target.value)}
                    placeholder="Ex.: Bloco A, 2º pavimento, eixo 3-4" />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <User className="h-4 w-4 text-orange-600" />Equipe de Trabalho
                      {equipeSelecao.length > 0 && (
                        <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                          {equipeSelecao.length} selecionado{equipeSelecao.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    {equipeSelecao.length > 0 && (
                      <button type="button" onClick={() => setEquipeSelecao([])}
                        className="text-xs text-slate-400 hover:text-red-500 underline">limpar seleção</button>
                    )}
                  </label>

                  {/* Com obra: grid visual de funcionários */}
                  {obraId && Number(obraId) > 0 ? (
                    <div className="space-y-3">
                      {(obraFuncsQ.isLoading || obraTercQ.isLoading) ? (
                        <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando efetivo da obra…
                        </div>
                      ) : (() => {
                        // NRs exigidas pela atividade selecionada
                        const requiredNrs: string[] = tipoSelecionado
                          ? tipoSelecionado.nr.split(/\s*\/\s*/).map((s: string) => s.trim()).filter(Boolean)
                          : [];

                        type WorkerCard = EquipeMembro & {
                          nrs: Array<{norma: string; vencida: boolean}>;
                          isCipa: boolean;
                          emAviso: boolean;
                        };

                        const proprios: WorkerCard[] = (obraFuncsQ.data as any[] ?? []).map((emp: any) => ({
                          nome: emp.employee?.nomeCompleto || emp.nomeCompleto || "",
                          fotoUrl: emp.employee?.fotoUrl || emp.fotoUrl || null,
                          tipo: "proprio" as const,
                          funcao: emp.employee?.cargo || emp.employee?.funcao || emp.cargo || emp.funcao || "",
                          nrs: emp.nrs ?? [],
                          isCipa: !!emp.cipaAtivo,
                          emAviso: emp.employee?.status === "Aviso" || emp.employee?.status === "AvisoDispensado",
                        })).filter((m: WorkerCard) => m.nome);

                        const terceiros: WorkerCard[] = (obraTercQ.data as any[] ?? []).map((t: any) => ({
                          nome: t.nome || "",
                          fotoUrl: null,
                          tipo: "terceiro" as const,
                          funcao: t.funcao || "",
                          nrs: [],
                          isCipa: false,
                          emAviso: false,
                        })).filter((m: WorkerCard) => m.nome);

                        const todos: WorkerCard[] = [...proprios, ...terceiros];

                        if (todos.length === 0) return (
                          <p className="text-xs text-slate-400 italic py-2">Nenhum funcionário alocado nesta obra. Use o campo manual abaixo.</p>
                        );

                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {todos.map((m, i) => {
                              const selecionado = equipeSelecao.some(s => s.nome === m.nome);

                              // Calcular status de cada NR exigida (só para próprios)
                              const nrChecks = m.tipo === "proprio" ? requiredNrs.map(norma => {
                                const found = m.nrs.find((n: any) => n.norma === norma);
                                if (!found)         return { norma, status: "ausente" as const };
                                if (found.vencida)  return { norma, status: "vencida" as const };
                                return               { norma, status: "ok" as const };
                              }) : [];

                              // NRs que o trabalhador tem (para exibir mesmo que não exigidas)
                              const nrsExtras = m.nrs.filter((n: any) =>
                                !requiredNrs.includes(n.norma)
                              );

                              const isBlocked = nrChecks.some(c => c.status !== "ok");
                              const bloqMsg = isBlocked
                                ? nrChecks.filter(c => c.status !== "ok")
                                    .map(c => c.status === "vencida"
                                      ? `${c.norma} vencida`
                                      : `${c.norma} ausente`)
                                    .join(" • ")
                                : "";

                              return (
                                <div key={`${m.tipo}-${i}`} title={isBlocked ? bloqMsg : undefined}>
                                  <button type="button"
                                    disabled={isBlocked}
                                    onClick={() => {
                                      if (isBlocked) return;
                                      if (selecionado) {
                                        setEquipeSelecao(prev => prev.filter(s => s.nome !== m.nome));
                                      } else {
                                        const { nrs: _n, isCipa: _c, emAviso: _a, ...toStore } = m as any;
                                        setEquipeSelecao(prev => [...prev, toStore]);
                                      }
                                    }}
                                    className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all
                                      ${isBlocked
                                        ? "bg-red-50 border-red-200 cursor-not-allowed opacity-80"
                                        : selecionado
                                          ? "bg-orange-50 border-orange-400 shadow-sm"
                                          : "bg-white border-slate-200 hover:border-orange-200 hover:bg-orange-50/40"}`}>
                                    {/* Avatar */}
                                    <div className="relative shrink-0 mt-0.5">
                                      <div className={isBlocked ? "grayscale opacity-60" : ""}>
                                        <AvatarCircle nome={m.nome} fotoUrl={m.fotoUrl} size="md" />
                                      </div>
                                      {isBlocked && (
                                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                                          <Ban className="h-2.5 w-2.5 text-white" />
                                        </span>
                                      )}
                                      {!isBlocked && selecionado && (
                                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-orange-600 rounded-full flex items-center justify-center">
                                          <Check className="h-2.5 w-2.5 text-white" />
                                        </span>
                                      )}
                                    </div>

                                    {/* Conteúdo */}
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-semibold leading-tight truncate
                                        ${isBlocked ? "text-red-700" : selecionado ? "text-orange-900" : "text-slate-800"}`}>
                                        {m.nome}
                                      </p>
                                      {m.funcao && <p className="text-[11px] text-slate-500 truncate mt-0.5">{m.funcao}</p>}

                                      {/* Tags */}
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {/* Tipo (FC Eng / Terceiro) */}
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
                                          ${m.tipo === "terceiro" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                                          {m.tipo === "terceiro" ? "Terceiro" : "FC Eng."}
                                        </span>

                                        {/* NRs exigidas pela atividade */}
                                        {nrChecks.map(c => (
                                          <span key={c.norma} className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5
                                            ${c.status === "ok"
                                              ? "bg-emerald-100 text-emerald-700"
                                              : c.status === "vencida"
                                                ? "bg-amber-100 text-amber-700"
                                                : "bg-red-100 text-red-700"}`}>
                                            {c.norma}
                                            {c.status === "ok"      && <Check   className="h-2.5 w-2.5" />}
                                            {c.status === "vencida" && <span>⚠</span>}
                                            {c.status === "ausente" && <XIcon   className="h-2.5 w-2.5" />}
                                          </span>
                                        ))}

                                        {/* NRs extras que o trabalhador possui (além das exigidas) */}
                                        {nrsExtras.map((n: any) => (
                                          <span key={n.norma} className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5
                                            ${n.vencida ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                                            {n.norma}{n.vencida ? " ⚠" : ""}
                                          </span>
                                        ))}

                                        {/* CIPA */}
                                        {m.isCipa && (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 text-pink-700 flex items-center gap-0.5">
                                            <Shield className="h-2.5 w-2.5" />CIPA
                                          </span>
                                        )}

                                        {/* Aviso Prévio */}
                                        {m.emAviso && (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-0.5">
                                            <AlertTriangle className="h-2.5 w-2.5" />Aviso
                                          </span>
                                        )}
                                      </div>

                                      {/* Mensagem de bloqueio */}
                                      {isBlocked && (
                                        <p className="text-[10px] text-red-600 mt-1 font-medium leading-tight">
                                          ⛔ {bloqMsg} — treinamento necessário
                                        </p>
                                      )}
                                    </div>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Selecionados (mini-lista de confirmação) */}
                      {equipeSelecao.length > 0 && (
                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
                          <p className="text-xs font-semibold text-orange-800 mb-2">✓ Equipe selecionada ({equipeSelecao.length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {equipeSelecao.map((m, i) => (
                              <span key={i} className="flex items-center gap-1 text-xs bg-white border border-orange-200 text-orange-800 px-2 py-1 rounded-full font-medium">
                                <AvatarCircle nome={m.nome} fotoUrl={m.fotoUrl} size="sm" />
                                {m.nome}
                                <button type="button" onClick={() => setEquipeSelecao(prev => prev.filter((_, j) => j !== i))}
                                  className="text-orange-300 hover:text-red-500 ml-0.5">
                                  <XIcon className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Sem obra: exibe aviso */
                    <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                      <Info className="h-4 w-4 shrink-0" />
                      Selecione uma obra acima para carregar o efetivo com fotos.
                    </div>
                  )}

                  {/* Adicionar manualmente (sempre disponível) */}
                  <div className="flex gap-2 mt-2">
                    <Input value={equipeManual} placeholder="Adicionar trabalhador manualmente..."
                      className="text-sm"
                      onChange={e => setEquipeManual(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && equipeManual.trim()) {
                          e.preventDefault();
                          setEquipeSelecao(prev => [...prev, { nome: equipeManual.trim(), tipo: "manual" }]);
                          setEquipeManual("");
                        }
                      }} />
                    <Button type="button" variant="outline" size="sm"
                      disabled={!equipeManual.trim()}
                      onClick={() => {
                        if (!equipeManual.trim()) return;
                        setEquipeSelecao(prev => [...prev, { nome: equipeManual.trim(), tipo: "manual" }]);
                        setEquipeManual("");
                      }}
                      className="shrink-0 border-orange-300 text-orange-700 hover:bg-orange-50">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Ou pressione Enter para adicionar</p>
                </div>
              </div>
            )}

            {/* ── Step 2: Checklist ── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Checklist de Segurança</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{tipoSelecionado?.label} — {tipoSelecionado?.nr}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-2xl font-bold text-orange-600">{checklist.filter(c => c.resposta !== "").length}</span>
                    <span className="text-sm text-slate-400">/{checklist.length}</span>
                    <p className="text-[10px] text-slate-400">respondidos</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all"
                    style={{ width: `${checklist.length ? (checklist.filter(c => c.resposta !== "").length / checklist.length) * 100 : 0}%` }} />
                </div>

                {naoConformes.length > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-800 font-medium">
                      {naoConformes.length} não conformidade{naoConformes.length > 1 ? "s" : ""}. Aplique medidas corretivas antes de iniciar.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {checklist.map((item, idx) => (
                    <div key={idx} className={`rounded-2xl border-2 p-4 transition-all ${
                      item.resposta === "sim" ? "bg-green-50 border-green-200"
                      : item.resposta === "nao" ? "bg-red-50 border-red-200"
                      : item.resposta === "na"  ? "bg-slate-50 border-slate-200"
                      : "bg-white border-slate-200"
                    }`}>
                      <p className="text-sm text-slate-700 mb-3 leading-relaxed">
                        <span className="text-slate-400 mr-2 font-bold">{idx + 1}.</span>{item.pergunta}
                      </p>
                      <div className="flex gap-2">
                        {(["sim","nao","na"] as ChecklistResposta[]).map(resp => (
                          <button key={resp} type="button" onClick={() => setChecklistResposta(idx, resp)}
                            className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border-2 transition-all flex-1 justify-center
                              ${item.resposta === resp
                                ? resp === "sim" ? "bg-green-600 text-white border-green-600"
                                : resp === "nao" ? "bg-red-600 text-white border-red-600"
                                : "bg-slate-500 text-white border-slate-500"
                                : resp === "sim" ? "bg-white text-green-700 border-green-300 hover:bg-green-50"
                                : resp === "nao" ? "bg-white text-red-700 border-red-300 hover:bg-red-50"
                                : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"
                              }`}>
                            {resp === "sim" ? <><CircleCheck className="h-4 w-4" />Sim</>
                             : resp === "nao" ? <><CircleX className="h-4 w-4" />Não</>
                             : <><Minus className="h-4 w-4" />N/A</>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 3: Riscos ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Matriz de Riscos</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Pré-carregados para <strong>{tipoSelecionado?.label}</strong>. Revise e adicione mais.</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] shrink-0 flex-wrap justify-end">
                    {[{ l:"Baixo",d:"bg-green-500"},{l:"Médio",d:"bg-yellow-500"},{l:"Alto",d:"bg-orange-500"},{l:"Crítico",d:"bg-red-600"}].map(n => (
                      <span key={n.l} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${n.d}`}/>{n.l}</span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {riscos.map((r, i) => (
                    <RiscoRow key={i} risco={r} index={i}
                      onChange={upd => setRiscos(riscos.map((x, j) => j === i ? upd : x))}
                      onRemove={() => setRiscos(riscos.filter((_, j) => j !== i))} />
                  ))}
                </div>

                <Button type="button" variant="outline"
                  className="w-full border-dashed border-orange-300 text-orange-700 hover:bg-orange-50 py-3 rounded-2xl"
                  onClick={() => setRiscos([...riscos, novoRisco()])}>
                  <Plus className="h-4 w-4 mr-2" />Adicionar Risco
                </Button>
              </div>
            )}

            {/* ── Step 4: EPIs + Aprovação ── */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">EPIs & Aprovação</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Selecione os EPIs necessários e colha a assinatura do responsável SST</p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2 block">
                    <HardHat className="h-4 w-4 text-orange-600" />EPIs Necessários
                    <span className="text-xs font-normal text-slate-400">({epis.length} selecionados)</span>
                    {tipoSelecionado && <span className="text-xs font-normal text-orange-600">★ pré-selecionados para {tipoSelecionado.label}</span>}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {todosEpis.map(epi => (
                      <button key={epi} type="button"
                        onClick={() => setEpis(prev => prev.includes(epi) ? prev.filter(e => e !== epi) : [...prev, epi])}
                        className={`text-sm px-4 py-2 rounded-xl border-2 font-medium transition-all
                          ${epis.includes(epi) ? "bg-orange-600 text-white border-orange-600 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:border-orange-300 hover:bg-orange-50"}`}>
                        {epis.includes(epi) && <Check className="h-3.5 w-3.5 inline mr-1.5" />}{epi}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Observações Adicionais</label>
                  <Textarea value={observacoes} rows={3} onChange={e => setObservacoes(e.target.value)}
                    placeholder="Condições especiais, restrições, instruções adicionais..." className="resize-none" />
                </div>

                <div className="border-2 border-orange-200 rounded-2xl p-5 bg-orange-50 space-y-4">
                  <h3 className="text-sm font-bold text-orange-900 flex items-center gap-2">
                    <Shield className="h-4 w-4" />Aprovação — Técnico / Engenheiro de SST
                  </h3>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1 block">
                      Nome do Aprovador <span className="text-red-500">*</span>
                      {obraSstQ.data?.tstNome && <span className="text-xs text-blue-600 font-normal ml-1 flex items-center gap-1"><Zap className="h-3 w-3" />TST da obra</span>}
                    </label>
                    <Input value={aprovNome} onChange={e => setAprovNome(e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">Assinatura Digital</label>
                    {aprovAss ? (
                      <div className="relative border-2 border-orange-200 rounded-xl overflow-hidden bg-white p-2">
                        <img src={aprovAss} alt="Assinatura" className="h-16 object-contain mx-auto block" />
                        <button type="button" onClick={() => setAprovAss(null)}
                          className="absolute top-2 right-2 bg-white/80 rounded-full p-1 text-slate-400 hover:text-red-500">
                          <XIcon className="h-4 w-4" />
                        </button>
                        <p className="text-center text-xs text-green-600 mt-1 font-medium">✓ Assinatura registrada</p>
                      </div>
                    ) : (
                      <Button type="button" variant="outline"
                        className="w-full border-dashed border-orange-300 text-orange-700 hover:bg-orange-100 py-8 rounded-xl"
                        onClick={() => setPadOpen(true)}>
                        <PenLine className="h-5 w-5 mr-2" />Coletar Assinatura
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="border-t bg-white px-5 py-4 flex items-center justify-between shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : (onClose(), resetForm())}
          className="border-slate-200">
          <ChevronLeft className="h-4 w-4 mr-1" />{step > 0 ? "Voltar" : "Cancelar"}
        </Button>

        <div className="flex items-center gap-3">
          {step === 2 && (
            <span className="text-xs text-slate-500 hidden sm:block">
              {checklist.filter(c => c.resposta !== "").length}/{checklist.length} respondidos
            </span>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()} className="bg-orange-600 hover:bg-orange-700 px-6">
              Próximo<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canNext() || createM.isPending}
              className="bg-orange-600 hover:bg-orange-700 px-6 min-w-[140px]">
              {createM.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
              ) : (
                <><Check className="h-4 w-4 mr-2" />Criar APR</>
              )}
            </Button>
          )}
        </div>
      </div>

      <AssinaturaPad open={padOpen} onClose={() => setPadOpen(false)}
        onSave={url => setAprovAss(url)} title="Assinatura do Aprovador SST" />
    </div>
  );
}

// ── Detalhe Full-Screen ───────────────────────────────────────────────────
function AprDetalheFullscreen({
  open, onClose, aprId, companyId, onRefetch,
}: { open: boolean; onClose: () => void; aprId: number | null; companyId: number; onRefetch: () => void; }) {
  const utils                       = trpc.useUtils();
  const { confirm, ConfirmDialog }  = useConfirm();
  const { selectedCompany }         = useCompany();
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

  const detQ      = trpc.aprAnalises.getById.useQuery({ id: aprId!, companyId }, { enabled: open && aprId !== null });
  const aprovarM  = trpc.aprAnalises.aprovar.useMutation({ onSuccess: () => { detQ.refetch(); onRefetch(); toast.success("APR aprovada!"); } });
  const concluirM = trpc.aprAnalises.concluir.useMutation({ onSuccess: () => { detQ.refetch(); onRefetch(); toast.success("APR concluída!"); } });
  const cancelarM = trpc.aprAnalises.cancelar.useMutation({ onSuccess: () => { detQ.refetch(); onRefetch(); toast.success("APR cancelada."); } });
  const excluirM  = trpc.aprAnalises.excluir.useMutation({ onSuccess: () => { onRefetch(); onClose(); toast.success("APR excluída."); } });
  const updateM   = trpc.aprAnalises.update.useMutation({
    onSuccess: () => detQ.refetch(),
    onError: (e) => toast.error(e?.message ?? "Erro ao salvar."),
  });

  const [sigMembroIdx, setSigMembroIdx] = useState<number | null>(null);

  const apr = detQ.data;

  async function handleAprovar() {
    // Regra: todos os membros da equipe devem ter assinado
    const semAss = membrosEquipe.filter(m => !m.ass);
    if (semAss.length > 0) {
      toast.error(`Faltam assinaturas: ${semAss.map(m => m.nome).join(", ")}`);
      return;
    }
    if (!await confirm({ title: "Aprovar APR?", description: "Confirmar aprovação desta APR. Todos os membros assinaram.", tone: "info", confirmText: "Aprovar" })) return;
    aprovarM.mutate({ id: apr!.id, companyId });
  }
  async function handleConcluir() {
    if (!await confirm({ title: "Concluir APR?", description: "Marcar esta APR como concluída.", confirmText: "Concluir" })) return;
    concluirM.mutate({ id: apr!.id, companyId });
  }
  async function handleCancelar() {
    if (!await confirm({ title: "Cancelar APR?", description: "Esta ação não pode ser desfeita.", tone: "destructive", confirmText: "Cancelar APR" })) return;
    cancelarM.mutate({ id: apr!.id, companyId });
  }
  async function handleExcluir() {
    if (!await confirm({ title: "Excluir APR?", description: "A APR será removida permanentemente.", tone: "destructive", confirmText: "Excluir" })) return;
    excluirM.mutate({ id: apr!.id, companyId });
  }

  if (!open) return null;

  // Membros da equipe com slot de assinatura
  const membrosEquipe: Array<{ nome: string; ass: string | null; assinadoEm: string | null }> =
    apr?.assinaturasEquipe?.length ? apr.assinaturasEquipe
    : (apr?.equipe ?? []).map((m: any) => ({ nome: typeof m === "string" ? m : (m?.nome ?? ""), ass: null, assinadoEm: null })).filter((m: any) => m.nome);

  const tipoAPR         = APR_TIPOS.find(t => t.id === apr?.tipoAtividade);
  const riscosCriticos  = (apr?.riscos ?? []).filter((r: any) => (r.probabilidade ?? 0) * (r.gravidade ?? 0) > 16);
  const checklistParsed: ChecklistItem[] = (() => { try { return JSON.parse(apr?.checklistJson ?? "[]"); } catch { return []; } })();
  const naoConformDet   = checklistParsed.filter(c => c.resposta === "nao");

  const fcLogoUrl   = selectedCompany?.logoUrl || (import.meta as any).env?.VITE_APP_LOGO || null;
  const companyName = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "";
  const hasObraLogos = !!(apr?.obraClienteLogoUrl || apr?.obraGerenciadoraLogoUrl || apr?.obraGerenciadoraNome);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
      {/* Header — padrão FC azul (igual à PT) */}
      <div className="bg-blue-800 text-white shrink-0 shadow-lg">
        {/* Linha 1: Logo FC + número/status + botões */}
        <div className="flex items-center gap-4 px-5 py-3.5">
          <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/20 overflow-hidden shrink-0 flex items-center justify-center">
            {fcLogoUrl
              ? <img src={fcLogoUrl} alt="Logo FC" className="w-full h-full object-contain p-1" />
              : <ShieldAlert className="h-7 w-7 text-white/80" />}
          </div>
          <div className="flex-1 min-w-0">
            {detQ.isLoading ? (
              <div className="h-5 w-48 bg-white/20 rounded animate-pulse" />
            ) : (
              <>
                <p className="text-[10px] font-bold text-blue-300 uppercase tracking-[0.2em]">Análise Preliminar de Risco</p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="text-xl font-black tracking-tight leading-none">{apr?.numero}</span>
                  <StatusBadge status={apr?.status ?? "rascunho"} />
                  {tipoAPR && (
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium border border-white/20">
                      {tipoAPR.emoji} {tipoAPR.label}
                    </span>
                  )}
                </div>
                {companyName && <p className="text-xs text-blue-300 mt-0.5 font-medium truncate">{companyName}</p>}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={printLoading}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20">
              {printLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              <span className="ml-1.5 hidden sm:inline">{printLoading ? "Gerando..." : "PDF"}</span>
            </Button>
            <button onClick={onClose} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Linha 2: Logos cliente + gerenciadora */}
        {hasObraLogos && (
          <div className="flex flex-wrap items-center gap-3 px-5 pb-3 border-t border-white/10 pt-3">
            {(apr?.obraClienteLogoUrl || apr?.obraClienteNome) && (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-2 border border-white/15">
                {apr?.obraClienteLogoUrl && (
                  <div className="w-10 h-8 rounded overflow-hidden shrink-0 bg-white flex items-center justify-center">
                    <img src={apr.obraClienteLogoUrl} alt="Cliente" className="w-full h-full object-contain p-0.5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[9px] text-blue-300 font-bold uppercase tracking-wider leading-none">Cliente</p>
                  {apr?.obraClienteNome && <p className="text-[11px] text-white font-semibold truncate max-w-[120px] leading-tight mt-0.5">{apr.obraClienteNome}</p>}
                </div>
              </div>
            )}
            {(apr?.obraGerenciadoraLogoUrl || apr?.obraGerenciadoraNome) && (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-2 border border-white/15">
                {apr?.obraGerenciadoraLogoUrl && (
                  <div className="w-10 h-8 rounded overflow-hidden shrink-0 bg-white flex items-center justify-center">
                    <img src={apr.obraGerenciadoraLogoUrl} alt="Gerenciadora" className="w-full h-full object-contain p-0.5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[9px] text-blue-300 font-bold uppercase tracking-wider leading-none">Gerenciadora</p>
                  {apr?.obraGerenciadoraNome && <p className="text-[11px] text-white font-semibold truncate max-w-[120px] leading-tight mt-0.5">{apr.obraGerenciadoraNome}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {detQ.isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        )}

        {apr && (
          <div className="max-w-3xl mx-auto px-5 py-6 space-y-6">

            {/* Faixa de alerta */}
            {riscosCriticos.length > 0 && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <p className="text-sm text-red-800 font-semibold">
                  ⚠️ {riscosCriticos.length} risco{riscosCriticos.length > 1 ? "s" : ""} crítico{riscosCriticos.length > 1 ? "s" : ""} — medidas de controle obrigatórias antes de iniciar.
                </p>
              </div>
            )}

            {/* Identificação */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Identificação</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-slate-400 block text-xs mb-0.5 flex items-center gap-1"><Calendar className="h-3 w-3" />Data</span>
                  <span className="font-semibold">{apr.dataEmissao || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs mb-0.5 flex items-center gap-1"><Timer className="h-3 w-3" />Hora Início</span>
                  <span className="font-semibold">{(apr as any).horaInicio || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs mb-0.5 flex items-center gap-1"><User className="h-3 w-3" />Elaborado por</span>
                  <span className="font-semibold">{apr.responsavelNome ?? apr.criadoPorNome ?? "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs mb-0.5 flex items-center gap-1"><MapPin className="h-3 w-3" />Obra</span>
                  <span className="font-semibold">{apr.obraNome || "—"}</span>
                </div>
                {apr.localServico && (
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-xs mb-0.5 flex items-center gap-1"><Building2 className="h-3 w-3" />Local do Serviço</span>
                    <span className="font-semibold">{apr.localServico}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Equipe */}
            {(apr.equipe ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <User className="h-4 w-4 text-orange-600" />Equipe de Trabalho
                  <span className="text-xs font-normal text-slate-400">{apr.equipe.length} membro{apr.equipe.length !== 1 ? "s" : ""}</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {apr.equipe.map((m: any, i: number) => {
                    const nome  = getMembroNome(m);
                    const foto  = getMembroFoto(m);
                    const tipo  = getMembroTipo(m);
                    return (
                      <div key={i} className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                        <AvatarCircle nome={nome} fotoUrl={foto} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{nome}</p>
                          {tipo && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-block mt-0.5
                              ${tipo === "terceiro" ? "bg-purple-100 text-purple-700" : tipo === "manual" ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-700"}`}>
                              {tipo === "terceiro" ? "Terceiro" : tipo === "manual" ? "Manual" : "FC Eng."}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Checklist */}
            {checklistParsed.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-orange-600" />Checklist de Segurança
                  {naoConformDet.length > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold ml-1">
                      {naoConformDet.length} não conforme{naoConformDet.length > 1 ? "s" : ""}
                    </span>
                  )}
                </h3>
                <div className="space-y-1.5">
                  {checklistParsed.map((item: ChecklistItem, i: number) => (
                    <div key={i} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm
                      ${item.resposta === "sim" ? "bg-green-50 border-green-200"
                      : item.resposta === "nao" ? "bg-red-50 border-red-200"
                      : "bg-slate-50 border-slate-200"}`}>
                      <span className="shrink-0 mt-0.5">
                        {item.resposta === "sim" ? <CircleCheck className="h-4 w-4 text-green-600" />
                        : item.resposta === "nao" ? <CircleX className="h-4 w-4 text-red-600" />
                        : <Minus className="h-4 w-4 text-slate-400" />}
                      </span>
                      <span className={`flex-1 leading-snug ${item.resposta === "nao" ? "text-red-800 font-medium" : "text-slate-700"}`}>
                        <span className="text-slate-400 mr-1">{i + 1}.</span>{item.pergunta}
                      </span>
                      <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full
                        ${item.resposta === "sim" ? "bg-green-100 text-green-700"
                        : item.resposta === "nao" ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-500"}`}>
                        {item.resposta === "sim" ? "SIM" : item.resposta === "nao" ? "NÃO" : "N/A"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Matriz de Riscos */}
            {(apr.riscos ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-orange-600" />Matriz de Riscos
                  <span className="text-xs font-normal text-slate-400">{apr.riscos.length} risco{apr.riscos.length !== 1 ? "s" : ""}</span>
                </h3>
                <div className="space-y-2">
                  {(apr.riscos ?? []).map((r: any, i: number) => {
                    const nivel = (r.probabilidade ?? 0) * (r.gravidade ?? 0);
                    const cfg = nivel > 0 ? nivelConfig(nivel) : null;
                    return (
                      <div key={i} className={`border-2 rounded-2xl p-4 ${cfg ? `${cfg.bg} ${cfg.border}` : "bg-white border-slate-200"}`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <span className="text-xs font-bold text-slate-500 uppercase">#{i+1} — {r.etapaAtividade || "—"}</span>
                            <p className="text-sm font-bold mt-0.5">{r.perigo} <span className="text-slate-400 font-normal">→</span> {r.risco}</p>
                          </div>
                          {cfg && (
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                              P{r.probabilidade}×G{r.gravidade}={nivel} {cfg.label}
                            </span>
                          )}
                        </div>
                        {r.medidasControle && (
                          <p className="text-sm text-slate-700"><span className="font-semibold">Controle:</span> {r.medidasControle}</p>
                        )}
                        {r.responsavelNome && (
                          <p className="text-xs text-slate-500 mt-1"><span className="font-semibold">Resp.:</span> {r.responsavelNome}{r.prazo ? ` | Prazo: ${r.prazo}` : ""}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* EPIs */}
            {(apr.epis ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <HardHat className="h-4 w-4 text-orange-600" />EPIs Necessários
                </h3>
                <div className="flex flex-wrap gap-2">
                  {apr.epis.map((e: string, i: number) => (
                    <span key={i} className="flex items-center gap-1.5 text-sm bg-orange-50 border border-orange-200 text-orange-800 rounded-xl px-3 py-1.5 font-medium">
                      <Check className="h-3.5 w-3.5" />{e}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Observações */}
            {apr.observacoes && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Observações</h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{apr.observacoes}</p>
              </div>
            )}

            {/* Assinaturas da Equipe */}
            {membrosEquipe.length > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />Assinaturas da Equipe
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {membrosEquipe.map((m, idx) => (
                    <div key={idx} className="bg-white border border-blue-100 rounded-xl p-3 flex flex-col items-center gap-1.5">
                      <p className="text-xs font-semibold text-slate-700 text-center line-clamp-2">{m.nome}</p>
                      {m.ass ? (
                        <>
                          <img src={m.ass} alt="Assinatura" className="h-12 w-full object-contain border border-slate-100 rounded-lg bg-white" />
                          {m.assinadoEm && (
                            <p className="text-[10px] text-slate-400">{new Date(m.assinadoEm).toLocaleString("pt-BR")}</p>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-blue-600 px-2"
                            onClick={() => setSigMembroIdx(idx)}>
                            Reassinar
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 w-full mt-1"
                          onClick={() => setSigMembroIdx(idx)}>
                          Assinar
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Aprovação */}
            {(apr.aprovadoPorNome || apr.aprovadoPorAss) && (
              <div className="p-4 bg-green-50 border-2 border-green-200 rounded-2xl">
                <h3 className="text-sm font-bold text-green-800 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />Aprovado por
                </h3>
                <p className="text-sm font-bold">{apr.aprovadoPorNome}</p>
                {apr.aprovadoPorAss && <img src={apr.aprovadoPorAss} alt="Assinatura" className="h-14 object-contain mt-2 border border-green-200 rounded-lg bg-white px-2" />}
                {apr.aprovadoEm && <p className="text-xs text-green-600 mt-1">{new Date(apr.aprovadoEm).toLocaleString("pt-BR")}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t bg-white px-5 py-4 flex flex-wrap items-center gap-3 shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        {/* Imprimir — sempre visível */}
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={printLoading} className="mr-auto">
          {printLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Printer className="h-4 w-4 mr-1" />}
          {printLoading ? "Gerando..." : "Imprimir / PDF"}
        </Button>
        {apr?.status === "em_analise" && (
          <>
            <Button variant="outline" size="sm" onClick={handleCancelar}
              className="text-red-600 border-red-200 hover:bg-red-50">
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
        {(apr?.status === "cancelada" || apr?.status === "concluida") && (
          <Button variant="outline" size="sm" onClick={handleExcluir}
            className="text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="h-4 w-4 mr-1" />Excluir
          </Button>
        )}
      </div>

      {ConfirmDialog}

      {/* Modal de assinatura para membro da equipe */}
      <AssinaturaPad
        open={sigMembroIdx !== null}
        onClose={() => setSigMembroIdx(null)}
        title={sigMembroIdx !== null ? `Assinatura — ${membrosEquipe[sigMembroIdx]?.nome ?? ""}` : "Assinatura"}
        onSave={(dataUrl) => {
          if (sigMembroIdx === null || !apr) return;
          const updated = membrosEquipe.map((m, i) =>
            i === sigMembroIdx ? { ...m, ass: dataUrl, assinadoEm: new Date().toISOString() } : m
          );
          updateM.mutate(
            { id: apr.id, companyId, data: { assinaturasEquipeJson: JSON.stringify(updated) } },
            { onSuccess: () => { setSigMembroIdx(null); toast.success("Assinatura registrada!"); } }
          );
        }}
      />
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────
export default function AprAnalise() {
  const { selectedCompany } = useCompany();
  const { user }            = useAuth();
  const companyId           = selectedCompany?.id ?? 0;
  const employeeId          = (user as any)?.employeeId ?? 0;
  const userName            = (user as any)?.name ?? (user as any)?.username ?? "";

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
    { key: null,         label: "Total",      value: stats.total,      color: "from-orange-500 to-orange-600", icon: ShieldAlert },
    { key: "em_analise", label: "Em Análise", value: stats.em_analise, color: "from-amber-500 to-amber-600",   icon: Clock },
    { key: "aprovada",   label: "Aprovadas",  value: stats.aprovada,   color: "from-green-500 to-green-600",   icon: CheckCircle2 },
    { key: "concluida",  label: "Concluídas", value: stats.concluida,  color: "from-blue-500 to-blue-600",     icon: Check },
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
                  <div className="text-3xl font-black">{card.value}</div>
                  <div className="text-xs font-medium opacity-80">{card.label}</div>
                </div>
                {active && <div className="absolute top-2 right-2 bg-white/30 rounded-full p-0.5"><Check className="h-3 w-3 text-white" /></div>}
              </button>
            );
          })}
        </div>

        {filtroStatus && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Filtrando:</span>
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
            <div className="w-20 h-20 rounded-2xl bg-orange-50 flex items-center justify-center mb-4">
              <ShieldAlert className="h-10 w-10 text-orange-200" />
            </div>
            <h3 className="text-lg font-semibold text-slate-600">Nenhuma APR encontrada</h3>
            <p className="text-slate-400 text-sm mt-1 mb-5">Crie uma APR para identificar e controlar riscos da atividade.</p>
            <Button onClick={() => setNovaOpen(true)} className="bg-orange-600 hover:bg-orange-700">
              <Plus className="h-4 w-4 mr-1" />Nova APR
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {(listQ.data ?? []).map((apr: any) => {
            const tipoApr = APR_TIPOS.find(t => t.id === apr.tipoAtividade);
            return (
              <div key={apr.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:-translate-y-0.5"
                onClick={() => abrirDetalhe(apr.id)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {tipoApr && <span className="text-lg shrink-0">{tipoApr.emoji}</span>}
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-orange-600 tracking-wide block">{apr.numero}</span>
                      <h3 className="font-semibold text-slate-800 text-sm line-clamp-1">{apr.atividade || "Sem atividade"}</h3>
                    </div>
                  </div>
                  <StatusBadge status={apr.status} />
                </div>

                {tipoApr && (
                  <div className={`text-[10px] font-bold px-2 py-0.5 rounded inline-block mb-2 ${tipoApr.colorBg} ${tipoApr.colorText}`}>
                    {tipoApr.nr}
                  </div>
                )}

                <div className="space-y-1 text-xs text-slate-500">
                  {apr.obraNome && <div className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{apr.obraNome}</span></div>}
                  {apr.localServico && <div className="flex items-center gap-1"><Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{apr.localServico}</span></div>}
                  <div className="flex items-center gap-1"><User className="h-3 w-3 shrink-0" /><span className="truncate">{apr.responsavelNome ?? apr.criadoPorNome ?? "—"}</span></div>
                  {apr.dataEmissao && <div className="flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0" />{apr.dataEmissao}</div>}
                </div>

                {(apr.equipe ?? []).length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="flex -space-x-1.5">
                      {apr.equipe.slice(0, 4).map((m: any, i: number) => (
                        <AvatarCircle key={i} nome={getMembroNome(m)} fotoUrl={getMembroFoto(m)} size="sm" />
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-400">{apr.equipe.length} membro{apr.equipe.length !== 1 ? "s" : ""}</span>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                  <span>{apr.totalRiscos ?? 0} risco{(apr.totalRiscos ?? 0) !== 1 ? "s" : ""} mapeado{(apr.totalRiscos ?? 0) !== 1 ? "s" : ""}</span>
                  <span className="group-hover:text-orange-600 transition-colors flex items-center gap-0.5">Ver detalhes <ChevronRight className="h-3 w-3" /></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AprWizardFullscreen
        open={novaOpen} onClose={() => setNovaOpen(false)}
        companyId={companyId} employeeId={employeeId} userName={userName}
        onCreated={refetch}
      />

      <AprDetalheFullscreen
        open={detalheOpen} onClose={() => setDetalheOpen(false)}
        aprId={detalheId} companyId={companyId} onRefetch={refetch}
      />
    </DashboardLayout>
  );
}
