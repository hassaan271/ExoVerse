"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { LandingControl } from "@/components/three/LandingScene";
import styles from "./CinematicIntro.module.css";

const LandingScene = dynamic(() => import("@/components/three/LandingScene"), {
  ssr: false,
});

/**
 * intro     the 3D opening plays alone
 * arriving  the planet is leaving and the interface starts to appear
 * arrived   the page is fully usable
 */
export type IntroPhase = "intro" | "arriving" | "arrived";

/** Long enough for a first-visit shader compile on a modest GPU. */
const READY_TIMEOUT_MS = 12000;

const IntroPhaseContext = createContext<IntroPhase>("arrived");
export const useIntroPhase = () => useContext(IntroPhaseContext);

/** Leaving and returning to the landing page in one visit skips the intro. */
let playedThisVisit = false;

function WhenUnavailable({ onUnavailable }: { onUnavailable: () => void }) {
  useEffect(onUnavailable, [onUnavailable]);
  return null;
}

interface CinematicIntroProps {
  /** Shown only if WebGL is unavailable. */
  fallbackSrc: string;
  /** Content placed over the galaxy. Read the phase with useIntroPhase. */
  children: ReactNode;
  /** The rest of the page, kept out of reach until the intro has finished. */
  after?: ReactNode;
}

export function CinematicIntro({ fallbackSrc, children, after }: CinematicIntroProps) {
  const [phase, setPhase] = useState<IntroPhase>(() => (playedThisVisit ? "arrived" : "intro"));
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [playIntro] = useState(() => !playedThisVisit);
  const [motion, setMotion] = useState<boolean | null>(null);
  const control = useRef<LandingControl>({ skip: false });
  const stage = useRef<HTMLDivElement>(null);

  const finish = useCallback(() => {
    playedThisVisit = true;
    setPhase("arrived");
  }, []);

  const onReveal = useCallback(() => {
    setPhase((current) => (current === "intro" ? "arriving" : current));
  }, []);

  const onReady = useCallback(() => setReady(true), []);

  const onUnavailable = useCallback(() => {
    setUnavailable(true);
    finish();
  }, [finish]);

  const skip = useCallback(() => {
    control.current.skip = true;
    finish();
  }, [finish]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMotion(!reduced);
    if (reduced) finish();
  }, [finish]);

  useEffect(() => {
    if (phase === "arrived" || ready) return;
    const timer = window.setTimeout(skip, READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, ready, skip]);

  // The page below the hero stays out of reach until the entrance is over.
  useEffect(() => {
    if (phase === "arrived") return;
    const { documentElement } = document;
    documentElement.style.overflow = "hidden";
    return () => {
      documentElement.style.overflow = "";
    };
  }, [phase]);

  return (
    <IntroPhaseContext.Provider value={phase}>
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <div ref={stage} className={styles.page} data-phase={phase} data-ready={ready}>
        <div className={styles.backdrop} aria-hidden="true">
          {unavailable && (
            <Image src={fallbackSrc} alt="" fill sizes="100vw" className={styles.still} />
          )}
          {motion !== null && (
            <div className={styles.scene}>
              <LandingScene
                playIntro={playIntro && motion}
                motion={motion}
                control={control}
                stage={stage}
                onReady={onReady}
                onReveal={onReveal}
                onFinished={finish}
                fallback={<WhenUnavailable onUnavailable={onUnavailable} />}
              />
            </div>
          )}
          <div className={styles.veil} />
        </div>

        <section className={styles.stage}>
          <div className={styles.title} aria-hidden="true">
            ExoVerse
          </div>

          <div className={styles.content} inert={phase === "intro"}>
            {children}
          </div>

          {phase === "intro" && !ready && (
            <div className={styles.progress} role="status">
              <span className="visually-hidden">Loading</span>
            </div>
          )}

          {phase !== "arrived" && (
            <button type="button" className={styles.skip} onClick={skip}>
              Skip intro
            </button>
          )}
        </section>

        {after && (
          <div className={styles.after} inert={phase !== "arrived"}>
            {after}
          </div>
        )}
      </div>
    </IntroPhaseContext.Provider>
  );
}
