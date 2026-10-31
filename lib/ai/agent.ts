/**
 * The agent loop. It asks the model, runs validated tools and repeats, up to
 * MAX_TOOL_ROUNDS times. It stops at a frontend action, because only the browser
 * can say whether that worked, and resumes from a signed continuation so a client
 * can't rewrite the tool results the model has seen.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AgentAction } from "./actions.ts";
import { type ChatMessage, cleanReply, EmptyReplyError } from "./chat.ts";

export const MAX_TOOL_ROUNDS = 5;
const REPLY_TOKENS = 1500;
/**
 * Reasoning is most of this model's delay, but tool calling needs it: without
 * it the model writes invented calls as text. So it stays on while deciding, and
 * goes off for the final pass, which only has to write up data it already has.
 */
const WITHOUT_REASONING = { chat_template_kwargs: { enable_thinking: false } };
const WRITTEN_TOOL_CALL = /<tool_call>|<function=|```python/;
const ASKS_FOR_ACTION = /\b(show|open|take|display|go|highlight|zoom|navigate|view|bring)\b/i;
/** After a search the model still needs to fetch data, so it isn't finished. */
const SEARCH_TOOL = "search_exoplanet";
/** A first question about ideas, with nothing to look up in the catalog. */
const CONCEPT_QUESTION = /^\s*(what (is|are)|how (do|does|is|are)|why (do|does|is|are)|explain)\s+(an?\s+|the\s+)?[a-z -]+\??\s*$/i;
const NEEDS_CATALOG = /\b(this|that|these|those|it|its|they|their|here|dataset|catalog|exoverse|largest|biggest|smallest|closest|nearest|farthest|hottest|coldest|most|best|many|planets? in|list|find|compare)\b/i;
const CONTINUATION_MS = 5 * 60_000;
const ACTION_FAILURES = ["timeout", "not-found", "failed", "cancelled"] as const;

export interface JsonSchema {
  type: "object";
  properties: Record<string, {
    type: "string" | "number" | "boolean" | "array";
    enum?: readonly string[];
    items?: { type: "string"; enum?: readonly string[] };
    description?: string;
    minimum?: number;
    maximum?: number;
    maxLength?: number;
  }>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

/** Plain data only. Unknown fields and wrong types are refused, not coerced. */
export function checkArguments(schema: JsonSchema, value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "Arguments must be an object.";
  const args = value as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (args[key] === undefined) return `Missing ${key}.`;
  }
  for (const [key, entry] of Object.entries(args)) {
    const rule = schema.properties[key];
    if (!rule) return `Unknown field ${key}.`;
    if (rule.type === "array") {
      if (!Array.isArray(entry) || entry.length > 20) return `${key} must be a short list.`;
      if (entry.some((item) => typeof item !== "string" || (rule.items?.enum && !rule.items.enum.includes(item)))) {
        return `${key} holds an invalid value.`;
      }
    } else if (typeof entry !== rule.type || (rule.type === "number" && !Number.isFinite(entry))) {
      return `${key} must be a ${rule.type}.`;
    } else if (rule.enum && !rule.enum.includes(entry as string)) {
      return `${key} must be one of: ${rule.enum.join(", ")}.`;
    } else if (typeof entry === "string" && entry.length > (rule.maxLength ?? 200)) {
      return `${key} is too long.`;
    } else if (typeof entry === "number" && ((rule.minimum !== undefined && entry < rule.minimum) || (rule.maximum !== undefined && entry > rule.maximum))) {
      return `${key} is out of range.`;
    }
  }
  return null;
}

export interface Reference {
  name: string;
  path: string;
}

export interface ToolOutcome {
  result: unknown;
  references?: Reference[];
}

export interface ToolRegistry {
  definitions: ToolDefinition[];
  /** Status text for the interface, true to what the tool does. */
  status(name: string): string;
  isAction(name: string): boolean;
  run(name: string, args: Record<string, unknown>): ToolOutcome;
  action(name: string, args: Record<string, unknown>): { ok: true; action: AgentAction } | { ok: false; error: string };
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type WireMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type IdentifiedAction = AgentAction & { id: string };

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "actions"; actions: IdentifiedAction[]; resume: string }
  | { type: "done"; reply: string; references: Reference[] };

export interface StreamChunk {
  choices: {
    delta?: {
      content?: string | null;
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
}

export interface AgentClient {
  chat: {
    completions: {
      create(request: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
    };
  };
}

interface Run {
  client: AgentClient;
  model: string;
  registry: ToolRegistry;
  secret: string;
  emit: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

interface Progress {
  messages: WireMessage[];
  round: number;
  references: Reference[];
  /** The request needs the interface, so the loop keeps its tools until the end. */
  wantsAction: boolean;
  /** Nothing to look up, so the first pass can go straight to writing. */
  writeFirst?: boolean;
}

const sign = (payload: string, secret: string) =>
  createHmac("sha256", `exoverse-agent:${secret}`).update(payload).digest("base64url");

function sealContinuation(state: Progress & { pending: string[] }, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...state, expires: now + CONTINUATION_MS })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function openContinuation(token: unknown, secret: string, now = Date.now()) {
  if (typeof token !== "string") return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const state = JSON.parse(Buffer.from(payload, "base64url").toString()) as Progress & { pending: string[]; expires: number };
  return state.expires > now ? state : null;
}

export interface ActionResult {
  id: string;
  ok: boolean;
  reason?: string;
}

/** Only success or a known failure gets through: the browser supplies no prose. */
function actionMessage(id: string, results: ActionResult[]): WireMessage {
  const found = results.find((result) => result.id === id);
  const reason = ACTION_FAILURES.find((value) => value === found?.reason) ?? "failed";
  return {
    role: "tool",
    tool_call_id: id,
    content: JSON.stringify(
      found?.ok === true
        ? { confirmed: true, note: "The interface confirmed this is now on screen." }
        : { confirmed: false, reason, note: "This did not happen. Tell the user plainly." },
    ),
  };
}

async function readRound(client: AgentClient, request: Record<string, unknown>, run: Run) {
  const stream = (await client.chat.completions.create(request, { signal: run.signal })) as AsyncIterable<StreamChunk>;
  let text = "";
  let streamed = false;
  const calls: { id: string; name: string; args: string }[] = [];

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      text += delta.content;
      if (text.trim()) {
        run.emit({ type: "delta", text: streamed ? delta.content : text.trimStart() });
        streamed = true;
      }
    }
    for (const call of delta?.tool_calls ?? []) {
      const entry = (calls[call.index] ??= { id: "", name: "", args: "" });
      if (call.id) entry.id = call.id;
      if (call.function?.name) entry.name += call.function.name;
      if (call.function?.arguments) entry.args += call.function.arguments;
    }
  }
  return { text, streamed, calls: calls.filter(Boolean) };
}

function runTool(registry: ToolRegistry, call: { name: string; args: string }, references: Reference[]) {
  const definition = registry.definitions.find(({ name }) => name === call.name);
  if (!definition) return { error: `There is no tool called ${call.name}.` };
  let args: unknown;
  try {
    args = JSON.parse(call.args || "{}");
  } catch {
    return { error: "Those arguments weren't valid JSON." };
  }
  const problem = checkArguments(definition.parameters, args);
  if (problem) return { error: problem };
  try {
    const outcome = registry.run(call.name, args as Record<string, unknown>);
    for (const reference of outcome.references ?? []) {
      if (!references.some(({ path }) => path === reference.path)) references.push(reference);
    }
    return outcome.result;
  } catch {
    return { error: "That tool failed. Don't guess its result." };
  }
}

async function loop(run: Run, progress: Progress) {
  const { client, model, registry, emit } = run;
  const { messages, references } = progress;
  const tools = registry.definitions.map(({ name, description, parameters }) => ({
    type: "function",
    function: { name, description, parameters },
  }));

  let writing = progress.writeFirst === true;
  for (let round = progress.round; round <= MAX_TOOL_ROUNDS; round += 1) {
    // The last pass has no tools, so the loop always ends in an answer.
    const offerTools = round < MAX_TOOL_ROUNDS && !writing;
    emit({ type: "status", text: writing ? "Writing the answer" : "Thinking" });
    const { text, streamed, calls } = await readRound(
      client,
      {
        model,
        messages,
        stream: true,
        max_tokens: REPLY_TOKENS,
        ...(offerTools ? { tools } : {}),
        ...(writing ? WITHOUT_REASONING : {}),
      },
      run,
    );

    if (writing && WRITTEN_TOOL_CALL.test(text)) {
      if (streamed) emit({ type: "reset" });
      writing = false;
      continue;
    }

    if (calls.length === 0) {
      const reply = cleanReply(text);
      if (!reply) throw new EmptyReplyError();
      emit({ type: "done", reply, references });
      return;
    }
    if (streamed) emit({ type: "reset" });

    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: calls.map(({ id, name, args }) => ({ id, type: "function", function: { name, arguments: args } })),
    });

    const actions: IdentifiedAction[] = [];
    const pending: string[] = [];
    let toolFailed = false;
    for (const call of calls) {
      emit({ type: "status", text: registry.status(call.name) });
      if (registry.isAction(call.name)) {
        let args: unknown = {};
        try {
          args = JSON.parse(call.args || "{}");
        } catch {
          args = null;
        }
        const checked = args && typeof args === "object"
          ? registry.action(call.name, args as Record<string, unknown>)
          : ({ ok: false, error: "Those arguments weren't valid JSON." } as const);
        if (checked.ok) {
          actions.push({ ...checked.action, id: call.id } as IdentifiedAction);
          pending.push(call.id);
        } else {
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ confirmed: false, error: checked.error }) });
        }
      } else {
        const result = runTool(registry, call, references);
        toolFailed ||= typeof result === "object" && result !== null && "error" in result;
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    if (actions.length > 0) {
      emit({
        type: "actions",
        actions,
        resume: sealContinuation(
          { messages, round: round + 1, references, wantsAction: progress.wantsAction, pending },
          run.secret,
        ),
      });
      return;
    }
    // A failed lookup needs the model to think again, not a write-up of the failure.
    writing = !progress.wantsAction && !toolFailed && calls.every(({ name }) => name !== SEARCH_TOOL);
  }
  throw new EmptyReplyError();
}

/**
 * Lookups the server can do up front, written in as if the model had asked. A
 * model given only a hint repeats them, at a cost of one slow round each.
 */
function prefill(registry: ToolRegistry, lookups: { name: string; args: Record<string, unknown> }[], references: Reference[]) {
  const calls = lookups.map(({ name, args }, index) => ({
    id: `prefill-${index}`,
    type: "function" as const,
    function: { name, arguments: JSON.stringify(args) },
  }));
  if (calls.length === 0) return [];
  return [
    { role: "assistant", content: null, tool_calls: calls } satisfies WireMessage,
    ...calls.map((call): WireMessage => ({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(runTool(registry, { name: call.function.name, args: call.function.arguments }, references)),
    })),
  ];
}

export function startAgent(
  run: Run,
  system: string[],
  history: ChatMessage[],
  lookups: { name: string; args: Record<string, unknown> }[] = [],
) {
  const references: Reference[] = [];
  const messages: WireMessage[] = [
    ...system.map((content): WireMessage => ({ role: "system", content })),
    ...history,
    ...prefill(run.registry, lookups, references),
  ];
  const question = history[history.length - 1]?.content ?? "";
  const wantsAction = ASKS_FOR_ACTION.test(question);
  const writeFirst =
    history.length === 1 && lookups.length === 0 && !wantsAction &&
    CONCEPT_QUESTION.test(question) && !NEEDS_CATALOG.test(question);
  return loop(run, { messages, round: 0, references, wantsAction, writeFirst });
}

export function resumeAgent(
  run: Run,
  state: Progress & { pending: string[] },
  results: ActionResult[],
) {
  const messages = [...state.messages, ...state.pending.map((id) => actionMessage(id, results))];
  return loop(run, { messages, round: state.round, references: state.references, wantsAction: state.wantsAction });
}
