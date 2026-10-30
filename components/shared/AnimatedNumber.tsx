"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import styles from "./AnimatedNumber.module.css";

const STRIP = "0\n1\n2\n3\n4\n5\n6\n7\n8\n9";
const NUMERIC = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?(?:[eE][+-]?\d+)?)(.*)$/s;
const STAGGER_MS = 45;
const isDigit = (character: string) => character >= "0" && character <= "9";

interface AnimatedNumberProps {
  /** A number to format, or text already formatted such as "1.63 × Earth". */
  value: number | string;
  /** Decimal places, for a number value. */
  precision?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
  /** Change this to roll again even if the text is identical. */
  animationKey?: string;
  /** "instant" shows the final value at once. "system" follows the OS setting. */
  reducedMotion?: "system" | "instant";
}

function toText(value: number | string, precision?: number) {
  if (typeof value === "string") return value;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision ?? 6,
  });
}

/**
 * Each digit is one element holding a 0 to 9 strip, moved with a CSS transform,
 * so a value costs a few DOM nodes and no React renders. Punctuation, signs and
 * units stay still. The strip's final position is always the true digit, so a
 * throttled or hidden tab can only skip the motion, never show a wrong number.
 */
export function AnimatedNumber({
  value,
  precision,
  prefix = "",
  suffix = "",
  duration = 850,
  delay = 0,
  animationKey,
  reducedMotion = "system",
}: AnimatedNumberProps) {
  const text = `${prefix}${toText(value, precision)}${suffix}`;
  const holder = useRef<HTMLSpanElement>(null);

  const parts = useMemo(() => {
    const match = text.match(NUMERIC);
    return match
      ? { before: match[1], number: [...match[2]], after: match[3] }
      : null;
  }, [text]);

  useLayoutEffect(() => {
    const strips = holder.current?.querySelectorAll<HTMLElement>("[data-digit]");
    if (!strips?.length) return;

    const instant =
      reducedMotion === "instant" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    strips.forEach((strip) => {
      strip.style.transition = "none";
      if (!instant) strip.style.transform = "translateY(0)";
    });
    if (instant) return;

    // Reading layout commits the zero position, so the roll starts from it.
    void holder.current?.offsetHeight;

    strips.forEach((strip, index) => {
      strip.style.transition = `transform ${duration}ms cubic-bezier(0.22, 0.8, 0.2, 1) ${delay + index * STAGGER_MS}ms`;
      strip.style.transform = `translateY(calc(${strip.dataset.digit} * -1 * var(--digit-height)))`;
    });
  }, [animationKey, delay, duration, reducedMotion, text]);

  if (!parts) return <>{text}</>;

  return (
    <span ref={holder} className={styles.number}>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true" className={styles.roll}>
        {parts.before}
        {parts.number.map((character, index) =>
          isDigit(character) ? (
            <span key={index} className={styles.digit}>
              <span
                data-digit={character}
                className={styles.strip}
                style={{ transform: `translateY(calc(${character} * -1 * var(--digit-height)))` }}
              >
                {STRIP}
              </span>
            </span>
          ) : (
            <span key={index}>{character}</span>
          ),
        )}
        {parts.after}
      </span>
    </span>
  );
}
