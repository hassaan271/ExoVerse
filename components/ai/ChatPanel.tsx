"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Reference } from "@/lib/ai/agent";
import { CHAT_LIMITS } from "@/lib/ai/chat";
import { useAgent } from "@/lib/ai/useAgent";
import styles from "./ChatPanel.module.css";

const SUGGESTIONS = [
  "Tell me about TOI-789 c",
  "Take me to the biggest exoplanet in the dataset",
  "Find the closest planet in the conservative habitable zone",
  "Compare Kepler-452 b with Earth",
];

/** Characters per second, and the longest the text may trail what has arrived. */
const MIN_REVEAL_SPEED = 90;
const MAX_REVEAL_LAG = 0.8;

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Names of planets the tools returned become links. Nothing else does. */
function MessageText({ content, references }: { content: string; references?: Reference[] }) {
  const parts = useMemo(() => {
    if (!references?.length) return [content];
    const names = [...references].sort((a, b) => b.name.length - a.name.length).map(({ name }) => escapeRegex(name));
    return content.split(new RegExp(`(${names.join("|")})`));
  }, [content, references]);

  return (
    <>
      {parts.map((part, index) => {
        const reference = references?.find(({ name }) => name === part);
        return reference ? (
          <Link key={index} href={reference.path} className={styles.reference}>{part}</Link>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
}

/** Reveals text evenly, however unevenly it arrives from the model. */
function SmoothText({ content, references }: { content: string; references?: Reference[] }) {
  const [shown, setShown] = useState(0);
  const position = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      position.current = content.length;
      setShown(content.length);
      return;
    }
    if (content.length < position.current) position.current = 0;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const left = content.length - position.current;
      if (left <= 0) return;
      const perSecond = Math.max(MIN_REVEAL_SPEED, left / MAX_REVEAL_LAG);
      position.current = Math.min(content.length, position.current + (perSecond * Math.min(now - last, 100)) / 1000);
      last = now;
      setShown(Math.floor(position.current));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [content]);

  return shown >= content.length ? <MessageText content={content} references={references} /> : <>{content.slice(0, shown)}</>;
}

export function ChatPanel({ className = "" }: { className?: string }) {
  const { messages, streaming, status, sending, error, send, retry, cancel, reset } = useAgent();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  // One slot holds a reply from first word to finish, so it never jumps.
  const finishing = !streaming && last?.live ? last : null;
  const settled = finishing ? messages.slice(0, -1) : messages;
  const tail = streaming || finishing?.content;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, streaming, status, error]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    send(draft);
    setDraft("");
  };

  return (
    <section className={`glass ${styles.panel} ${className}`} aria-label="Conversation">
      <div className={styles.log} role="log" aria-live="polite">
        {messages.length === 0 && !error && !sending && (
          <div className={styles.intro}>
            <p className={styles.empty}>Ask about any planet, or tell me what to show you.</p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" className={styles.suggestion} onClick={() => send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {settled.map((message, index) => (
          <div key={index} className={styles.entry} data-role={message.role}>
            {message.actions?.map((action) => (
              <p key={action.label} className={styles.action} data-ok={action.ok}>
                {action.ok ? `Opened: ${action.label}` : `Couldn't open: ${action.label}`}
              </p>
            ))}
            <p className={styles.message} data-role={message.role}>
              <MessageText content={message.content} references={message.references} />
            </p>
          </div>
        ))}
        {tail && (
          <div className={styles.entry} data-role="assistant">
            {finishing?.actions?.map((action) => (
              <p key={action.label} className={styles.action} data-ok={action.ok}>
                {action.ok ? `Opened: ${action.label}` : `Couldn't open: ${action.label}`}
              </p>
            ))}
            <p className={styles.message} data-role="assistant">
              <SmoothText content={tail} references={finishing?.references} />
            </p>
          </div>
        )}
        {status && <p className={styles.status} role="status">{status}</p>}
        {error && (
          <div className={styles.error} role="alert">
            <p>{error.message}</p>
            {error.retryable && (
              <button type="button" className="button button-secondary" onClick={retry}>
                Try again
              </button>
            )}
          </div>
        )}
        <div ref={end} />
      </div>

      <form className={styles.form} onSubmit={submit}>
        <input
          className="field"
          aria-label="Your question"
          placeholder="Ask the Astronomer"
          maxLength={CHAT_LIMITS.messageLength}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {sending ? (
          <button type="button" className="button button-secondary" onClick={cancel}>
            Stop
          </button>
        ) : (
          <button type="submit" className="button button-primary" disabled={!draft.trim()}>
            Send
          </button>
        )}
        {messages.length > 0 && !sending && (
          <button type="button" className="button button-secondary" onClick={reset}>
            New chat
          </button>
        )}
      </form>
    </section>
  );
}
