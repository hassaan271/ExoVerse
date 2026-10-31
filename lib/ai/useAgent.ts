"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SECTION_PATHS } from "./actions";
import type { ActionResult, AgentEvent, IdentifiedAction, Reference } from "./agent";
import { getSelection, readAppContext, sendSystemCommand } from "./appContext";
import type { ChatMessage } from "./chat";

export interface ChatError {
  message: string;
  retryable: boolean;
}

export interface ActionNote {
  label: string;
  ok: boolean;
}

export interface AgentMessage extends ChatMessage {
  references?: Reference[];
  actions?: ActionNote[];
  /** Written during this visit, so it's still being revealed. Not stored. */
  live?: boolean;
}

const OFFLINE: ChatError = {
  message: "Couldn't reach ExoVerse. Check your connection and try again.",
  retryable: true,
};
const STORAGE_KEY = "exoverse-astronomer";
const CONFIRM_TIMEOUT_MS = 20_000;
const CONFIRM_POLL_MS = 150;

function loadHistory(): AgentMessage[] {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]") as AgentMessage[];
    return stored.map((message) => ({ ...message, live: false }));
  } catch {
    return [];
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True only once the page itself reports the requested state. */
async function confirmed(test: () => boolean, signal: AbortSignal) {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal.aborted) return false;
    if (test()) return true;
    await sleep(CONFIRM_POLL_MS);
  }
  return false;
}

export function useAgent() {
  const router = useRouter();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<ChatError | null>(null);
  const [restored, setRestored] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessages(loadHistory());
    setRestored(true);
    return () => request.current?.abort();
  }, []);

  // Not before restoring, or the empty first render would erase the saved chat.
  useEffect(() => {
    if (!restored) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // History still works for this page without storage.
    }
  }, [messages, restored]);

  const perform = useCallback(
    async (action: IdentifiedAction, signal: AbortSignal): Promise<ActionResult> => {
      const inSystem = (id: string) => window.location.pathname === `/explore/systems/${id}`;
      const show = (path: string) => router.push(path);
      let done: () => boolean;

      switch (action.type) {
        case "open_planet_in_3d":
          show(`/planets/${action.planetId}`);
          done = () => window.location.pathname === `/planets/${action.planetId}` && getSelection().planetId === action.planetId;
          break;
        case "highlight_planet":
          if (!inSystem(action.systemId)) show(`/explore/systems/${action.systemId}?planet=${action.planetId}`);
          else sendSystemCommand({ systemId: action.systemId, planetId: action.planetId });
          done = () => inSystem(action.systemId) && getSelection().planetId === action.planetId;
          break;
        case "show_planetary_system":
        case "zoom_to_system":
          if (inSystem(action.systemId)) sendSystemCommand({ systemId: action.systemId, zoomOut: true });
          else show(`/explore/systems/${action.systemId}`);
          done = () => inSystem(action.systemId) && getSelection().systemId === action.systemId;
          break;
        case "navigate_to_explorer": {
          const path = SECTION_PATHS[action.section];
          show(path);
          done = () => window.location.pathname === path;
          break;
        }
        case "open_comparison": {
          const [a, b] = action.planetIds;
          const mode = b === "earth" || b === "jupiter" ? b : "planets";
          show(`/compare?mode=${mode}&a=${a}${mode === "planets" ? `&b=${b}` : ""}`);
          done = () => getSelection().comparison?.join() === action.planetIds.join();
          break;
        }
        case "open_habitability_view":
          show(`/habitability?${action.planetId ? `planet=${action.planetId}` : `system=${action.systemId}`}`);
          done = () => window.location.pathname === "/habitability" && getSelection().systemId === action.systemId;
          break;
      }

      const ok = await confirmed(done, signal);
      return { id: action.id, ok, reason: ok ? undefined : signal.aborted ? "cancelled" : "timeout" };
    },
    [router],
  );

  /** One request to the server, read as a stream of events. */
  const exchange = useCallback(
    async (
      body: unknown,
      controller: AbortController,
      history: ChatMessage[],
      notes: ActionNote[],
    ): Promise<void> => {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        setError(data?.error ? { message: data.error, retryable: Boolean(data.retryable) } : OFFLINE);
        return;
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let paused: Extract<AgentEvent, { type: "actions" }> | null = null;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AgentEvent | { type: "error"; message: string; retryable: boolean };
          if (event.type === "status") setStatus(event.text);
          else if (event.type === "delta") {
            setStatus(null);
            setStreaming((text) => text + event.text);
          } else if (event.type === "reset") setStreaming("");
          else if (event.type === "actions") paused = event;
          else if (event.type === "error") setError({ message: event.message, retryable: event.retryable });
          else if (event.type === "done") {
            setStreaming("");
            setMessages([
              ...history,
              { role: "assistant", content: event.reply, references: event.references, actions: notes.length ? notes : undefined, live: true },
            ]);
          }
        }
      }

      if (paused) {
        setStatus("Preparing your planetary view...");
        const results: ActionResult[] = [];
        for (const action of paused.actions) {
          const result = await perform(action, controller.signal);
          results.push(result);
          notes.push({ label: action.label, ok: result.ok });
        }
        if (controller.signal.aborted) return;
        await exchange({ resume: paused.resume, results }, controller, history, notes);
      }
    },
    [perform],
  );

  const run = useCallback(
    async (history: AgentMessage[]) => {
      const controller = new AbortController();
      request.current = controller;
      setError(null);
      setStreaming("");
      setStatus("Thinking");
      const plain = history.map(({ role, content }) => ({ role, content }));
      try {
        await exchange({ messages: plain, context: readAppContext() }, controller, history, []);
      } catch {
        if (!controller.signal.aborted) setError(OFFLINE);
      } finally {
        if (request.current === controller) {
          request.current = null;
          setStatus(null);
          setStreaming("");
        }
      }
    },
    [exchange],
  );

  const sending = status !== null || streaming !== "";

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || request.current) return;
      const history: AgentMessage[] = [...messages, { role: "user", content }];
      setMessages(history);
      void run(history);
    },
    [messages, run],
  );

  const retry = useCallback(() => {
    if (!request.current) void run(messages);
  }, [messages, run]);

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setStatus(null);
    setStreaming("");
    setError({ message: "Stopped.", retryable: true });
  }, []);

  const reset = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setMessages([]);
    setStatus(null);
    setStreaming("");
    setError(null);
  }, []);

  return { messages, streaming, status, sending, error, send, retry, cancel, reset };
}
