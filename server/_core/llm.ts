import Anthropic from "@anthropic-ai/sdk";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ── Anthropic client (Replit integration preferred, direct key fallback) ─────
const getAnthropicClient = (): Anthropic | null => {
  if (
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY
  ) {
    return new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return null;
};

const isAnthropicAvailable = () => {
  return !!(
    (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) ||
    process.env.ANTHROPIC_API_KEY
  );
};

const CLAUDE_MODEL = "claude-sonnet-4-6";

// Convert image_url content to Anthropic image block
const toAnthropicImageBlock = (
  part: ImageContent
): Anthropic.Messages.ImageBlockParam => {
  const url = part.image_url.url;
  if (url.startsWith("data:")) {
    const [header, data] = url.split(",");
    const mediaType = header.split(":")[1]?.split(";")[0] ?? "image/jpeg";
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as Anthropic.Messages.Base64ImageSource["media_type"],
        data,
      },
    };
  }
  return {
    type: "image",
    source: { type: "url", url },
  } as Anthropic.Messages.ImageBlockParam;
};

// Convert our Message type to Anthropic MessageParam
const toAnthropicMessage = (
  msg: Message
): Anthropic.Messages.MessageParam => {
  const role = msg.role as "user" | "assistant";

  if (typeof msg.content === "string") {
    return { role, content: msg.content };
  }

  const parts = Array.isArray(msg.content) ? msg.content : [msg.content];
  const blocks: Anthropic.Messages.ContentBlockParam[] = parts.map((p) => {
    if (typeof p === "string") return { type: "text", text: p } as Anthropic.Messages.TextBlockParam;
    if (p.type === "text") return { type: "text", text: p.text } as Anthropic.Messages.TextBlockParam;
    if (p.type === "image_url") return toAnthropicImageBlock(p);
    return { type: "text", text: JSON.stringify(p) } as Anthropic.Messages.TextBlockParam;
  });

  return { role, content: blocks };
};

// ── Anthropic invocation ─────────────────────────────────────────────────────
async function invokeAnthropic(params: InvokeParams): Promise<InvokeResult> {
  const client = getAnthropicClient()!;
  const { messages, tools, toolChoice, tool_choice, maxTokens, max_tokens } = params;

  const systemMsg = messages.find((m) => m.role === "system");
  const otherMsgs = messages.filter((m) => m.role !== "system");

  const systemText = systemMsg
    ? typeof systemMsg.content === "string"
      ? systemMsg.content
      : Array.isArray(systemMsg.content)
        ? systemMsg.content
            .map((p) => (typeof p === "string" ? p : (p as TextContent).text ?? JSON.stringify(p)))
            .join("\n")
        : String(systemMsg.content)
    : undefined;

  const body: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens ?? max_tokens ?? 8192,
    messages: otherMsgs.map(toAnthropicMessage),
    ...(systemText ? { system: systemText } : {}),
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      input_schema: (t.function.parameters ?? { type: "object", properties: {} }) as Anthropic.Messages.Tool["input_schema"],
    }));

    const tc = toolChoice ?? tool_choice;
    if (tc) {
      if (tc === "none") body.tool_choice = { type: "none" };
      else if (tc === "auto") body.tool_choice = { type: "auto" };
      else if (tc === "required") body.tool_choice = { type: "any" };
      else if (typeof tc === "object" && "name" in tc)
        body.tool_choice = { type: "tool", name: tc.name };
      else if (typeof tc === "object" && "function" in tc)
        body.tool_choice = { type: "tool", name: (tc as ToolChoiceExplicit).function.name };
    }
  }

  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await client.messages.create(body);

      const textContent = data.content
        .filter((c) => c.type === "text")
        .map((c) => (c as Anthropic.Messages.TextBlock).text)
        .join("");

      const toolCalls: ToolCall[] = data.content
        .filter((c) => c.type === "tool_use")
        .map((c, i) => {
          const tu = c as Anthropic.Messages.ToolUseBlock;
          return {
            id: tu.id ?? `call_${i}`,
            type: "function" as const,
            function: { name: tu.name, arguments: JSON.stringify(tu.input ?? {}) },
          };
        });

      return {
        id: data.id ?? "ant-0",
        created: Math.floor(Date.now() / 1000),
        model: data.model ?? CLAUDE_MODEL,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: textContent,
              ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            },
            finish_reason: data.stop_reason ?? null,
          },
        ],
        usage: data.usage
          ? {
              prompt_tokens: data.usage.input_tokens ?? 0,
              completion_tokens: data.usage.output_tokens ?? 0,
              total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
            }
          : undefined,
      };
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "";
      const status =
        err?.status ??
        err?.statusCode ??
        (msg.includes("429") ? 429 : msg.includes("529") ? 529 : 0);
      // Rev. 2861 — Claude também retorna 529 "Overloaded" sob carga (99 fichas
      // do Databook em sequência). Tratamos 429 (rate limit) E 529/"overloaded"
      // (sobrecarga) como retryable. A detecção de "overloaded" é
      // CASE-INSENSITIVE (a SDK manda "Overloaded" com O maiúsculo).
      const isOverloaded =
        status === 529 ||
        /overloaded/i.test(msg) ||
        err?.error?.type === "overloaded_error";
      const isRateLimited = status === 429;
      if ((isRateLimited || isOverloaded) && attempt < MAX_RETRIES) {
        const retryAfter = err?.headers?.["retry-after"];
        let waitMs: number;
        if (retryAfter) {
          const secs = parseInt(retryAfter, 10);
          waitMs = (isNaN(secs) ? 5 : secs) * 1000;
        } else {
          waitMs = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        }
        waitMs = Math.min(waitMs, 60000);
        const motivo = isRateLimited ? "429 rate limit" : "529 overloaded";
        console.warn(`[LLM] Claude ${motivo} (tentativa ${attempt + 1}/${MAX_RETRIES + 1}). Aguardando ${Math.round(waitMs)}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (isRateLimited) {
        throw new Error("Limite de requisições da IA atingido. Aguarde alguns minutos e tente novamente.");
      }
      throw err;
    }
  }
  throw new Error("Falha ao invocar Claude após múltiplas tentativas.");
}

const assertApiKey = () => {
  if (!isAnthropicAvailable() && !process.env.GOOGLE_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("Nenhuma chave de IA configurada");
  }
};

export async function invokeLLM(
  params: InvokeParams & { fast?: boolean }
): Promise<InvokeResult> {
  assertApiKey();

  // Rev. 2585 — CAMINHO RÁPIDO (combate "trava em 95%"): chamadas pesadas de
  // geração (ex.: Simulador de Mão de Obra com `planoAtaque`, ~8000 tokens)
  // levam tempo demais no Claude Sonnet não-streaming e estouram o timeout do
  // proxy/iOS antes de retornar. Quando `fast: true`, geramos via Gemini 2.5
  // Flash com `thinkingBudget=0` (mesmo padrão anti-"trava" do invokeGeminiVision),
  // que responde MUITO mais rápido para saída estruturada longa. Claude continua
  // como fallback se o caminho rápido falhar.
  if (params.fast && process.env.GOOGLE_API_KEY) {
    try {
      return await invokeGeminiFast(params);
    } catch (err: any) {
      console.warn(
        "[LLM] Caminho rápido (Gemini Flash) falhou (" +
          String(err?.message ?? "").slice(0, 80) +
          "). Caindo para o fluxo padrão..."
      );
      // segue para o fluxo padrão (Claude → Gemini lento)
    }
  }

  // Claude tem prioridade, fallback para Gemini
  if (isAnthropicAvailable()) {
    try {
      return await invokeAnthropic(params);
    } catch (err: any) {
      const msg = err?.message || "";
      // Rev. 2861 — detecção CASE-INSENSITIVE + inclui 529 (overloaded) para
      // que a sobrecarga do Claude caia para o Gemini em vez de falhar a ficha.
      const isRetryable = /429|rate limit|503|unavailable|500|529|overloaded/i.test(msg);
      if (isRetryable && process.env.GOOGLE_API_KEY) {
        console.warn("[LLM] Claude falhou (" + msg.slice(0, 80) + "). Tentando fallback para Gemini...");
      } else {
        throw err;
      }
    }
  }

  // Fallback: Gemini
  if (process.env.GOOGLE_API_KEY) {
    try {
      return await invokeGemini(params);
    } catch (err: any) {
      throw err;
    }
  }

  throw new Error("Nenhuma chave de IA disponível");
}

async function invokeGemini(params: InvokeParams): Promise<InvokeResult> {
  const googleKey = process.env.GOOGLE_API_KEY;
  if (!googleKey) throw new Error("Google API key não configurada");

  const { messages, outputSchema, output_schema, responseFormat, response_format, maxTokens, max_tokens } = params;

  const payload: Record<string, unknown> = {
    model: "gemini-2.5-flash",
    messages: messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
    max_tokens: maxTokens ?? max_tokens ?? 4096,
  };

  const schema = outputSchema ?? output_schema;
  const fmt = responseFormat ?? response_format;
  if (schema) {
    payload.response_format = {
      type: "json_schema",
      json_schema: { name: schema.name, schema: schema.schema },
    };
  } else if (fmt) {
    payload.response_format = fmt;
  }

  const MAX_RETRIES = 4;
  const bodyStr = JSON.stringify(payload);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${googleKey}`,
        },
        body: bodyStr,
      }
    );

    if (res.ok) {
      return (await res.json()) as InvokeResult;
    }

    const errText = await res.text();

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterHeader = res.headers.get("retry-after");
      let waitMs: number;
      if (retryAfterHeader) {
        const secs = parseInt(retryAfterHeader, 10);
        waitMs = (isNaN(secs) ? 5 : secs) * 1000;
      } else {
        waitMs = 1000 * Math.pow(2, attempt) + Math.random() * 500;
      }
      waitMs = Math.min(waitMs, 60000);
      console.warn(`[LLM] Gemini 429 rate limit (tentativa ${attempt + 1}/${MAX_RETRIES + 1}). Aguardando ${Math.round(waitMs)}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (res.status === 429) {
      throw new Error("Limite de requisições da IA atingido (429). Aguarde alguns minutos e tente novamente.");
    }

    throw new Error(`Gemini invoke failed: ${res.status} – ${errText}`);
  }

  throw new Error("Falha ao invocar Gemini após múltiplas tentativas.");
}

// ── Caminho rápido: Gemini 2.5 Flash texto, thinking OFF (Rev. 2585) ─────────
// Usa o endpoint NATIVO generateContent (que aceita thinkingConfig) com
// thinkingBudget=0 para cortar o "extended thinking" do Gemini 2.5 (30-90s de
// overhead em prompts longos) e responder rápido em geração estruturada longa.
// Retorna o mesmo InvokeResult dos outros caminhos para uso transparente.
async function invokeGeminiFast(params: InvokeParams): Promise<InvokeResult> {
  const googleKey = process.env.GOOGLE_API_KEY;
  if (!googleKey) throw new Error("Google API key não configurada");

  const { messages, maxTokens, max_tokens, responseFormat, response_format } = params;

  const flatten = (c: MessageContent | MessageContent[]): string =>
    typeof c === "string"
      ? c
      : Array.isArray(c)
        ? c.map((p) => (typeof p === "string" ? p : (p as TextContent).text ?? JSON.stringify(p))).join("\n")
        : ((c as TextContent).text ?? JSON.stringify(c));

  const systemMsg = messages.find((m) => m.role === "system");
  const systemText = systemMsg ? flatten(systemMsg.content) : undefined;

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: flatten(m.content) }],
    }));

  const fmt = responseFormat ?? response_format;
  const wantsJson = !!fmt && (fmt as any).type !== "text";

  const model = "gemini-2.5-flash";
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens ?? max_tokens ?? 8000,
      temperature: 0.4,
      thinkingConfig: { thinkingBudget: 0 },
      ...(wantsJson ? { responseMimeType: "application/json" } : {}),
    },
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
  };

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (res.ok) {
      const json: any = await res.json();
      const text =
        json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") || "";
      return {
        id: json?.responseId ?? "gem-fast-0",
        created: Math.floor(Date.now() / 1000),
        model: json?.modelVersion ?? model,
        choices: [
          { index: 0, message: { role: "assistant", content: text }, finish_reason: json?.candidates?.[0]?.finishReason ?? null },
        ],
      };
    }

    const errText = await res.text();
    if (res.status === 429 && attempt < MAX_RETRIES) {
      // Rev. 3287 — honra o `retryDelay` sugerido pela API (free-tier) em vez de
      // só backoff cego: retomar ANTES da janela apenas queima tentativas com
      // novos 429. Usamos MAX(sugerido, backoff exponencial), com teto de 20s p/
      // não estourar demais o tempo total (a recuperação client-side cobre o
      // caso de a conexão do iPad cair enquanto o servidor ainda processa).
      const sugerido = extrairRetryDelayMs(errText);
      const backoff = 1000 * Math.pow(2, attempt) + Math.random() * 500;
      const waitMs = Math.min(Math.max(sugerido, backoff), 20000);
      console.warn(`[Gemini Fast] 429 (tentativa ${attempt + 1}/${MAX_RETRIES + 1}). Aguardando ${Math.round(waitMs)}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`Gemini Fast falhou: ${res.status} – ${errText.slice(0, 300)}`);
  }
  throw new Error("Gemini Fast: máximo de tentativas excedido.");
}

// ── Exported helper: invoke Anthropic with raw base64 image ─────────────────
export async function invokeAnthropicVision(params: {
  prompt: string;
  base64?: string;
  mimeType?: string;
  // Rev. 2800 — suporte a MÚLTIPLOS arquivos numa única chamada (vários blocos
  // de imagem/PDF). Retrocompatível: se `files` vier vazio, usa base64+mimeType.
  files?: { base64: string; mimeType: string }[];
  systemPrompt?: string;
  maxTokens?: number;
}): Promise<string> {
  const client = getAnthropicClient();
  if (!client) throw new Error("Anthropic não configurado");

  const fileList = (params.files && params.files.length > 0)
    ? params.files
    : (params.base64 && params.mimeType ? [{ base64: params.base64, mimeType: params.mimeType }] : []);
  if (fileList.length === 0) throw new Error("Nenhum arquivo fornecido para análise");

  const contentBlocks: any[] = fileList.map((f) => {
    const isPdf = f.mimeType === "application/pdf";
    return isPdf
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: f.base64,
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: f.mimeType as Anthropic.Messages.Base64ImageSource["media_type"],
            data: f.base64,
          },
        };
  });

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: [
        ...contentBlocks,
        { type: "text", text: params.prompt },
      ],
    },
  ];

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: params.maxTokens ?? 1024,
    ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
    messages,
  });

  return response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as Anthropic.Messages.TextBlock).text)
    .join("");
}

// ── Exported helper: invoke Gemini com PDF ou imagem (base64) ────────────────
// Rev. 2308 — Suporte a PDF/imagem via endpoint nativo Gemini (o endpoint
// OpenAI-compatible usado em invokeGemini não aceita inline_data binário).
// Usado pelo upload em lote de contratos de locação. Retorna string (texto
// concatenado). Suporta JSON mode via responseSchema (Gemini structured output).
// Rev. 3128 — Extrai o `retryDelay` (ex.: "30s") que o Gemini devolve no corpo
// dos erros 429/503 (details[].@type RetryInfo). Devolve ms (0 se ausente) para
// respeitar a janela sugerida pela API em vez de só backoff cego.
function extrairRetryDelayMs(errText: string): number {
  try {
    const j: any = JSON.parse(errText);
    const details = j?.error?.details;
    if (Array.isArray(details)) {
      for (const d of details) {
        const rd = d?.retryDelay;
        if (typeof rd === "string") {
          const m = rd.match(/([\d.]+)\s*s/i);
          if (m) return Math.round(parseFloat(m[1]) * 1000);
        }
      }
    }
  } catch { /* corpo de erro não-JSON */ }
  return 0;
}

export async function invokeGeminiVision(params: {
  prompt: string;
  base64: string;
  mimeType: string;
  systemPrompt?: string;
  maxTokens?: number;
  responseSchema?: Record<string, unknown>;
  model?: string;
  // Rev. 2409 — `thinking` controla o modo de raciocínio do Gemini 2.5.
  // Default: "off" (thinkingBudget=0) — corta 50-70% do tempo de resposta
  // em tarefas de extração estruturada (que NÃO precisam de raciocínio
  // multi-passo). Mantém qualidade pra OCR/parsing de layout. Caller pode
  // passar "auto" pra deixar o modelo decidir (mais lento mas mais robusto
  // em casos de reasoning complexo). Combate "trava em 99%" no import PDF.
  thinking?: "off" | "auto";
}): Promise<string> {
  const googleKey = process.env.GOOGLE_API_KEY;
  if (!googleKey) throw new Error("Google API key não configurada");

  const model = params.model ?? "gemini-2.5-flash";
  const thinkingMode = params.thinking ?? "off";
  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: params.mimeType, data: params.base64 } },
          { text: params.prompt },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: params.maxTokens ?? 8192,
      temperature: 0.1,
      // Rev. 2409 — thinkingBudget=0 desliga o modo "extended thinking" do
      // Gemini 2.5 (em que o modelo gera tokens de raciocínio invisíveis
      // antes da resposta final, somando 30-90s em prompts longos com PDF
      // grande). Pra extração JSON com schema, é puro overhead.
      // Guarda: thinkingConfig só existe na família 2.5+; em modelos
      // antigos (1.5, 2.0) a API retorna 400. Aplica só se o nome casar.
      ...(thinkingMode === "off" && /^gemini-2\.[5-9]|^gemini-[3-9]/.test(model)
        ? { thinkingConfig: { thinkingBudget: 0 } }
        : {}),
      ...(params.responseSchema ? {
        responseMimeType: "application/json",
        responseSchema: params.responseSchema,
      } : {}),
    },
    ...(params.systemPrompt ? {
      systemInstruction: { parts: [{ text: params.systemPrompt }] },
    } : {}),
  };

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (res.ok) {
      const json: any = await res.json();
      const text = json?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text || "")
        .join("") || "";
      return text;
    }
    const errText = await res.text();
    // Rev. 3128 — Retry em TODOS os erros transitórios do Gemini, não só 429:
    // 429 (quota/rate-limit do free-tier), 500 (interno), 502/503/504 (modelo
    // sobrecarregado / "high demand" UNAVAILABLE). Esses respondiam por ~95% das
    // "Falhas" na leitura de ASOs em lote. Honra o `retryDelay` que a própria API
    // sugere no corpo do erro (ou usa backoff exponencial, o que for MAIOR).
    const transitorio = res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504;
    if (transitorio && attempt < MAX_RETRIES) {
      const sugerido = extrairRetryDelayMs(errText);
      const backoff = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 750, 60000);
      const waitMs = Math.min(Math.max(sugerido, backoff), 60000);
      console.warn(`[Gemini Vision] ${res.status} (tentativa ${attempt + 1}/${MAX_RETRIES + 1}). Aguardando ${Math.round(waitMs)}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`Gemini Vision falhou: ${res.status} – ${errText.slice(0, 500)}`);
  }
  throw new Error("Gemini Vision: máximo de tentativas excedido.");
}
