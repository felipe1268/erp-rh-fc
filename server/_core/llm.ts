import { ENV } from "./env";

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
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
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

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const isAnthropicKey = () => !!ENV.anthropicApiKey && ENV.anthropicApiKey.startsWith("sk-ant-");
const isGoogleKey    = () => !!ENV.googleApiKey && ENV.googleApiKey.startsWith("AIza");

// ── Anthropic Claude — invoked natively (not via OpenAI-compat endpoint) ────
async function invokeAnthropic(params: InvokeParams): Promise<InvokeResult> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    maxTokens,
    max_tokens,
  } = params;

  // Anthropic separates system prompt from messages
  const systemMsg = messages.find(m => m.role === "system");
  const otherMsgs = messages.filter(m => m.role !== "system");

  const anthropicMessages = otherMsgs.map(m => ({
    role: m.role as "user" | "assistant",
    content: typeof m.content === "string" ? m.content : (Array.isArray(m.content)
      ? m.content.map(p => typeof p === "string" ? { type: "text", text: p } : p)
      : m.content),
  }));

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-5",
    max_tokens: maxTokens ?? max_tokens ?? 4096,
    messages: anthropicMessages,
  };

  if (systemMsg) {
    const sysContent = typeof systemMsg.content === "string"
      ? systemMsg.content
      : Array.isArray(systemMsg.content)
        ? systemMsg.content.map(p => typeof p === "string" ? p : JSON.stringify(p)).join("\n")
        : String(systemMsg.content);
    body.system = sysContent;
  }

  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters ?? { type: "object", properties: {} },
    }));
    const tc = toolChoice || tool_choice;
    if (tc) {
      if (tc === "none") body.tool_choice = { type: "none" };
      else if (tc === "auto") body.tool_choice = { type: "auto" };
      else if (tc === "required") body.tool_choice = { type: "any" };
      else if (typeof tc === "object" && "name" in tc) body.tool_choice = { type: "tool", name: tc.name };
      else if (typeof tc === "object" && "function" in tc) body.tool_choice = { type: "tool", name: (tc as ToolChoiceExplicit).function.name };
    }
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const data = await response.json() as any;

  // Normalize to OpenAI-compatible InvokeResult shape
  const textContent = (data.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  const toolCalls: ToolCall[] = (data.content ?? [])
    .filter((c: any) => c.type === "tool_use")
    .map((c: any, i: number) => ({
      id: c.id ?? `call_${i}`,
      type: "function" as const,
      function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
    }));

  return {
    id: data.id ?? "ant-0",
    created: Math.floor(Date.now() / 1000),
    model: data.model ?? "claude-sonnet-4-5",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: textContent,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: data.stop_reason ?? null,
    }],
    usage: data.usage ? {
      prompt_tokens: data.usage.input_tokens ?? 0,
      completion_tokens: data.usage.output_tokens ?? 0,
      total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
    } : undefined,
  };
}

const resolveApiUrl = () => {
  // Google Gemini (OpenAI-compatible endpoint)
  if (isGoogleKey()) {
    return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  }
  if (ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0) {
    return `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }
  // If key looks like an OpenAI key, hit OpenAI directly
  if (ENV.forgeApiKey?.startsWith("sk-")) {
    return "https://api.openai.com/v1/chat/completions";
  }
  return "https://forge.manus.im/v1/chat/completions";
};

const resolveApiKey = () => isGoogleKey() ? ENV.googleApiKey : ENV.forgeApiKey;

const assertApiKey = () => {
  if (!ENV.forgeApiKey && !ENV.googleApiKey && !ENV.anthropicApiKey) {
    throw new Error("Nenhuma chave de IA configurada (ANTHROPIC_API_KEY, GOOGLE_API_KEY ou OPENAI_API_KEY)");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  // Prioridade: Anthropic Claude → Google Gemini → OpenAI/Forge
  if (isAnthropicKey()) {
    return invokeAnthropic(params);
  }

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const isOpenAiKey = ENV.forgeApiKey?.startsWith("sk-");
  const model = isGoogleKey()
    ? "gemini-2.5-flash"
    : isOpenAiKey ? "gpt-4o" : "gemini-2.5-flash";

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  // max_tokens / thinking por provedor
  if (isGoogleKey()) {
    payload.max_tokens = params.maxTokens ?? params.max_tokens ?? 4096;
  } else if (!isOpenAiKey) {
    // Forge/Manus (Gemini via Forge)
    payload.max_tokens = 8192;
    payload.thinking = { budget_tokens: 128 };
  } else {
    payload.max_tokens = params.maxTokens ?? params.max_tokens ?? 2048;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${resolveApiKey()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}
