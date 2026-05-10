// Rev. 1597 — Fonte ÚNICA dos rótulos padrão das 8 perguntas CORE do
// questionário do Portal do Cliente. Usada tanto pelo Portal (fallback
// quando não há override) quanto pelo Editor do Questionário (texto
// "padrão" exibido e detecção de reset).
//
// chave/tipo/secao são fixos para preservar o cálculo do NPS e a
// paridade Portal × Planejamento. Apenas o `label` pode ser
// personalizado por empresa via cliente_perguntas_core_overrides.

export type PerguntaCoreChave =
  | "notaGeral"
  | "notaEquipe"
  | "notaGestor"
  | "notaEmpresa"
  | "notaObra"
  | "notaPrazo"
  | "notaQualidade"
  | "notaEscritorio";

export const PERGUNTAS_CORE_CHAVES: PerguntaCoreChave[] = [
  "notaGeral", "notaEquipe", "notaGestor", "notaEmpresa",
  "notaObra", "notaPrazo", "notaQualidade", "notaEscritorio",
];

export const PERGUNTAS_CORE_DEFAULTS: Array<{
  chave: PerguntaCoreChave;
  label: string;
  secao: string;
}> = [
  { chave: "notaGeral",      label: "Nota geral (0 = péssimo · 10 = excelente) ★",                    secao: "Geral" },
  { chave: "notaEquipe",     label: "Equipe FC (técnica e relacionamento)",                            secao: "Equipe FC" },
  { chave: "notaGestor",     label: "Gestor responsável (liderança, decisões, proatividade)",          secao: "Gestor" },
  { chave: "notaEmpresa",    label: "Empresa FC (reputação, transparência, comunicação institucional)", secao: "Empresa" },
  { chave: "notaObra",       label: "Andamento da obra",                                                secao: "Obra / Execução" },
  { chave: "notaPrazo",      label: "Cumprimento de prazos",                                            secao: "Obra / Execução" },
  { chave: "notaQualidade",  label: "Qualidade do serviço entregue",                                    secao: "Obra / Execução" },
  { chave: "notaEscritorio", label: "Atendimento administrativo (suporte, retorno de e-mails, agilidade)", secao: "Escritório Central" },
];

export const PERGUNTAS_CORE_DEFAULT_LABEL: Record<PerguntaCoreChave, string> =
  PERGUNTAS_CORE_DEFAULTS.reduce((acc, p) => { acc[p.chave] = p.label; return acc; }, {} as Record<PerguntaCoreChave, string>);
