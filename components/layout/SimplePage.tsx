import type { ReactNode } from "react";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { SiteFooter } from "./SiteFooter";
import styles from "./SimplePage.module.css";

export function SimplePage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.body}>{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
