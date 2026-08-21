import type {
  AchievementCategory,
  AchievementIconKey,
  AchievementTier,
  AchievementUnlock,
  CareerMilestoneProgress,
  PlayerAchievements
} from "./player-achievements";

export const ACHIEVEMENT_ICON_PATHS: Record<AchievementIconKey, string> = {
  matches: "/ui/achievements/achievement-matches-v2.png",
  runs: "/ui/achievements/achievement-runs-v2.png",
  wickets: "/ui/achievements/achievement-wickets-v2.png",
  catches: "/ui/achievements/achievement-catches-v2.png",
  "run-outs": "/ui/achievements/achievement-run-outs-v2.png",
  stumpings: "/ui/achievements/achievement-stumpings-v2.png",
  sixes: "/ui/achievements/achievement-sixes-v2.png",
  pom: "/ui/achievements/achievement-pom-v2.png",
  "half-century": "/ui/achievements/achievement-half-century-v2.png",
  century: "/ui/achievements/achievement-century-v2.png",
  "hat-trick": "/ui/achievements/achievement-hat-trick-v2.png",
  "three-wicket-match": "/ui/achievements/achievement-three-wicket-v2.png",
  "five-wicket-match": "/ui/achievements/achievement-five-wicket-v2.png"
} as const;

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  matches: "Matchday",
  batting: "Batting",
  bowling: "Bowling",
  fielding: "Fielding",
  pom: "Star Player"
} as const;

const CATEGORY_ORDER: AchievementCategory[] = [
  "matches",
  "batting",
  "bowling",
  "fielding",
  "pom"
];

const TIER_ORDER: AchievementTier[] = ["legend", "platinum", "gold", "silver", "bronze"];

export type TrophyCabinetSection = {
  category: AchievementCategory;
  label: string;
  unlocks: AchievementUnlock[];
};

export type TrophyCabinetViewModel = {
  featuredUnlocks: AchievementUnlock[];
  sections: TrophyCabinetSection[];
  visibleNextMilestones: CareerMilestoneProgress[];
  hasUnknownProgress: boolean;
};

function compareByTier(left: AchievementUnlock, right: AchievementUnlock): number {
  const leftTier = left.definition.tier ?? "bronze";
  const rightTier = right.definition.tier ?? "bronze";
  const tierDifference = TIER_ORDER.indexOf(leftTier) - TIER_ORDER.indexOf(rightTier);

  if (tierDifference !== 0) return tierDifference;
  if (left.definition.threshold !== right.definition.threshold) {
    return right.definition.threshold - left.definition.threshold;
  }

  return left.definition.title.localeCompare(right.definition.title);
}

export function getAchievementIconPath(iconKey: AchievementIconKey): string {
  return ACHIEVEMENT_ICON_PATHS[iconKey];
}

export function formatAchievementUnlockMeta(unlock: AchievementUnlock): string {
  const parts: string[] = [];

  if (typeof unlock.matchNumber === "number") {
    parts.push(`Game #${unlock.matchNumber}`);
  }

  if (unlock.matchDate) {
    parts.push(unlock.matchDate);
  }

  return parts.length > 0 ? `Unlocked in ${parts.join(" - ")}` : "Unlocked";
}

export function getMilestoneProgressPercent(progress: CareerMilestoneProgress): number {
  if (!progress.isReliable || progress.currentValue === null || progress.targetValue <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (progress.currentValue / progress.targetValue) * 100));
}

export function formatMilestoneProgressLabel(progress: CareerMilestoneProgress): string {
  if (!progress.isReliable || progress.currentValue === null) {
    return "Progress unknown from legacy scorecards";
  }

  return `${progress.currentValue}/${progress.targetValue}`;
}

export function buildTrophyCabinetViewModel(
  achievements: PlayerAchievements
): TrophyCabinetViewModel {
  const featuredUnlocks = achievements.unlocked
    .filter(
      (unlock) =>
        unlock.definition.type === "special_achievement" ||
        unlock.definition.tier === "legend" ||
        unlock.definition.tier === "platinum"
    )
    .sort(compareByTier)
    .slice(0, 3);
  const featuredIds = new Set(
    featuredUnlocks.map((unlock) => `${unlock.playerId}:${unlock.definition.id}`)
  );
  const sections = CATEGORY_ORDER.map((category) => ({
    category,
    label: ACHIEVEMENT_CATEGORY_LABELS[category],
    unlocks: achievements.unlocked
      .filter((unlock) => unlock.definition.category === category)
      .filter((unlock) => !featuredIds.has(`${unlock.playerId}:${unlock.definition.id}`))
      .sort(compareByTier)
  })).filter((section) => section.unlocks.length > 0);

  return {
    featuredUnlocks,
    sections,
    visibleNextMilestones: achievements.nextMilestones
      .filter((progress) => progress.isReliable)
      .slice(0, 5),
    hasUnknownProgress: achievements.locked.some((progress) => !progress.isReliable)
  };
}
