import {
  createCrownedMonthlyBeasts,
  type CrownedBeastWinner,
  type CrownedMonthlyBeasts,
  type MonthlyBeastCrown
} from "./monthly-beasts";
import type { MatchRecord } from "./types/match";

export const MONTHLY_BEASTS_STORAGE_KEY = "gully-legends-prague-monthly-beasts-v2";
export const LEGACY_MONTHLY_BEASTS_STORAGE_KEY =
  "gully-legends-prague-monthly-beasts-v1";
export const MONTHLY_BEASTS_UPDATED_EVENT = "gully-legends-monthly-beasts-updated";

export type CrownMonthInput = {
  monthKey: string;
  matches: MatchRecord[];
  crownedAt?: string;
  crownedBy?: string | null;
};

export type MonthlyBeastCrownRepository = {
  listCrowns(): MonthlyBeastCrown[];
  getActiveCrown(monthKey: string): MonthlyBeastCrown | null;
  crownMonth(input: CrownMonthInput): MonthlyBeastCrown;
  reopenMonth(monthKey: string, reopenedBy?: string | null): void;
  listCrownHistory(monthKey: string): MonthlyBeastCrown[];
};

type LegacyCrownedMonthlyBeasts = {
  monthKey: string;
  crownedAt: string;
  battingWinners: CrownedBeastWinner[];
  bowlingWinners: CrownedBeastWinner[];
  fieldingWinners: CrownedBeastWinner[];
};

function dispatchMonthlyBeastsUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MONTHLY_BEASTS_UPDATED_EVENT));
  }
}

function isLegacyCrown(value: unknown): value is LegacyCrownedMonthlyBeasts {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<LegacyCrownedMonthlyBeasts>;

  return (
    typeof candidate.monthKey === "string" &&
    typeof candidate.crownedAt === "string" &&
    Array.isArray(candidate.battingWinners) &&
    Array.isArray(candidate.bowlingWinners) &&
    Array.isArray(candidate.fieldingWinners)
  );
}

function winnersToSnapshot(winners: CrownedBeastWinner[]) {
  return {
    playerIds: winners.map((winner) => winner.playerId),
    xp: winners[0]?.categoryXp ?? 0
  };
}

function migrateLegacyCrowns(values: unknown[]): MonthlyBeastCrown[] {
  return values.filter(isLegacyCrown).map((legacy, index) => ({
    id: `monthly-beasts-${legacy.monthKey}-v1-legacy-${index}`,
    monthKey: legacy.monthKey,
    batting: winnersToSnapshot(legacy.battingWinners),
    bowling: winnersToSnapshot(legacy.bowlingWinners),
    fielding: winnersToSnapshot(legacy.fieldingWinners),
    status: "active",
    crownedAt: legacy.crownedAt,
    crownedBy: "local-admin",
    revokedAt: null,
    revokedBy: null,
    version: 1
  }));
}

function normalizeCrowns(values: unknown[]): MonthlyBeastCrown[] {
  return values
    .filter((value): value is MonthlyBeastCrown => {
      if (!value || typeof value !== "object") return false;

      const candidate = value as Partial<MonthlyBeastCrown>;

      return (
        typeof candidate.id === "string" &&
        typeof candidate.monthKey === "string" &&
        typeof candidate.crownedAt === "string" &&
        typeof candidate.version === "number" &&
        (candidate.status === "active" || candidate.status === "revoked") &&
        Boolean(candidate.batting) &&
        Boolean(candidate.bowling) &&
        Boolean(candidate.fielding)
      );
    })
    .map((crown) => ({
      ...crown,
      crownedBy: crown.crownedBy ?? null,
      revokedAt: crown.revokedAt ?? null,
      revokedBy: crown.revokedBy ?? null
    }));
}

function readJsonArray(key: string): unknown[] {
  if (typeof window === "undefined") return [];

  try {
    const rawAwards = window.localStorage.getItem(key);
    if (!rawAwards) return [];

    const parsed = JSON.parse(rawAwards);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCrowns(crowns: MonthlyBeastCrown[]) {
  if (typeof window === "undefined") return;

  const sortedCrowns = [...crowns].sort((left, right) => {
    if (right.monthKey !== left.monthKey) return right.monthKey.localeCompare(left.monthKey);

    return right.version - left.version;
  });

  window.localStorage.setItem(MONTHLY_BEASTS_STORAGE_KEY, JSON.stringify(sortedCrowns));
  dispatchMonthlyBeastsUpdate();
}

export class LocalMonthlyBeastCrownRepository
  implements MonthlyBeastCrownRepository
{
  listCrowns(): MonthlyBeastCrown[] {
    const currentCrowns = normalizeCrowns(readJsonArray(MONTHLY_BEASTS_STORAGE_KEY));

    if (currentCrowns.length > 0) return currentCrowns;

    const legacyCrowns = migrateLegacyCrowns(
      readJsonArray(LEGACY_MONTHLY_BEASTS_STORAGE_KEY)
    );

    if (legacyCrowns.length > 0) {
      saveCrowns(legacyCrowns);
    }

    return legacyCrowns;
  }

  getActiveCrown(monthKey: string): MonthlyBeastCrown | null {
    return (
      this.listCrowns()
        .filter((crown) => crown.monthKey === monthKey && crown.status === "active")
        .sort((left, right) => right.version - left.version)[0] ?? null
    );
  }

  crownMonth({
    monthKey,
    matches,
    crownedAt = new Date().toISOString(),
    crownedBy = "local-admin"
  }: CrownMonthInput): MonthlyBeastCrown {
    const currentCrowns = this.listCrowns();
    const history = currentCrowns.filter((crown) => crown.monthKey === monthKey);
    const version =
      history.reduce((highest, crown) => Math.max(highest, crown.version), 0) + 1;
    const nextCrown = createCrownedMonthlyBeasts({
      matches,
      monthKey,
      crownedAt,
      crownedBy,
      version
    });
    const nextCrowns = [
      nextCrown,
      ...currentCrowns.map((crown) =>
        crown.monthKey === monthKey && crown.status === "active"
          ? {
              ...crown,
              status: "revoked" as const,
              revokedAt: crownedAt,
              revokedBy: crownedBy
            }
          : crown
      )
    ];

    saveCrowns(nextCrowns);

    return nextCrown;
  }

  reopenMonth(monthKey: string, reopenedBy = "local-admin"): void {
    const reopenedAt = new Date().toISOString();
    const nextCrowns = this.listCrowns().map((crown) =>
      crown.monthKey === monthKey && crown.status === "active"
        ? {
            ...crown,
            status: "revoked" as const,
            revokedAt: reopenedAt,
            revokedBy: reopenedBy
          }
        : crown
    );

    saveCrowns(nextCrowns);
  }

  listCrownHistory(monthKey: string): MonthlyBeastCrown[] {
    return this.listCrowns()
      .filter((crown) => crown.monthKey === monthKey)
      .sort((left, right) => right.version - left.version);
  }
}

export const monthlyBeastCrownRepository: MonthlyBeastCrownRepository =
  new LocalMonthlyBeastCrownRepository();

export function loadCrownedMonthlyBeasts(): CrownedMonthlyBeasts[] {
  return monthlyBeastCrownRepository.listCrowns();
}

export function saveCrownedMonthlyBeasts(awards: CrownedMonthlyBeasts[]) {
  saveCrowns(awards);
}

export function saveCrownedMonthlyBeastSnapshot(
  snapshot: CrownedMonthlyBeasts
): CrownedMonthlyBeasts[] {
  const currentAwards = monthlyBeastCrownRepository.listCrowns();
  const nextAwards = [
    snapshot,
    ...currentAwards.map((award) =>
      award.monthKey === snapshot.monthKey && award.status === "active"
        ? {
            ...award,
            status: "revoked" as const,
            revokedAt: snapshot.crownedAt,
            revokedBy: snapshot.crownedBy ?? "local-admin"
          }
        : award
    )
  ];

  saveCrowns(nextAwards);

  return nextAwards;
}
