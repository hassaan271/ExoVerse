"use client";

import { createElement, useEffect, useRef } from "react";

const ACTIVE = '[aria-pressed="true"], [aria-current="page"], [aria-selected="true"]';

/** Where a remembered indicator last stood, so it can flow across routes. */
const remembered = new Map<string, string>();

/**
 * A drop of glass behind whichever control in its parent group is active. The
 * edge it travels towards moves first and the other catches up, so it stretches
 * and settles like liquid. CSS does the animating: this only writes the target.
 */
export function LiquidIndicator({ as = "span", memory }: { as?: "span" | "li"; memory?: string }) {
  const drop = useRef<HTMLElement>(null);

  useEffect(() => {
    const pill = drop.current;
    const group = pill?.parentElement;
    if (!pill || !group) return;

    group.dataset.liquid = "ready";
    let x = -1;
    let y = -1;

    const write = (left: number, right: number, top: number, bottom: number) => {
      pill.style.inset = `${top}px ${right}px ${bottom}px ${left}px`;
    };

    const place = () => {
      const active = group.querySelector<HTMLElement>(ACTIVE);
      if (!active || active.offsetParent === null) {
        pill.dataset.on = "false";
        return;
      }
      const box = group.getBoundingClientRect();
      const target = active.getBoundingClientRect();
      const left = target.left - box.left - group.clientLeft + group.scrollLeft;
      const top = target.top - box.top - group.clientTop + group.scrollTop;
      const right = group.clientWidth - left - target.width;
      const bottom = group.clientHeight - top - target.height;

      if (x >= 0) {
        pill.dataset.x = left >= x ? "forward" : "back";
        pill.dataset.y = top >= y ? "forward" : "back";
      }
      x = left;
      y = top;
      pill.dataset.on = "true";
      write(left, right, top, bottom);
      if (memory) remembered.set(memory, pill.style.inset);
    };

    const previous = memory ? remembered.get(memory) : undefined;
    if (previous) {
      pill.style.transition = "none";
      pill.style.inset = previous;
      pill.dataset.on = "true";
      void pill.offsetWidth;
      pill.style.transition = "";
      x = parseFloat(previous.split(" ")[3] ?? "0");
      y = parseFloat(previous.split(" ")[0] ?? "0");
    } else {
      pill.style.transition = "none";
      place();
      void pill.offsetWidth;
      pill.style.transition = "";
    }
    const opening = requestAnimationFrame(place);

    const changes = new MutationObserver(place);
    changes.observe(group, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-pressed", "aria-current", "aria-selected"],
    });
    const resized = new ResizeObserver(place);
    resized.observe(group);
    document.fonts?.ready.then(place);

    return () => {
      cancelAnimationFrame(opening);
      changes.disconnect();
      resized.disconnect();
      delete group.dataset.liquid;
    };
  }, [memory]);

  return createElement(as, { ref: drop, className: "liquid-drop", "aria-hidden": true, "data-on": "false" });
}
