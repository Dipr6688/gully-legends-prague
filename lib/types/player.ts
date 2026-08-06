export type RatingKey = "batting" | "bowling" | "fielding";

export type PlayerRatings = Record<RatingKey, number>;

export type PlayerStats = {
  matches: number;
  runs: number;
  wickets: number;
  catches: number;
  runOuts: number;
  hatTricks: number;
};

export type PlayerTag = "pace" | "spin" | "batting" | "fielding" | "all-rounder";

export type PlayerPlayStyle = "batting" | "pace" | "spin" | "utility";

export type PlayerProfile = {
  id: string;
  slug: string;
  name: string;
  cardTitle: string;
  cardImage: string;
  role: string;
  playStyles: PlayerPlayStyle[];
  battingProfile: string;
  bowlingProfile: string;
  fieldingProfile: string;
  heroSummary: string;
  specialMoveName: string;
  specialMoveDescription: string;
  isActive?: boolean;
  funTrait: string;
  avatar: string;
  avatarDescription?: string;
  tags: PlayerTag[];
  accent: "green" | "orange" | "yellow" | "violet";
  accentColor: string;
  level: number;
  xp: number;
  ratings: PlayerRatings;
  stats: PlayerStats;
};

export type Player = PlayerProfile;
