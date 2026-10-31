import "server-only";

import OpenAI from "openai";

const BASE_URL = "https://api.featherless.ai/v1";
const DEFAULT_MODEL = "Qwen/Qwen3.8-27B";
const TIMEOUT_MS = 60_000;

let client: OpenAI | null = null;

/** Null until FEATHERLESS_API_KEY is set. The key never leaves the server. */
export function getFeatherlessClient() {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey) return null;
  client ??= new OpenAI({ baseURL: BASE_URL, apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

export function getFeatherlessModel() {
  return process.env.FEATHERLESS_MODEL || DEFAULT_MODEL;
}
