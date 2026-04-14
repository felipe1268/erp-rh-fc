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
      const status = err?.status ?? err?.statusCode ?? (typeof err?.message === "string" && err.message.includes("429") ? 429 : 0);
      if (status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = err?.headers?.["retry-after"];
        let waitMs: number;
        if (retryAfter) {
          const secs = parseInt(retryAfter, 10);
          waitMs = (isNaN(secs) ? 5 : secs) * 1000;
        } else {
          waitMs = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        }
        waitMs = Math.min(waitMs, 60000);
        console.warn(`[LLM] Claude 429 rate limit (tentativa ${attempt + 1}/${MAX_RETRIES + 1}). Aguardando ${Math.round(waitMs)}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (status === 429) {
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

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  // Claude tem prioridade, fallback para Gemini
  if (isAnthropicAvailable()) {
    try {
      return await invokeAnthropic(params);
    } catch (err: any) {
      const msg = err?.message || "";
      const isRetryable = msg.includes("429") || msg.includes("rate limit") || msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("500") || msg.includes("overloaded");
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

// ── Exported helper: invoke Anthropic with raw base64 image ─────────────────
export async function invokeAnthropicVision(params: {
  prompt: string;
  base64: string;
  mimeType: string;
  systemPrompt?: string;
  maxTokens?: number;
}): Promise<string> {
  const client = getAnthropicClient();
  if (!client) throw new Error("Anthropic não configurado");

  const isPdf = params.mimeType === "application/pdf";

  const contentBlock: any = isPdf
    ? {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: params.base64,
        },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: params.mimeType as Anthropic.Messages.Base64ImageSource["media_type"],
          data: params.base64,
        },
      };

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: [
        contentBlock,
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
