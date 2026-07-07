// Detection du compte officiel d'une marque (champ explicite, saisi par l'utilisateur).
// Un Post dont l'auteur est un handle officiel est de l'AUTO-PROMO : on le montre
// (marque "official") mais il ne compte pas comme perception tierce (confidence.ts).

export function normHandle(s: string): string {
  return s.replace(/^@+/, "").trim().toLowerCase();
}

// Parse une liste CSV de handles ("ChartAcademyx, @autre") en tableau normalise-affichable.
export function parseHandles(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((h) => h.replace(/^@+/, "").trim())
    .filter(Boolean);
}

export function isOfficialAuthor(author: string, handles: string[]): boolean {
  if (!author || handles.length === 0) return false;
  const a = normHandle(author);
  return handles.some((h) => normHandle(h) === a);
}
