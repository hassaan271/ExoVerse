"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/shared/Mark";
import { ChatPanel } from "./ChatPanel";
import styles from "./ChatLauncher.module.css";

/**
 * The site-wide way into the AI chat. It sits in the root layout, so a
 * conversation survives moving between pages.
 */
export function ChatLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Mounted on first open, then only hidden, so closing keeps the conversation.
  const [started, setStarted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    popup.current?.querySelector("input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // /ask already is the chat.
  if (pathname === "/ask") return null;

  return (
    <>
      {started && (
        <div ref={popup} className={`glass ${styles.popup}`} role="dialog" aria-label="AI Astronomer" data-open={open} inert={!open}>
          <div className={styles.header}>
            <h2 className={styles.title}>AI Astronomer</h2>
            <button
              type="button"
              className={styles.close}
              aria-label="Close chat"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              Close
            </button>
          </div>
          <ChatPanel className={styles.panel} />
          <p className={styles.note}>Data comes from the catalog. Explanations come from an AI model and can be wrong.</p>
        </div>
      )}
      <button
        ref={button}
        type="button"
        className={`glass ${styles.launcher}`}
        aria-label={open ? "Close AI Astronomer" : "Open AI Astronomer"}
        aria-expanded={open}
        onClick={() => {
          setStarted(true);
          setOpen((value) => !value);
        }}
      >
        <Mark size={28} />
      </button>
    </>
  );
}
