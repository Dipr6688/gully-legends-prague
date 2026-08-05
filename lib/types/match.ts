export type MatchStatus = "draft" | "submitted" | "finalised";

export type BowlingOver = {
  runsConceded: number;
  wickets: number;
  maiden: boolean;
};

export type TeamId = "teamA" | "teamB";

export type PlayerMatchPerformance = {
  playerId: string;
  teamId: TeamId;
  played: boolean;
  teamWon: boolean;
  playerOfMatch: boolean;
  didBat: boolean;
  runs: number;
  wasOut: boolean;
  wickets: number;
  overs: BowlingOver[];
  hatTricks: number;
  catches: number;
  runOuts: number;
  stumpings?: number;
};

export type MockMatchFormValues = {
  matchDate: string;
  matchName: string;
  teamAName: string;
  teamBName: string;
  teamATotal: number;
  teamBTotal: number;
  winner: "A" | "B" | "tie" | "";
  notes: string;
};
