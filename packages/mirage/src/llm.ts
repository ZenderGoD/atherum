/**
 * Mirage — LLM Client
 *
 * CLEAN-ROOM IMPLEMENTATION.
 *
 * Thin wrapper around the OpenAI SDK that supports OpenRouter and other
 * OpenAI-compatible providers via configurable base URL. Handles both
 * text-only and multimodal (vision) requests.
 */

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
} from "openai/resources/chat/completions";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  modelName: string;
}

function loadConfig(overrides?: Partial<LLMConfig>): LLMConfig {
  return {
    apiKey: overrides?.apiKey || process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "",
    baseUrl: overrides?.baseUrl || process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
    modelName:
      overrides?.modelName ||
      process.env.LLM_MODEL_NAME ||
      "google/gemini-2.5-flash-preview",
  };
}

// ---------------------------------------------------------------------------
// Client singleton (lazy)
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;
let _config: LLMConfig | null = null;

function getClient(overrides?: Partial<LLMConfig>): { client: OpenAI; config: LLMConfig } {
  const config = loadConfig(overrides);

  if (!_client || _config?.apiKey !== config.apiKey || _config?.baseUrl !== config.baseUrl) {
    _client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    _config = config;
  }

  return { client: _client, config };
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Optional image URL for vision models (only for user messages) */
  imageUrl?: string;
}

export interface LLMResponse {
  content: string;
  tokenUsage: { input: number; output: number };
  model: string;
  finishReason: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a chat completion request to the configured LLM provider.
 * Supports multimodal (vision) by attaching image_url content parts.
 */
export async function chatCompletion(
  messages: LLMMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    modelOverride?: string;
    configOverrides?: Partial<LLMConfig>;
  },
): Promise<LLMResponse> {
  const { client, config } = getClient(options?.configOverrides);
  const model = options?.modelOverride || config.modelName;

  const formattedMessages: ChatCompletionMessageParam[] = messages.map((msg) => {
    if (msg.imageUrl && msg.role === "user") {
      const parts: ChatCompletionContentPart[] = [
        { type: "text", text: msg.content },
        {
          type: "image_url",
          image_url: { url: msg.imageUrl, detail: "high" },
        },
      ];
      return { role: "user" as const, content: parts };
    }
    return { role: msg.role, content: msg.content };
  });

  const response = await client.chat.completions.create({
    model,
    messages: formattedMessages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
    ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
  });

  const choice = response.choices[0];
  const usage = response.usage;

  return {
    content: choice?.message?.content || "",
    tokenUsage: {
      input: usage?.prompt_tokens ?? 0,
      output: usage?.completion_tokens ?? 0,
    },
    model: response.model || model,
    finishReason: choice?.finish_reason ?? null,
  };
}

/**
 * Convenience: single system + user message completion.
 */
export async function complete(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    imageUrl?: string;
    modelOverride?: string;
    configOverrides?: Partial<LLMConfig>;
  },
): Promise<LLMResponse> {
  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt, imageUrl: options?.imageUrl },
  ];

  return chatCompletion(messages, options);
}
