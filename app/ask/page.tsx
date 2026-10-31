import type { Metadata } from "next";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "AI Astronomer | ExoVerse",
  description: "Ask questions about exoplanets and how they're found.",
};

export default function AskPage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <h1 className={styles.title}>AI Astronomer</h1>
        <p className={styles.note}>
          Data comes from the catalog. Explanations come from an AI model and can be wrong.
        </p>
        <ChatPanel />
      </main>
    </>
  );
}
