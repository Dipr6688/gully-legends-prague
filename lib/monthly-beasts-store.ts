import type { CrownedMonthlyBeasts } from "./monthly-beasts";

export const MONTHLY_BEASTS_STORAGE_KEY = "gully-legends-prague-monthly-beasts-v1";
export const MONTHLY_BEASTS_UPDATED_EVENT = "gully-legends-monthly-beasts-updated";

export function loadCrownedMonthlyBeasts(): CrownedMonthlyBeasts[] {
  if (typeof window === "undefined") return [];

  try {
    const rawAwards = window.localStorage.getItem(MONTHLY_BEASTS_STORAGE_KEY);
    if (!rawAwards) return [];

    const parsed = JSON.parse(rawAwards);

    return Array.isArray(parsed) ? (parsed as CrownedMonthlyBeasts[]) : [];
  } catch {
    return [];
  }
}

export function saveCrownedMonthlyBeasts(awards: CrownedMonthlyBeasts[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(MONTHLY_BEASTS_STORAGE_KEY, JSON.stringify(awards));
  window.dispatchEvent(new Event(MONTHLY_BEASTS_UPDATED_EVENT));
}

export function saveCrownedMonthlyBeastSnapshot(
  snapshot: CrownedMonthlyBeasts
): CrownedMonthlyBeasts[] {
  const currentAwards = loadCrownedMonthlyBeasts();

  if (currentAwards.some((award) => award.monthKey === snapshot.monthKey)) {
    return currentAwards;
  }

  const nextAwards = [snapshot, ...currentAwards].sort((left, right) =>
    right.monthKey.localeCompare(left.monthKey)
  );

  saveCrownedMonthlyBeasts(nextAwards);

  return nextAwards;
}
