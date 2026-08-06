import { calculateDisplayedRating } from "./progression";
import type { Player, PlayerPlayStyle, RatingKey } from "./types/player";

export const PLAY_STYLE_LABELS = {
  all: "ALL STYLES",
  batting: "BATTING FOCUS",
  pace: "PACE & SEAM",
  spin: "SPIN",
  utility: "BALANCED / UTILITY"
} as const satisfies Record<PlayerPlayStyle | "all", string>;

export const PLAYER_SORT_LABELS = {
  roster: "ROSTER ORDER",
  name: "NAME A-Z",
  level: "LEVEL",
  xp: "XP",
  bladePower: "BLADE POWER",
  deliveryThreat: "DELIVERY THREAT",
  fieldReflex: "FIELD REFLEX"
} as const;

export type PlayerBrowserStyle = PlayerPlayStyle | "all";
export type PlayerBrowserSort = keyof typeof PLAYER_SORT_LABELS;

export type PlayerBrowserOptions = {
  style: PlayerBrowserStyle;
  search: string;
  sort: PlayerBrowserSort;
};

export const DEFAULT_PLAYER_BROWSER_OPTIONS: PlayerBrowserOptions = {
  style: "all",
  search: "",
  sort: "roster"
};

function normaliseSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function compareNames(left: Player, right: Player): number {
  return left.name.localeCompare(right.name);
}

function getDisplayedPowerSortValue(player: Player, ratingKey: RatingKey): number | null {
  return calculateDisplayedRating(
    player.ratings[ratingKey],
    player.stats.matches
  ).value;
}

function comparePower(left: Player, right: Player, ratingKey: RatingKey): number {
  const leftValue = getDisplayedPowerSortValue(left, ratingKey);
  const rightValue = getDisplayedPowerSortValue(right, ratingKey);

  if (leftValue === null && rightValue === null) return compareNames(left, right);
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;
  if (rightValue !== leftValue) return rightValue - leftValue;

  return compareNames(left, right);
}

export function getVisiblePlayers({
  players,
  options
}: {
  players: Player[];
  options: PlayerBrowserOptions;
}): Player[] {
  const searchTerm = normaliseSearch(options.search);
  const activePlayers = players.filter((player) => player.isActive !== false);
  const filteredPlayers = activePlayers
    .filter((player) =>
      options.style === "all" ? true : player.playStyles.includes(options.style)
    )
    .filter((player) => {
      if (!searchTerm) return true;

      return [player.name, player.cardTitle, player.role].some((value) =>
        value.toLocaleLowerCase().includes(searchTerm)
      );
    });

  if (options.sort === "roster") return filteredPlayers;

  return [...filteredPlayers].sort((left, right) => {
    if (options.sort === "name") return compareNames(left, right);
    if (options.sort === "level") {
      if (right.level !== left.level) return right.level - left.level;
      if (right.xp !== left.xp) return right.xp - left.xp;
      return compareNames(left, right);
    }
    if (options.sort === "xp") {
      if (right.xp !== left.xp) return right.xp - left.xp;
      return compareNames(left, right);
    }
    if (options.sort === "bladePower") return comparePower(left, right, "batting");
    if (options.sort === "deliveryThreat") {
      return comparePower(left, right, "bowling");
    }

    return comparePower(left, right, "fielding");
  });
}

export function formatVisibleWarriorCount({
  count,
  style,
  search
}: {
  count: number;
  style: PlayerBrowserStyle;
  search: string;
}): string {
  const warriorLabel = count === 1 ? "WARRIOR" : "WARRIORS";

  if (normaliseSearch(search) && style === "all") {
    return `${count} ${warriorLabel} FOUND`;
  }

  if (style !== "all") {
    return `${count} ${PLAY_STYLE_LABELS[style]} ${warriorLabel}`;
  }

  return `${count} ${warriorLabel}`;
}
