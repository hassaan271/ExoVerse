/**
 * Provider-neutral chat logic, shared by the API route and later AI features.
 * Holds no credentials and imports nothing at runtime, so it can be tested alone.
 */
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export const CHAT_LIMITS = {
  /** History sent per request, which caps the cost of one long conversation. */
  messages: 30,
  messageLength: 4000,
  replyTokens: 800,
  requestsPerMinute: 20,
};

const SYSTEM_PROMPT = `You are the astronomy guide inside ExoVerse, a website for exploring exoplanets.
Explain clearly and concisely for a curious general audience.
You have no access to ExoVerse's catalog here, so don't state a precise measurement unless you are sure of it, and say when you're unsure.
Never claim that life, liquid water or an atmosphere has been confirmed on an exoplanet unless it has been published.`;

export type ValidatedConversation =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; error: string };

/** Everything from the browser is untrusted, so it can't set a system prompt. */
export function validateConversation(body: unknown): ValidatedConversation {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "Send at least one message." };
  }
  if (messages.length > CHAT_LIMITS.messages) {
    return { ok: false, error: "This conversation is too long. Start a new one." };
  }
  const clean: ChatMessage[] = [];
  for (const message of messages) {
    const { role, content } = (message ?? {}) as Partial<ChatMessage>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) {
      return { ok: false, error: "A message in this conversation isn't valid." };
    }
    if (content.length > CHAT_LIMITS.messageLength) {
      return { ok: false, error: "That message is too long. Try a shorter one." };
    }
    clean.push({ role, content });
  }
  if (clean[clean.length - 1].role !== "user") {
    return { ok: false, error: "The last message must be yours." };
  }
  return { ok: true, messages: clean };
}

/** Some models write their reasoning in think tags, which readers shouldn't see. */
export function cleanReply(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "").trim();
}

/** The part of the OpenAI client this uses, so tests can pass a stand-in. */
export interface ChatClient {
  chat: {
    completions: {
      create(
        request: {
          model: string;
          messages: { role: "system" | ChatRole; content: string }[];
          max_tokens: number;
        },
        options?: { signal?: AbortSignal },
      ): Promise<{ choices: { message: { content?: string | null } }[] }>;
    };
  };
}

export class EmptyReplyError extends Error {}

export async function completeChat(
  client: ChatClient,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
) {
  const response = await client.chat.completions.create(
    {
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: CHAT_LIMITS.replyTokens,
    },
    { signal },
  );
  const reply = cleanReply(response.choices[0]?.message.content ?? "");
  if (!reply) throw new EmptyReplyError();
  return reply;
}

export interface ChatFailure {
  status: number;
  message: string;
  retryable: boolean;
}

/**
 * What a visitor may see. Provider error text is never passed on, because it can
 * include account details or request data.
 */
export function describeFailure(error: unknown): ChatFailure {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403) {
    return { status: 503, message: "The AI service rejected this site's credentials.", retryable: false };
  }
  if (status === 404) {
    return { status: 503, message: "The configured AI model isn't available.", retryable: false };
  }
  if (status === 429) {
    return { status: 429, message: "The AI service is busy. Try again in a moment.", retryable: true };
  }
  return { status: 502, message: "The AI service didn't answer. Try again.", retryable: true };
}

const recent = new Map<string, number[]>();

/**
 * A small per-visitor limit, since each request spends API credit. It lives in
 * one server's memory, so it needs replacing before scaling to several.
 */
export function allowRequest(visitor: string, now = Date.now()) {
  const windowStart = now - 60_000;
  const times = (recent.get(visitor) ?? []).filter((time) => time > windowStart);
  if (times.length >= CHAT_LIMITS.requestsPerMinute) {
    recent.set(visitor, times);
    return false;
  }
  times.push(now);
  recent.set(visitor, times);
  return true;
}
