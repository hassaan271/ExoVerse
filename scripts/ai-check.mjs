/**
 * Live connection test: a question, then a follow-up that only makes sense with
 * the first in context. Prints replies and error statuses, never the key.
 *
 *   npm run ai:check
 */
import OpenAI from "openai";
import { completeChat } from "../lib/ai/chat.ts";

const apiKey = process.env.FEATHERLESS_API_KEY;
const model = process.env.FEATHERLESS_MODEL || "Qwen/Qwen3.8-27B";

if (!apiKey) {
  console.error("FEATHERLESS_API_KEY isn't set. Add it to .env.local first.");
  process.exit(1);
}

const client = new OpenAI({ baseURL: "https://api.featherless.ai/v1", apiKey, timeout: 120_000 });
const history = [{ role: "user", content: "In one sentence, what is an exoplanet?" }];

try {
  console.log(`Model: ${model}`);
  const first = await completeChat(client, model, history);
  console.log(`\nFirst reply:\n${first}`);

  history.push(
    { role: "assistant", content: first },
    { role: "user", content: "In one sentence, how is that kind of object usually detected?" },
  );
  const second = await completeChat(client, model, history);
  console.log(`\nFollow-up reply:\n${second}`);
  console.log("\nAuthentication succeeded and the model answered both questions.");
} catch (error) {
  console.error(`Request failed with status ${error?.status ?? "none"}.`);
  process.exit(1);
}
