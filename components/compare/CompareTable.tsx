import type { ComparedValue, ComparisonRow } from "@/lib/compare";
import type { PlanetSummary } from "@/types/planet";
import styles from "./CompareTable.module.css";

const NOTE: Partial<Record<ComparedValue["origin"], string>> = {
  "other-publication": "Not NASA's default set",
  calculated: "Calculated",
};

function Value({ value }: { value: ComparedValue }) {
  const note = NOTE[value.origin];
  return (
    <>
      <span data-missing={value.value === null || undefined}>{value.text}</span>
      {note && <span className={styles.note}>{note}</span>}
    </>
  );
}

export function CompareTable({
  a,
  b,
  rows,
}: {
  a: PlanetSummary;
  b: PlanetSummary;
  rows: ComparisonRow[];
}) {
  return (
    <div className={`plate ${styles.wrap}`}>
      <table className={styles.table}>
        <caption className="visually-hidden">
          Measurements of {a.name} and {b.name}, with the difference between them
        </caption>
        <thead>
          <tr>
            <th scope="col">Parameter</th>
            <th scope="col">{a.name}</th>
            <th scope="col">{b.name}</th>
            <th scope="col">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td data-label={a.name}>
                <Value value={row.a} />
              </td>
              <td data-label={b.name}>
                <Value value={row.b} />
              </td>
              <td data-label="Difference" className={styles.difference}>
                {row.difference ? (
                  <>
                    <span>{row.difference.sentence}</span>
                    <span className={styles.note}>Difference: {row.difference.absolute}</span>
                    <span className={styles.bars} aria-hidden="true">
                      <span style={{ width: `${row.difference.shareA * 100}%` }} />
                      <span style={{ width: `${row.difference.shareB * 100}%` }} />
                    </span>
                  </>
                ) : (
                  row.reason && <span className={styles.note}>{row.reason}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
