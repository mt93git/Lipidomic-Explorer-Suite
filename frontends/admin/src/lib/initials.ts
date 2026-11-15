// Avatar initials: the first letter of up to two words that start with a letter ("Stephania (simulated)" → "S").
export function initials(name: string): string {
  const letters = name.normalize("NFC").split(/\s+/).map(word => Array.from(word)[0] ?? "").filter(first => /\p{L}/u.test(first));
  return letters.slice(0, 2).join("").toUpperCase() || "?";
}
