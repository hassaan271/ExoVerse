import { type ActionResult, type AgentClient, type AgentEvent, openContinuation, resumeAgent, startAgent } from "@/lib/ai/agent";
import { allowRequest, type ChatMessage, describeFailure, validateConversation } from "@/lib/ai/chat";
import { getFeatherlessClient, getFeatherlessModel } from "@/lib/ai/featherless.server";
import { astronomerPrompt, describeAppContext } from "@/lib/ai/prompt.server";
import { astronomerTools, mentionedPlanets } from "@/lib/ai/tools.server";

const MAX_BODY_BYTES = 300_000;

/** The question's planets, or for a follow-up, those of the last reply. */
function recentPlanets(messages: ChatMessage[]) {
  const named = mentionedPlanets(messages[messages.length - 1].content);
  if (named.length > 0 || messages.length < 2) return named;
  return mentionedPlanets(messages[messages.length - 2].content).slice(0, 2);
}

const failure = (status: number, error: string, retryable: boolean) =>
  Response.json({ error, retryable }, { status });

export async function POST(request: Request) {
  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!allowRequest(visitor)) {
    return failure(429, "Too many questions at once. Wait a minute and try again.", true);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return failure(413, "That request is too large.", false);
  }

  const body = await request.json().catch(() => null);
  const client = getFeatherlessClient();
  if (!client) return failure(503, "The AI Astronomer isn't set up yet.", false);
  const secret = process.env.FEATHERLESS_API_KEY as string;

  const continuation = body?.resume ? openContinuation(body.resume, secret) : null;
  if (body?.resume && !continuation) return failure(400, "That step expired. Ask again.", false);
  const conversation = continuation ? null : validateConversation(body);
  if (conversation && !conversation.ok) return failure(400, conversation.error, false);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AgentEvent | { type: "error"; message: string; retryable: boolean }) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The visitor cancelled. Nothing is left to tell them.
        }
      };
      const run = {
        client: client as unknown as AgentClient,
        model: getFeatherlessModel(),
        registry: astronomerTools,
        secret,
        emit,
        signal: request.signal,
      };
      try {
        if (continuation) {
          await resumeAgent(run, continuation, (body.results ?? []) as ActionResult[]);
        } else if (conversation?.ok) {
          await startAgent(
            run,
            [astronomerPrompt(), describeAppContext(body?.context)],
            conversation.messages,
            recentPlanets(conversation.messages).map((query) => ({ name: "search_exoplanet", args: { query } })),
          );
        }
      } catch (error) {
        if (!request.signal.aborted) {
          const result = describeFailure(error);
          // The status alone: provider errors can carry request details.
          console.error(`Agent request failed with status ${(error as { status?: number })?.status ?? "none"}`);
          emit({ type: "error", message: result.message, retryable: result.retryable });
        }
      }
      try {
        controller.close();
      } catch {
        // Already closed by a cancelled request.
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
