import {
  buildTeamInnings,
  buildTeamMatchData,
  calculateMatchResult,
  calculateTeamTotals,
  getChasingTeamId,
  validateMatchRecordInput,
  type MatchValidationInput
} from "@/lib/match-records";

export function validateMatchInput(input: MatchValidationInput) {
  const totals = calculateTeamTotals(input.performances, input);
  const errors = validateMatchRecordInput(input);
  const effectiveBattingFirstTeamId = input.battingFirstTeamId ?? "teamA";
  const chasingTeamId = getChasingTeamId(effectiveBattingFirstTeamId);
  const scheduledOversPerInnings = input.scheduledOversPerInnings ?? null;
  const teams = {
    teamA: buildTeamMatchData({
      teamId: "teamA",
      teamName: input.teamAName ?? "Team A",
      playerIds: input.teamAPlayerIds,
      performances: input.performances,
      bowlingOvers: input.bowlingOvers.teamA
    }),
    teamB: buildTeamMatchData({
      teamId: "teamB",
      teamName: input.teamBName ?? "Team B",
      playerIds: input.teamBPlayerIds,
      performances: input.performances,
      bowlingOvers: input.bowlingOvers.teamB
    })
  };
  const completedOvers = {
    teamA: teams.teamA.completedBowlingOvers,
    teamB: teams.teamB.completedBowlingOvers
  };
  const firstInnings = buildTeamInnings({
    battingTeamId: effectiveBattingFirstTeamId,
    battingPlayerIds:
      effectiveBattingFirstTeamId === "teamA"
        ? input.teamAPlayerIds
        : input.teamBPlayerIds,
    performances: input.performances,
    bowlingOvers:
      effectiveBattingFirstTeamId === "teamA"
        ? input.bowlingOvers.teamB
        : input.bowlingOvers.teamA,
    extras: input.inningsExtras?.[effectiveBattingFirstTeamId] ?? 0
  });
  const secondInnings = buildTeamInnings({
    battingTeamId: chasingTeamId,
    battingPlayerIds:
      chasingTeamId === "teamA" ? input.teamAPlayerIds : input.teamBPlayerIds,
    performances: input.performances,
    bowlingOvers:
      chasingTeamId === "teamA" ? input.bowlingOvers.teamB : input.bowlingOvers.teamA,
    extras: input.inningsExtras?.[chasingTeamId] ?? 0
  });
  const innings = {
    first: firstInnings,
    second: secondInnings
  };
  const result = calculateMatchResult(
    input.status,
    effectiveBattingFirstTeamId,
    firstInnings,
    secondInnings
  );

  return {
    ok: errors.length === 0,
    errors,
    totals,
    completedOvers,
    result,
    teams,
    scheduledOversPerInnings,
    battingFirstTeamId: input.battingFirstTeamId ?? null,
    chasingTeamId: input.battingFirstTeamId ? chasingTeamId : null,
    innings
  };
}
