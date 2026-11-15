import styles from "./visual-map.module.css";

export type StatTile = { value: string | number; label: string; tone?: "bad" | "warn" | "good" };

// A row of large figures (injections, samples, run time…) above a batch's plate, as in the prototype.
export function StatTiles({ tiles, label }: { tiles: StatTile[]; label: string }) {
  return <ul className={styles.tiles} aria-label={label}>
    {tiles.map(tile => <li key={tile.label} className={`${styles.tile} ${tile.tone ? styles[tile.tone] : ""}`}>
      <strong>{tile.value}</strong><span>{tile.label}</span>
    </li>)}
  </ul>;
}
