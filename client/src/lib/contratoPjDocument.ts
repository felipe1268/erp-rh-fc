/**
 * client/src/lib/contratoPjDocument.ts
 *
 * Rev. 2736 — Monta o HTML assinável (FCSign) de um CONTRATO DE PRESTAÇÃO DE
 * SERVIÇOS PJ a partir do modelo (`pj.modeloContrato`) + dados do contrato
 * (`pj.contratos.getById`). Reusa `buildFcDocument` (cabeçalho institucional
 * FC + slots de assinatura) e replica a substituição de placeholders da
 * página de visualização `ContratoPJView.tsx`.
 *
 * Saída: string HTML pronta pra ser enviada como `documentHtml` ao
 * `signatures.create`. O bloco de assinaturas usa os roles PJ
 * (`contratado` = prestador / `contratante` = FC Engenharia), de modo que o
 * servidor estampe as imagens das assinaturas nos slots corretos.
 *
 * SEGURANÇA: `buildFcDocument` injeta o corpo RAW; portanto TODO valor
 * interpolado é escapado aqui (`esc`) antes de virar HTML. As únicas tags
 * inseridas no corpo são as nossas próprias (`<p>`, `<h2>`, `<strong>`),
 * nunca conteúdo vindo do banco. Sem `on*`/`<script>`/`javascript:` —
 * respeitando o filtro XSS do `signatures.create`.
 */
import { buildFcDocument, type FcDocumentParams } from "./fcDocumentTemplate";
import { calcularPrazoVigencia } from "@shared/contratoPrazo";

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "___/___/______";
  const parts = String(d).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function formatDateExtenso(d: string | null | undefined): string {
  if (!d) return "_______________";
  try {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return d;
  }
}

function parseMoney(val: string | null | undefined): number {
  if (!val) return 0;
  const s = String(val).trim();
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  return parseFloat(s) || 0;
}

function formatMoeda(val: number): string {
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function valorPorExtenso(valor: number): string {
  if (valor === 0) return "zero reais";
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function grupo(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "cem";
    let s = "";
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;
    if (c > 0) s += centenas[c];
    if (d === 1) {
      if (s) s += " e ";
      s += especiais[u];
      return s;
    }
    if (d > 0) {
      if (s) s += " e ";
      s += dezenas[d];
    }
    if (u > 0) {
      if (s) s += " e ";
      s += unidades[u];
    }
    return s;
  }

  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);

  let resultado = "";
  const milhares = Math.floor(inteiro / 1000);
  const resto = inteiro % 1000;

  if (milhares > 0) {
    resultado += grupo(milhares) + " mil";
    if (resto > 0) resultado += " e " + grupo(resto);
  } else {
    resultado += grupo(resto);
  }

  resultado += inteiro === 1 ? " real" : " reais";

  if (centavos > 0) {
    resultado += " e " + grupo(centavos) + (centavos === 1 ? " centavo" : " centavos");
  }

  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

/** Subset de `getById` necessário pra montar o documento. */
export interface ContratoPjForDoc {
  numeroContrato?: string | null;
  cnpjPrestador?: string | null;
  razaoSocialPrestador?: string | null;
  objetoContrato?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  valorMensal?: string | null;
  percentualAdiantamento?: number | null;
  percentualFechamento?: number | null;
  diaAdiantamento?: number | null;
  diaFechamento?: number | null;
  revisao?: string | null;
  employeeName?: string | null;
  employeeCpf?: string | null;
  enderecoPrestador?: string | null;
  cidadePrestador?: string | null;
  estadoPrestador?: string | null;
  companyRazaoSocial?: string | null;
  companyNomeFantasia?: string | null;
  companyCnpj?: string | null;
  companyEndereco?: string | null;
  companyCidade?: string | null;
  companyEstado?: string | null;
  companyLogoUrl?: string | null;
  companyRepresentante?: string | null;
  bancoPrestador?: string | null;
  agenciaPrestador?: string | null;
  contaPrestador?: string | null;
  pixPrestador?: string | null;
}

/** Converte o texto da cláusula de objeto em HTML com parágrafos/alíneas separados.
 *  Normaliza tanto textos novos (com \n por item) quanto antigos (itens separados por ";") */
function formatObjetoHtml(raw: string): string {
  if (!raw) return "<p>engenharia civil</p>";
  const normalized = raw
    .replace(/;\s*([a-z]\))/g, "\n$1")
    .replace(/\n{2,}/g, "\n");
  // Cabeçalhos que a IA insere e devem ser ignorados
  const headingPat = /^(OBJETO\s+DO\s+CONTRATO|CL[ÁA]USULA\s+(PRIMEIRA|1[ªa°\s]*)[-:\s]*(DO\s+OBJETO)?)/i;
  const lines = normalized.split(/\n/).map(l => l.trim()).filter(l => l && !headingPat.test(l));
  if (!lines.length) return "<p>engenharia civil</p>";
  return lines.map(line => {
    const safe = esc(line);
    if (/^[a-z]\)/.test(line)) {
      return `<p style="margin:2px 0 6px 32px;text-align:justify;">${safe}</p>`;
    }
    return `<p style="margin:0 0 8px 0;text-align:justify;">${safe}</p>`;
  }).join("\n");
}

function replacePlaceholders(text: string, c: ContratoPjForDoc, htmlMode = false): string {
  const valorMensal = parseMoney(c.valorMensal);
  const nomeEmpresa = c.companyRazaoSocial || c.companyNomeFantasia || "Empresa";
  const cnpjEmpresa = c.companyCnpj || "_______________";
  const enderecoEmpresa = c.companyEndereco || "_______________";
  const cidadeEmpresa = c.companyCidade || "São José dos Campos";
  const estadoEmpresa = c.companyEstado || "SP";
  const representante = c.companyRepresentante || "_______________";
  const nomePrestador = c.razaoSocialPrestador || c.employeeName || "_______________";
  const dadosBancarios = [
    c.bancoPrestador && `Banco: ${c.bancoPrestador}`,
    c.agenciaPrestador && `Agência: ${c.agenciaPrestador}`,
    c.contaPrestador && `Conta: ${c.contaPrestador}`,
    c.pixPrestador && `PIX: ${c.pixPrestador}`,
  ].filter(Boolean).join(" | ") || "_______________";
  const cnpjPrestador = c.cnpjPrestador || "_______________";
  const enderecoPrestador = c.enderecoPrestador || "_______________";
  const cidadePrestador = c.cidadePrestador || cidadeEmpresa;
  const estadoPrestador = c.estadoPrestador || estadoEmpresa;
  const percAdiantamento = c.percentualAdiantamento || 40;
  const percFechamento = c.percentualFechamento || 60;
  const diaAdiantamento = c.diaAdiantamento || 20;
  const diaFechamento = c.diaFechamento || 5;
  const valorAdiantamento = formatMoeda((valorMensal * percAdiantamento) / 100);
  const valorFechamento = formatMoeda((valorMensal * percFechamento) / 100);
  const dataAssinatura = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return text
    .replace(/\[CONTRATANTE_NOME\]/g, nomeEmpresa)
    .replace(/\[CONTRATANTE_CNPJ\]/g, cnpjEmpresa)
    .replace(/\[CONTRATANTE_ENDERECO\]/g, enderecoEmpresa)
    .replace(/\[CONTRATANTE_CIDADE\]/g, cidadeEmpresa)
    .replace(/\[CONTRATANTE_ESTADO\]/g, estadoEmpresa)
    .replace(/\[CONTRATANTE_REPRESENTANTE\]/g, representante)
    .replace(/\[CONTRATADA_RAZAO_SOCIAL\]/g, nomePrestador)
    .replace(/\[CONTRATADA_CNPJ\]/g, cnpjPrestador)
    .replace(/\[CONTRATADA_ENDERECO\]/g, enderecoPrestador)
    .replace(/\[CONTRATADA_CIDADE\]/g, cidadePrestador)
    .replace(/\[CONTRATADA_ESTADO\]/g, estadoPrestador)
    .replace(/\[OBJETO_CONTRATO\]/g, htmlMode ? formatObjetoHtml(c.objetoContrato || "") : ((c.objetoContrato || "engenharia civil").replace(/;\s*([a-z]\))/g, "\n$1")))
    .replace(/\[VALOR_MENSAL\]/g, formatMoeda(valorMensal))
    .replace(/\[VALOR_EXTENSO\]/g, valorPorExtenso(valorMensal))
    .replace(/\[VALOR_ADIANTAMENTO\]/g, valorAdiantamento)
    .replace(/\[VALOR_FECHAMENTO\]/g, valorFechamento)
    .replace(/\[PERCENTUAL_ADIANTAMENTO\]/g, String(percAdiantamento))
    .replace(/\[PERCENTUAL_FECHAMENTO\]/g, String(percFechamento))
    .replace(/\[DIA_ADIANTAMENTO\]/g, String(diaAdiantamento))
    .replace(/\[DIA_FECHAMENTO\]/g, String(diaFechamento))
    .replace(/\[PRAZO_VIGENCIA\]/g, calcularPrazoVigencia(c.dataInicio, c.dataFim))
    .replace(/\[DATA_INICIO\]/g, formatDateExtenso(c.dataInicio))
    .replace(/\[DATA_FIM\]/g, formatDate(c.dataFim))
    .replace(/\[DATA_ASSINATURA\]/g, dataAssinatura)
    .replace(/\[FORO_COMARCA\]/g, cidadeEmpresa + " - " + estadoEmpresa)
    .replace(/\[PRESTADOR_NOME\]/g, c.employeeName || nomePrestador)
    .replace(/\[PRESTADOR_CPF\]/g, c.employeeCpf || "_______________")
    .replace(/\[DADOS_BANCARIOS_CONTRATADA\]/g, dadosBancarios);
}

/** Realça CONTRATANTE/CONTRATADA em negrito (texto já escapado). */
function boldParts(escaped: string): string {
  return escaped.replace(/(CONTRATANTE|CONTRATADA)/g, "<strong>$1</strong>");
}

/** Converte o texto do modelo (já com placeholders trocados) em HTML do corpo. */
function corpoFromTemplate(replaced: string): string {
  const lines = replaced.split("\n");
  const out: string[] = [];
  lines.forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      out.push(`<div style="height:8px"></div>`);
      return;
    }
    // Linhas de assinatura do modelo: ignoradas (o bloco de assinaturas do
    // buildFcDocument já provê as linhas com slots de assinatura digital).
    if (trimmed.startsWith("____")) return;
    // Legendas de assinatura soltas no fim do modelo: evita duplicar.
    if (/^("?CONTRATANTE"?|"?CONTRATADA"?)$/i.test(trimmed)) return;
    // Título principal (1ªs linhas em CAIXA ALTA): já vai na faixa azul.
    if (i <= 1 && trimmed === trimmed.toUpperCase() && trimmed.length > 10) return;

    const safe = esc(trimmed);
    if (/^CL[ÁA]USULA\s/i.test(trimmed)) {
      out.push(`<h2 style="font-size:12pt;font-weight:700;text-transform:uppercase;margin:18px 0 6px 0;color:#1B2A4A">${safe}</h2>`);
      return;
    }
    if (/^\d+\.\d+\s/.test(trimmed) || /^\([IVX]+\)/.test(trimmed) || /^Par[áa]grafo\s[ÚU]nico/i.test(trimmed)) {
      out.push(`<p style="text-align:justify;margin:0 0 4px 16px">${boldParts(safe)}</p>`);
      return;
    }
    if (/^[a-z]\)/.test(trimmed)) {
      out.push(`<p style="text-align:justify;margin:0 0 3px 32px">${boldParts(safe)}</p>`);
      return;
    }
    if (/^(CONSIDERANDO|RESOLVEM|CONTRATANTE:|CONTRATADA:)/i.test(trimmed)) {
      out.push(`<p style="text-align:justify;margin:0 0 8px 0;font-weight:600">${boldParts(safe)}</p>`);
      return;
    }
    out.push(`<p style="text-align:justify;margin:0 0 8px 0">${boldParts(safe)}</p>`);
  });
  return out.join("\n");
}

export interface BuildContratoPjSignHtmlArgs {
  contrato: ContratoPjForDoc;
  /** Texto do modelo legado (plain text com \n). Fallback quando modeloHtml ausente. */
  modelo: string;
  /**
   * HTML do template vigente da Central de Documentos ISO (`systemDocumentTemplates`).
   * Quando fornecido, é usado diretamente como corpo (substitui placeholders inline
   * no HTML, sem passar por `corpoFromTemplate`). Tem prioridade sobre `modelo`.
   */
  modeloHtml?: string | null;
  /** Nome do sócio CONTRATANTE (assinatura FC). */
  contratanteNome: string;
  /** Nome de quem está gerando (rodapé). */
  geradoPor: string;
}

/**
 * Monta o HTML completo (cabeçalho FC + corpo do contrato + bloco de
 * assinaturas com slots `contratado`/`contratante`) pronto pro FCSign.
 */
export function buildContratoPjSignHtml(args: BuildContratoPjSignHtmlArgs): string {
  const { contrato: c, modelo, modeloHtml, contratanteNome, geradoPor } = args;

  // Prioridade: HTML do template ISO (já estruturado) > plain text legado
  let corpoHtml: string;
  if (modeloHtml && modeloHtml.trim()) {
    // Pre-processamento do template ISO:
    // [OBJETO_CONTRATO] pode aparecer INLINE dentro de <p> com texto antes/depois.
    // Estratégia: substituir ANTES de chamar replacePlaceholders, tratando cada ocorrência.
    const objetoHtml = formatObjetoHtml(c.objetoContrato || "");
    const totalOc = (modeloHtml.match(/\[OBJETO_CONTRATO\]/g) || []).length;
    let ocIdx = 0;
    // Primeira passagem: primeira de N ocorrências → referência estática (CONSIDERANDO);
    // última ocorrência → marcador temporário para expansão completa.
    let patchedHtml = modeloHtml.replace(/\[OBJETO_CONTRATO\]/g, () => {
      ocIdx++;
      if (totalOc > 1 && ocIdx < totalOc) {
        return "conforme descrito na Cláusula Primeira deste instrumento";
      }
      return "\x00OBJ\x00";
    });
    // Segunda passagem: marcador inline dentro de <tag>texto\x00OBJ\x00texto</tag>
    // → fecha o parágrafo anterior, expande o objeto, abre novo para texto após.
    patchedHtml = patchedHtml.replace(
      /(<[^<>]+>)([^<\x00]+)\x00OBJ\x00([^<]*?)(<\/[^<>]+>)/g,
      (_, ot, before, after, ct) => {
        const trimB = before.trimEnd().replace(/[\s,]*\s+de\s*$|[\s,]*:\s*$/, "");
        const trimA = after.trim().replace(/^[,;:]\s*/, "");
        return (trimB ? `${ot}${trimB}:${ct}\n` : "") +
               objetoHtml +
               (trimA ? `\n${ot}${trimA}${ct}` : "");
      }
    );
    // Terceira passagem: marcador standalone em sua própria tag <p>\x00OBJ\x00</p>
    patchedHtml = patchedHtml.replace(/<[^<>]+>\s*\x00OBJ\x00\s*<\/[^<>]+>/g, objetoHtml);
    // Fallback: marcador solto (sem tag ao redor)
    patchedHtml = patchedHtml.replace(/\x00OBJ\x00/g, objetoHtml);
    // Agora aplica os demais placeholders ([CONTRATANTE_NOME], [VALOR_MENSAL], etc.)
    // [OBJETO_CONTRATO] já foi expandido acima, não haverá substituição dupla.
    corpoHtml = replacePlaceholders(patchedHtml, c, true);
  } else {
    const replaced = replacePlaceholders(modelo || "", c);
    corpoHtml = corpoFromTemplate(replaced);
  }

  const nomeEmpresa = c.companyRazaoSocial || c.companyNomeFantasia || "FC ENGENHARIA";
  const nomePrestador = c.razaoSocialPrestador || c.employeeName || "Prestador";
  const cnpjPrestador = c.cnpjPrestador || "";
  const hojeStr = new Date().toLocaleDateString("pt-BR");

  const params: FcDocumentParams = {
    empresa: {
      razaoSocial: c.companyRazaoSocial || undefined,
      nomeFantasia: c.companyNomeFantasia || undefined,
      cnpj: c.companyCnpj || undefined,
      endereco: c.companyEndereco || undefined,
      cidade: c.companyCidade || undefined,
      estado: c.companyEstado || undefined,
      logoUrl: c.companyLogoUrl || undefined,
    },
    titulo: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS — PJ",
    numero: c.numeroContrato || "S/N",
    dataEmissao: hojeStr,
    assunto: { label: "OBJETO:", valor: c.objetoContrato || c.employeeName || "Prestação de serviços de engenharia" },
    corpoHtml,
    assinaturas: {
      partes: [
        { nome: nomePrestador, subtitulo: cnpjPrestador ? `CNPJ: ${cnpjPrestador}` : "CONTRATADA", role: "contratado" },
        { nome: contratanteNome, subtitulo: `${nomeEmpresa} — CONTRATANTE`, role: "contratante" },
      ],
      localData: `${c.companyCidade || "São José dos Campos"}/${c.companyEstado || "SP"}, ${hojeStr}`,
    },
    geradoPor,
    pageTitle: `Contrato PJ ${c.numeroContrato || ""} — ${nomePrestador}`,
  };

  return buildFcDocument(params);
}
