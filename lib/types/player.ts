export type RatingKey = "batting" | "bowling" | "fielding";

export type PlayerRatings = Record<RatingKey, number>;

export type PlayerStats = {
  matches: number;
  runs: number;
  wickets: number;
  catches: number;
};

export type PlayerTag = "pace" | "spin" | "batting" | "fielding" | "all-rounder";

export type PlayerProfile = {
  id: string;
  name: string;
  cardTitle: string;
  cardImage: string;
  role: string;
  battingProfile: string;
  bowlingProfile: string;
  fieldingProfile: string;
  heroSummary: string;
  specialMoveName: string;
  specialMoveDescription: string;
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
