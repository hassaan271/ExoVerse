import Form from "next/form";
import styles from "./PlanetSearch.module.css";

export function PlanetSearch() {
  return (
    <Form action="/explore" role="search" className={styles.search}>
      <label htmlFor="planet-search" className="visually-hidden">
        Search by planet or star name
      </label>
      <input
        id="planet-search"
        name="q"
        type="search"
        placeholder="Search by planet or star name"
        autoComplete="off"
        className={styles.input}
      />
      <button type="submit" className={styles.submit}>
        Search
      </button>
    </Form>
  );
}
