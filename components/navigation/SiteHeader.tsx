"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LiquidIndicator } from "@/components/shared/LiquidIndicator";
import { Mark } from "@/components/shared/Mark";
import styles from "./SiteHeader.module.css";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/compare", label: "Compare" },
  { href: "/observatories", label: "Observatories" },
  { href: "/habitability", label: "Habitability" },
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
    <header className={`glass ${overlay ? styles.overlay : styles.header}`}>
      <Link href="/" className={styles.brand} aria-label="ExoVerse home">
        <Mark size={22} />
        <span className={styles.wordmark}>ExoVerse</span>
      </Link>
      <nav aria-label="Main">
        <ul className={styles.links}>
          <LiquidIndicator as="li" memory="site-nav" />
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
