import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { UNKNOWN } from "@/lib/format";
import type { Fact } from "@/lib/planetFacts";
import styles from "./FactList.module.css";

function originNote(fact: Fact) {
  if (fact.origin === "calculated") return "Calculated by ExoVerse";
  if (fact.origin === "other-publication") {
    return `From ${fact.fill?.reference?.text ?? "another publication"}, not NASA's default set`;
  }
  return null;
}

/** One rule for every panel: NASA default values stand alone, others say why. */
export function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className={styles.facts}>
      {facts.map((fact) => {
        const note = originNote(fact);
        return (
          <div key={fact.label} className={styles.fact}>
            <dt>{fact.label}</dt>
            <dd data-unknown={fact.value === UNKNOWN || undefined}>
              {fact.numeric ? <AnimatedNumber value={fact.value} /> : fact.value}
              {note && <span className={styles.origin}>{note}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
