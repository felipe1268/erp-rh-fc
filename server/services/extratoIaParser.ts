// ─────────────────────────────────────────────────────────────────────────────
// Parser de extrato bancário em PDF via IA (Gemini Vision → fallback Anthropic).
// ─────────────────────────────────────────────────────────────────────────────
// O parser determinístico `parseCaixaExtratoPdf` só entende o layout em colunas da
// CAIXA. Para QUALQUER outro banco (Banco do Brasil, Itaú, Bradesco, Santander...)
// o layout muda e aquele parser devolve 0 linhas. Este módulo é o FALLBACK: manda
// o PDF pra IA (mesma infra de visão usada na leitura de fatura de cartão — Rev.
// 3306) e extrai as transações em JSON canônico.
//
// Caminho primário = Gemini (free-tier, suporta PDF + JSON mode). Se falhar
// (tipicamente 429 RESOURCE_EXHAUSTED), cai pro Anthropic Vision (Claude), que
// também lê PDF e está disponível via a integração instalada. Se os dois falharem,
// propaga o erro do Gemini (mensagem de cota é mais útil pro usuário).

import { invokeGeminiVision, invokeAnthropicVision } from "../_core/llm";

export interface ExtratoLine {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number; // com sinal (negativo = débito)
  saldo: number | null; // com sinal (negativo = saldo devedor)
}

const PROMPT_EXTRATO = `Você é um extrator de EXTRATO BANCÁRIO brasileiro em PDF.
Extraia TODAS as transações (lançamentos) do extrato, em ORDEM CRONOLÓGICA, sem omitir nenhuma.

Para cada transação devolva:
- "data": a data do lançamento no formato ISO "AAAA-MM-DD". Se o extrato mostrar só DD/MM, use o ano do período do extrato.
- "descricao": o histórico/descrição do lançamento (inclua contraparte, documento ou complemento quando houver), em uma linha só.
- "valor": o valor do lançamento como NÚMERO, com SINAL: NEGATIVO para débito/saída/pagamento, POSITIVO para crédito/entrada/recebimento. Use ponto como separador decimal (ex.: -1234.56). NÃO use separador de milhar.
- "saldo": o saldo após o lançamento como NÚMERO com sinal (negativo = saldo devedor), ou null se a linha não trouxer saldo.

REGRAS:
- IGNORE linhas de "SALDO ANTERIOR", "SALDO DO DIA", "SALDO", subtotais, cabeçalhos e rodapés — elas NÃO são transações.
- Valores em reais (R$). Converta "1.234,56" para 1234.56.
- Se o extrato indicar débito por "D"/"-"/coluna de débito e crédito por "C"/"+"/coluna de crédito, aplique o sinal corretamente.
- Responda SOMENTE com JSON no formato: {"transacoes": [{"data": "...", "descricao": "...", "valor": 0, "saldo": null}]}.`;

const SCHEMA_EXTRATO = {
  type: "object",
  properties: {
    transacoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          data: { type: "string", nullable: true },
          descricao: { type: "string", nullable: true },
          valor: { type: "number", nullable: true },
          saldo: { type: "number", nullable: true },
        },
      },
    },
  },
} as const;

function salvageJson(text: string): any {
  if (!text) throw new Error("IA não retornou conteúdo.");
  try { return JSON.parse(text); } catch { /* fallback abaixo */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start > -1 && end > start) {
    const slice = text.slice(start, end + 1);
    try { return JSON.parse(slice); } catch { /* segue erro */ }
  }
  throw new Error("Não consegui interpretar o JSON da IA.");
}

// Converte número que pode vir como string "1.234,56" / "1234.56" / 1234.56 em number.
function parseValor(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  const neg = /^-/.test(s) || /[dD]$/.test(s.trim());
  s = s.replace(/[^\d.,-]/g, "");
  // Se tem vírgula E ponto → ponto é milhar, vírgula é decimal (formato BR).
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg && n > 0 ? -n : n;
}

function normData(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

async function invocarIA(base64: string, mimeType: string, extraInstructions?: string): Promise<string> {
  const prompt = extraInstructions
    ? PROMPT_EXTRATO + extraInstructions
    : PROMPT_EXTRATO;
  let geminiErr: any = null;
  if (process.env.GOOGLE_API_KEY) {
    try {
      return await invokeGeminiVision({
        prompt,
        base64,
        mimeType,
        responseSchema: SCHEMA_EXTRATO as any,
        maxTokens: 16384,
        thinking: "off",
      });
    } catch (e: any) {
      geminiErr = e;
      console.warn(`[extratoIA] Gemini Vision falhou, tentando Anthropic: ${e?.message || e}`);
    }
  }
  try {
    return await invokeAnthropicVision({
      prompt: prompt + "\nResponda SOMENTE com JSON válido.",
      files: [{ base64, mimeType }],
      maxTokens: 16384,
    });
  } catch (e: any) {
    if (geminiErr) throw geminiErr;
    throw e;
  }
}

// Extrai as transações de um extrato bancário em PDF (qualquer banco) via IA.
// Lança erro se nenhuma transação for reconhecida ou se a IA falhar.
// Rev. 3877: aceita `extraInstructions` com instruções específicas do banco (de templates cadastrados).
export async function parseExtratoComIA(base64: string, mimeType = "application/pdf", extraInstructions?: string): Promise<ExtratoLine[]> {
  const clean = base64.replace(/^data:[^,]*,/, "").trim();
  const buf = Buffer.from(clean, "base64");
  if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("O arquivo enviado não é um PDF válido.");
  }

  const txt = await invocarIA(clean, mimeType, extraInstructions);
  const raw = salvageJson(txt);
  const arr: any[] = Array.isArray(raw?.transacoes)
    ? raw.transacoes
    : Array.isArray(raw)
      ? raw
      : [];

  const out: ExtratoLine[] = [];
  for (const it of arr) {
    const data = normData(it?.data);
    const valor = parseValor(it?.valor);
    if (!data || valor == null) continue;
    let descricao = it?.descricao != null ? String(it.descricao).replace(/\s+/g, " ").trim() : "";
    if (!descricao) descricao = "Sem descrição";
    out.push({
      data,
      descricao: descricao.slice(0, 500),
      valor,
      saldo: parseValor(it?.saldo),
    });
  }
  return out;
}
