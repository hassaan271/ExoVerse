"use client";

/**
 * What the visitor is looking at. Pages report it here, and the AI reads it, so
 * application state stays the source of truth for words like "this planet".
 */
export interface PageSelection {
  planetId?: string | null;
  systemId?: string | null;
  comparison?: string[];
}

let selection: PageSelection = {};

export function reportSelection(next: PageSelection) {
  selection = next;
}

export function clearSelection() {
  selection = {};
}

export function getSelection() {
  return selection;
}

export function readAppContext() {
  const section = window.location.pathname.split("/")[1] || "home";
  return { section, ...selection };
}

/** Sent to a system view that is already open, which then handles it. */
export interface SystemCommand {
  systemId: string;
  planetId?: string;
  zoomOut?: boolean;
  handled: boolean;
}

export const SYSTEM_COMMAND = "exoverse:system-command";

export function sendSystemCommand(command: Omit<SystemCommand, "handled">) {
  const detail: SystemCommand = { ...command, handled: false };
  window.dispatchEvent(new CustomEvent(SYSTEM_COMMAND, { detail }));
  return detail.handled;
}
