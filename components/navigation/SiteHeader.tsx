"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./SiteHeader.module.css";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/compare", label: "Compare" },
  { href: "/about", label: "About" },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/explore") {
    return pathname.startsWith("/explore") || pathname.startsWith("/planets");
  }
  return pathname.startsWith(href);
}

/** `overlay` sits on the landing hero, which carries the wordmark itself. */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const pathname = usePathname();

  return (
    <header className={overlay ? `glass ${styles.overlay}` : styles.header}>
      <Link href="/" className={styles.brand} aria-label="ExoVerse home">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="11" fill="currentColor" />
          <circle cx="20" cy="12.6" r="11" fill="var(--black)" />
        </svg>
        <span className={styles.wordmark}>EXOVERSE</span>
      </Link>
      <nav aria-label="Main">
        <ul className={styles.links}>
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={styles.link}
                aria-current={isCurrent(pathname, href) ? "page" : undefined}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
