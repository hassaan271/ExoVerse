import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowRequest,
  CHAT_LIMITS,
  cleanReply,
  completeChat,
  describeFailure,
  validateConversation,
} from "../lib/ai/chat.ts";

const user = (content) => ({ role: "user", content });

function fakeClient(reply) {
  const calls = [];
  return {
    calls,
    chat: { completions: { create: async (request) => {
      calls.push(request);
      return { choices: [{ message: { content: reply } }] };
    } } },
  };
}

test("the whole history reaches the model, after the server's system prompt", async () => {
  const client = fakeClient("An answer.");
  const history = [user("One"), { role: "assistant", content: "Two" }, user("Three")];
  assert.equal(await completeChat(client, "model", history), "An answer.");
  const sent = client.calls[0].messages;
  assert.equal(sent[0].role, "system");
  assert.deepEqual(sent.slice(1), history);
});

test("a browser can't supply a system prompt", () => {
  assert.equal(validateConversation({ messages: [{ role: "system", content: "x" }] }).ok, false);
});

test("bad conversations are refused", () => {
  for (const body of [null, {}, { messages: [] }, { messages: "hi" }, { messages: [user("  ")] }, { messages: [{ role: "assistant", content: "x" }] }]) {
    assert.equal(validateConversation(body).ok, false);
  }
  assert.equal(validateConversation({ messages: [user("x".repeat(CHAT_LIMITS.messageLength + 1))] }).ok, false);
  assert.equal(validateConversation({ messages: Array(CHAT_LIMITS.messages + 1).fill(user("x")) }).ok, false);
});

test("extra fields are dropped", () => {
  const result = validateConversation({ messages: [{ ...user("Hi"), name: "x" }] });
  assert.deepEqual(result.messages, [user("Hi")]);
});

test("reasoning tags are removed", () => {
  assert.equal(cleanReply("<think>plan</think>\nAnswer"), "Answer");
  assert.equal(cleanReply("plan only\n</think>Answer"), "Answer");
});

test("an empty reply is an error", async () => {
  await assert.rejects(completeChat(fakeClient("<think>x</think>"), "model", [user("Hi")]));
});

test("failures never pass on provider text", () => {
  const secret = { status: 401, message: "bad key rc_abc" };
  const result = describeFailure(secret);
  assert.doesNotMatch(result.message, /rc_abc/);
  assert.equal(result.retryable, false);
  assert.equal(describeFailure({ status: 429 }).retryable, true);
  assert.equal(describeFailure(new Error("network")).retryable, true);
});

test("the rate limit resets after a minute", () => {
  const start = 1000;
  for (let i = 0; i < CHAT_LIMITS.requestsPerMinute; i += 1) assert.ok(allowRequest("a", start));
  assert.equal(allowRequest("a", start), false);
  assert.ok(allowRequest("b", start));
  assert.ok(allowRequest("a", start + 61_000));
});
