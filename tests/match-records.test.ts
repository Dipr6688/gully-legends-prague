import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildTeamInnings,
  buildTeamMatchData,
  applySharedPlayerToRosters,
  calculateBattingAllocation,
  calculateBowlerWickets,
  calculateCompletedBowlingOvers,
  calculatePlayerCatches,
  calculatePlayerHatTricks,
  calculatePlayerRunOuts,
  calculatePlayerStumpings,
  calculateRemainingWicketsForOver,
  calculateMatchResult,
  calculateTeamTotal,
  calculateTeamTotals,
  formatInningsScore,
  calculateScoreFromBowlingFeed,
  getInningsCompleteMessage,
  getInningsState,
  getFinalResultHeadline,
  getLiveInningsScore,
  getLiveResultPreview,
  getMaximumRunsForPlayer,
  getNextBattingPosition,
  getOrdinaryCrossTeamPlayerIds,
  getPerformanceKey,
  isBowlingOverComplete,
  migrateLegacyBowlingOvers,
  normalizeBattingPosition,
  normalizeNonNegativeIntegerInput,
  normalizeStoredRuns,
  sanitizeRuns,
  setPlayerAvailability,
  sortBattingPerformances,
  syncDismissalRows,
  toggleTeamSelection,
  validateMatchRecordInput
} from "../lib/match-records";
import { buildBattingRows } from "../lib/match-scorecard";
import { calculateMatchXP } from "../lib/progression";
import type { BowlingOver, DismissalEvent, MatchStatus, PlayerMatchPerformance, TeamId, TeamInnings } from "../lib/types/match";

test("manual Team A selection disables Team B selection by moving membership", () => {
  const state = toggleTeamSelection(baseState(), "teamA", "aninda");

  assert.deepEqual(state.teamAPlayerIds, ["aninda"]);
  assert.deepEqual(state.teamBPlayerIds, []);
});

test("manual Team B selection disables Team A selection by moving membership", () => {
  const first = toggleTeamSelection(baseState(), "teamA", "aninda");
  const second = toggleTeamSelection(first, "teamB", "aninda");

  assert.deepEqual(second.teamAPlayerIds, []);
  assert.deepEqual(second.teamBPlayerIds, ["aninda"]);
});

test("removing a player re-enables the opposite team checkbox", () => {
  const selected = toggleTeamSelection(baseState(), "teamA", "aninda");
  const removed = toggleTeamSelection(selected, "teamA", "aninda");
  const moved = toggleTeamSelection(removed, "teamB", "aninda");

  assert.deepEqual(moved.teamBPlayerIds, ["aninda"]);
});

test("making a player unavailable removes the player from both teams", () => {
  const selected = toggleTeamSelection(baseState(), "teamA", "aninda");
  const unavailable = setPlayerAvailability(selected, "aninda", false);

  assert.deepEqual(unavailable.availablePlayerIds, ["biplab"]);
  assert.deepEqual(unavailable.teamAPlayerIds, []);
  assert.deepEqual(unavailable.teamBPlayerIds, []);
});

test("seven-player odd setup uses one Shared Player for equal four-vs-four sides", () => {
  const availablePlayerIds = [
    "aninda",
    "arunabha",
    "atripan",
    "biplab",
    "dipanjan",
    "gaurav",
    "madhab"
  ];
  const rosters = applySharedPlayerToRosters({
    sharedPlayerId: "aninda",
    teamAPlayerIds: ["arunabha", "atripan", "biplab"],
    teamBPlayerIds: ["dipanjan", "gaurav", "madhab"]
  });
  const ordinaryPlayerIds = availablePlayerIds.filter((playerId) => playerId !== "aninda");

  assert.equal(rosters.teamAPlayerIds.length, 4);
  assert.equal(rosters.teamBPlayerIds.length, 4);
  assert.equal(rosters.teamAPlayerIds.includes("aninda"), true);
  assert.equal(rosters.teamBPlayerIds.includes("aninda"), true);
  assert.deepEqual(
    ordinaryPlayerIds
      .map(
        (playerId) =>
          Number(rosters.teamAPlayerIds.includes(playerId)) +
          Number(rosters.teamBPlayerIds.includes(playerId))
      )
      .sort(),
    [1, 1, 1, 1, 1, 1]
  );
});

test("nine-player odd setup uses one Shared Player for equal five-vs-five sides", () => {
  const rosters = applySharedPlayerToRosters({
    sharedPlayerId: "aninda",
    teamAPlayerIds: ["arunabha", "atripan", "biplab", "dipanjan"],
    teamBPlayerIds: ["gaurav", "madhab", "rohit", "soman"]
  });

  assert.equal(rosters.teamAPlayerIds.length, 5);
  assert.equal(rosters.teamBPlayerIds.length, 5);
  assert.equal(rosters.teamAPlayerIds.includes("aninda"), true);
  assert.equal(rosters.teamBPlayerIds.includes("aninda"), true);
});

test("manual teams allow only the selected Shared Player to appear in both teams", () => {
  assert.deepEqual(
    getOrdinaryCrossTeamPlayerIds({
      sharedPlayerId: "aninda",
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "biplab"]
    }),
    []
  );
  assert.deepEqual(
    getOrdinaryCrossTeamPlayerIds({
      sharedPlayerId: "aninda",
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "arunabha"]
    }),
    ["arunabha"]
  );
});

test("Team A players appear only in Team A records", () => {
  const teamData = buildTeamMatchData({
    teamId: "teamA",
    teamName: "Team A",
    playerIds: ["aninda"],
    performances: [
      performance("aninda", "teamA", 20),
      performance("biplab", "teamB", 15)
    ],
    bowlingOvers: []
  });

  assert.deepEqual(teamData.playerPerformances.map((record) => record.playerId), ["aninda"]);
});

test("Team B players appear only in Team B records", () => {
  const teamData = buildTeamMatchData({
    teamId: "teamB",
    teamName: "Team B",
    playerIds: ["biplab"],
    performances: [
      performance("aninda", "teamA", 20),
      performance("biplab", "teamB", 15)
    ],
    bowlingOvers: []
  });

  assert.deepEqual(teamData.playerPerformances.map((record) => record.playerId), ["biplab"]);
});

test("batting position metadata normalizes and assigns the next team position", () => {
  const records = [
    { ...performance("naim", "teamB", 70), battingPosition: 1 },
    { ...performance("saurav", "teamB", 3), battingPosition: 2 },
    { ...performance("soman", "teamB", 33), battingPosition: 3 },
    { ...performance("aninda", "teamA", 44), battingPosition: 1 }
  ];

  assert.equal(normalizeBattingPosition("04"), 4);
  assert.equal(normalizeBattingPosition(0), null);
  assert.equal(getNextBattingPosition(records, "teamB"), 4);
  assert.equal(getNextBattingPosition(records, "teamA"), 2);
});

test("scorecard batting rows sort by batting position and keep did-not-bat players last", () => {
  const performances: PlayerMatchPerformance[] = [
    { ...performance("rohit", "teamB", 7), battingPosition: 4, wasOut: false },
    { ...performance("soman", "teamB", 33), battingPosition: 3, wasOut: true },
    { ...performance("saurav", "teamB", 3), battingPosition: 2, wasOut: true },
    { ...performance("naim", "teamB", 70), battingPosition: 1, wasOut: false },
    {
      ...performance("amrit", "teamB", 0),
      didBat: false,
      battingPosition: null,
      runs: "",
      wasOut: false
    },
    {
      ...performance("suprateem", "teamB", 0),
      didBat: false,
      battingPosition: null,
      runs: "",
      wasOut: false
    }
  ];
  const rows = buildBattingRows(
    {
      battingTeamId: "teamB",
      bowlingTeamId: "teamA",
      runs: 113,
      wicketsLost: 2,
      extras: 0,
      playerCount: 6,
      completedOvers: 4,
      battingPerformances: performances,
      bowlingOvers: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              id: "saurav-dismissal",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "saurav",
              creditedBowlerId: "aninda"
            })
          ]
        }),
        over("teamA", "utpal", 2, {
          dismissals: [
            dismissal({
              id: "soman-dismissal",
              overId: "teamA-2",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "soman",
              creditedBowlerId: "utpal"
            })
          ]
        })
      ]
    },
    (playerId) =>
      ({
        naim: "Naim",
        saurav: "Saurav",
        soman: "Soman",
        rohit: "Rohit",
        amrit: "Amrit",
        suprateem: "Suprateem",
        aninda: "Aninda",
        utpal: "Utpal"
      })[playerId] ?? playerId
  );

  assert.deepEqual(
    rows.map((row) => row.batter),
    ["Naim", "Saurav", "Soman", "Rohit", "Amrit", "Suprateem"]
  );
  assert.equal(rows[3]?.dismissal, "not out");
  assert.equal(rows[4]?.dismissal, "did not bat");
  assert.equal(rows[4]?.runs, "-");
});

test("legacy batting rows without batting positions keep existing deterministic order", () => {
  const performances: PlayerMatchPerformance[] = [
    performance("rohit", "teamB", 7),
    performance("soman", "teamB", 33),
    performance("saurav", "teamB", 3),
    {
      ...performance("amrit", "teamB", 0),
      didBat: false,
      runs: "",
      wasOut: false
    }
  ];

  assert.deepEqual(
    sortBattingPerformances(performances).map((record) => record.playerId),
    ["rohit", "soman", "saurav", "amrit"]
  );
});

test("batting order metadata does not affect XP totals", () => {
  const withoutPosition = performance("rohit", "teamB", 7);
  const withPosition = { ...withoutPosition, battingPosition: 4 };

  assert.deepEqual(
    calculateMatchXP(withPosition, {
      result: {
        type: "win_by_wickets",
        winnerTeamId: "teamB",
        loserTeamId: "teamA",
        wicketsRemaining: 2
      },
      teamWon: true,
      overs: []
    }),
    calculateMatchXP(withoutPosition, {
      result: {
        type: "win_by_wickets",
        winnerTeamId: "teamB",
        loserTeamId: "teamA",
        wicketsRemaining: 2
      },
      teamWon: true,
      overs: []
    })
  );
});

test("unselected players do not appear in team data", () => {
  const teamData = buildTeamMatchData({
    teamId: "teamA",
    teamName: "Team A",
    playerIds: ["aninda"],
    performances: [
      performance("aninda", "teamA", 20),
      performance("atripan", "teamA", 99)
    ],
    bowlingOvers: []
  });

  assert.equal(teamData.totalRuns, 20);
});

test("moving a player moves the associated record and preserves entered values", () => {
  const saved = performance("aninda", "teamA", 42);
  const moved = { ...saved, teamId: "teamB" as const };
  const teamBData = buildTeamMatchData({
    teamId: "teamB",
    teamName: "Team B",
    playerIds: ["aninda"],
    performances: [moved],
    bowlingOvers: []
  });

  assert.equal(teamBData.playerPerformances[0]?.runs, 42);
});

test("Team A Bowling accepts only Team A players", () => {
  const errors = validateMatchRecordInput(validationInput({
    bowlingOvers: {
      teamA: [over("teamA", "biplab", 1)],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Every selected bowler must belong to that bowling team."), true);
});

test("Team B Bowling accepts only Team B players", () => {
  const errors = validateMatchRecordInput(validationInput({
    bowlingOvers: {
      teamA: [],
      teamB: [over("teamB", "aninda", 1)]
    }
  }));

  assert.equal(errors.includes("Every selected bowler must belong to that bowling team."), true);
});

test("completed overs are calculated separately", () => {
  assert.equal(calculateCompletedBowlingOvers([over("teamA", "aninda", 1)]), 1);
  assert.equal(calculateCompletedBowlingOvers([over("teamB", "biplab", 1), over("teamB", "biplab", 2)]), 2);
});

test("server rejects duplicate cross-team membership", () => {
  const errors = validateMatchRecordInput(validationInput({
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["aninda", "biplab"]
  }));

  assert.equal(errors.includes("A player cannot be selected for both teams."), true);
});

test("Team A total equals Team A player runs", () => {
  assert.equal(
    calculateTeamTotals([
      performance("aninda", "teamA", 20),
      performance("biplab", "teamB", 15)
    ]).teamATotal,
    20
  );
});

test("Team B total equals Team B player runs", () => {
  assert.equal(
    calculateTeamTotals([
      performance("aninda", "teamA", 20),
      performance("biplab", "teamB", 15)
    ]).teamBTotal,
    15
  );
});

test("changing a player's runs updates only that player's team", () => {
  const before = calculateTeamTotals([
    performance("aninda", "teamA", 8),
    performance("biplab", "teamB", 12)
  ]);
  const after = calculateTeamTotals([
    performance("aninda", "teamA", 18),
    performance("biplab", "teamB", 12)
  ]);

  assert.equal(before.teamBTotal, after.teamBTotal);
  assert.equal(after.teamATotal, 18);
});

test("moving a player transfers their runs to the new team", () => {
  const totals = calculateTeamTotals([performance("aninda", "teamB", 20)]);

  assert.deepEqual(totals, { teamATotal: 0, teamBTotal: 20 });
});

test("negative or invalid run values are handled safely", () => {
  assert.equal(sanitizeRuns(-4), 0);
  assert.equal(sanitizeRuns("not a score"), 0);
});

test("bowling layout uses non-overlapping responsive grids", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(css, /\.bowling-teams-grid\s*{/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.bowling-teams-grid > \*/);
  assert.match(css, /\.team-bowling-panel\s*{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.team-bowling-panel\s*{[\s\S]*?container-type:\s*inline-size/);
  assert.match(css, /@media \(max-width:\s*1050px\)[\s\S]*?\.bowling-teams-grid/);
});

test("bowling row inputs stay inside their own panel and use compact container layout", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(css, /\.bowling-over-row\s*{/);
  assert.match(css, /64px\s+minmax\(130px,\s*1fr\)\s+94px\s+104px\s+minmax\(92px,\s*auto\)/);
  assert.match(css, /\.bowling-over-actions\s*{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.bowling-over-actions\s*{[\s\S]*?justify-content:\s*flex-end/);
  assert.match(css, /\.maiden-control,\s*\n\.maiden-badge,\s*\n\.maiden-empty\s*{[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.delete-over-button\s*{[\s\S]*?flex:\s*0 0 34px/);
  assert.match(css, /@container \(max-width:\s*660px\)[\s\S]*?\.bowling-over-row/);
  assert.match(css, /@container \(max-width:\s*660px\)[\s\S]*?grid-column:\s*2 \/ 5/);
  assert.match(form, /className="bowling-over-actions"/);
  assert.match(form, /className="maiden-control/);
  assert.match(form, /className="delete-over-button/);
  assert.match(form, /<span>MAIDEN<\/span>/);
  assert.doesNotMatch(form, />MAID</);
});

test("finalised bowling rows use read-only Maiden badges while drafts stay editable", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /isLocked \? \(/);
  assert.match(form, /className="maiden-badge">MAIDEN<\/span>/);
  assert.match(form, /className="maiden-empty">-/);
  assert.match(form, /!isLocked \? \([\s\S]*className="maiden-control/);
  assert.match(form, /!isLocked \? \([\s\S]*aria-label=\{`Delete over/);
  assert.match(css, /\.maiden-badge,\s*\n\.maiden-empty\s*{[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.maiden-empty\s*{/);
});

test("dismissal rows stay contained inside bowling over cards", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(css, /\.dismissal-row\s*{[\s\S]*?grid-template-columns:\s*[\s\S]*minmax\(130px,\s*1fr\)[\s\S]*minmax\(120px,\s*0\.9fr\)[\s\S]*minmax\(130px,\s*1fr\)/);
  assert.match(css, /\.dismissal-row > \*\s*{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.dismissal-row select\s*{[\s\S]*?max-width:\s*100%/);
  assert.match(css, /@container \(max-width:\s*660px\)[\s\S]*?\.dismissal-row\s*{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("player stat inputs stay contained and wrap responsively", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(css, /\.player-match-record\s*{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.player-stat-inputs\s*{[\s\S]*?repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.player-stat-field input,\s*\.player-batting-field input\[type="number"\]\s*{[\s\S]*?max-width:\s*100%/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*430px\)[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(form, /className="player-match-record/);
  assert.match(form, /className="player-stat-inputs"/);
  assert.match(form, /Run-outs/);
});

test("bowling over UI uses WKTS TAKEN and dismissal editors", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /Wkts taken/);
  assert.match(form, /Total dismissals in this over, including run-outs\./);
  assert.doesNotMatch(form, /\+ Add Wicket/);
  assert.match(form, /Dismissed batter/);
  assert.match(form, /Caught by/);
  assert.match(form, /Run-out by/);
  assert.match(form, /Complete the dismissal details for the wickets taken in this over\./);
  assert.match(form, /dismissedBatterIdsInOtherOvers/);
  assert.match(form, /candidate\.id !== dismissal\.id/);
  assert.match(css, /\.dismissal-row\s*{/);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.dismissal-row/);
});

test("player record bowling and fielding stats are derived displays", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const playerStatsBlock =
    form.match(/<div className="player-stat-inputs">[\s\S]*?<\/div>/)?.[0] ?? "";

  assert.match(form, /DerivedPlayerStat label="Wickets"/);
  assert.match(form, /DerivedPlayerStat label="Hat-tricks"/);
  assert.match(form, /DerivedPlayerStat label="Catches"/);
  assert.match(form, /DerivedPlayerStat label="Run-outs"/);
  assert.doesNotMatch(playerStatsBlock, /onUpdatePerformance/);
  assert.doesNotMatch(playerStatsBlock, /<input/);
});

test("player run inputs use blank draft state and normalized numeric changes", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /runs:\s*""/);
  assert.match(form, /runs:\s*didBat \? normalizeStoredRuns\(current\.runs\) : ""/);
  assert.match(form, /normalizeNonNegativeIntegerInput\(\s*event\.target\.value\s*\)/);
  assert.doesNotMatch(form, /runs:\s*event\.target\.value/);
});

test("match page uses status-aware production titles", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const page = readFileSync("app/matches/new/page.tsx", "utf8");

  assert.match(form, /const matchPageTitle = isNewMatch/);
  assert.match(form, /"CREATE MATCH"/);
  assert.match(form, /"EDIT MATCH"/);
  assert.match(form, /"LIVE MATCH ENTRY"/);
  assert.match(form, /"MATCH SCORECARD"/);
  assert.match(form, /document\.title = `\$\{matchPageTitle\} \| Gully Legends Prague`/);
  assert.match(form, /aria-label=\{matchPageTitle\}/);
  assert.match(page, /title: "Create Match \| Gully Legends Prague"/);
  assert.doesNotMatch(
    form,
    /Mock Match Entry|Mock Match|Demo Match|Test Match Entry|Sample Match/
  );
});

test("Draft validation allows schedule-only and partially prepared matches", () => {
  const scheduleOnly = validateMatchRecordInput(validationInput({
    stage: "draft",
    matchName: "Gully Premier League",
    battingFirstTeamId: null,
    scheduledOversPerInnings: null,
    availablePlayerIds: [],
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    performances: []
  }));
  const playersOnly = validateMatchRecordInput(validationInput({
    stage: "draft",
    matchName: "Gully Premier League",
    battingFirstTeamId: null,
    scheduledOversPerInnings: null,
    availablePlayerIds: ["aninda", "biplab"],
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    performances: []
  }));
  const teamsWithoutBattingFirst = validateMatchRecordInput(validationInput({
    stage: "draft",
    matchName: "Gully Premier League",
    battingFirstTeamId: null,
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["biplab"]
  }));
  const teamsWithoutOvers = validateMatchRecordInput(validationInput({
    stage: "draft",
    matchName: "Gully Premier League",
    battingFirstTeamId: "teamA",
    scheduledOversPerInnings: null
  }));

  assert.deepEqual(scheduleOnly, []);
  assert.deepEqual(playersOnly, []);
  assert.deepEqual(teamsWithoutBattingFirst, []);
  assert.deepEqual(teamsWithoutOvers, []);
});

test("Schedule validation is independent from batting-first teams and overs", () => {
  assert.deepEqual(
    validateMatchRecordInput(validationInput({
      stage: "schedule",
      matchName: "Rescheduled Gully Premier League",
      battingFirstTeamId: null,
      scheduledOversPerInnings: null,
      availablePlayerIds: [],
      teamAPlayerIds: [],
      teamBPlayerIds: [],
      performances: []
    })),
    []
  );
});

test("Start Scoring validation blocks missing batting-first team and invalid teams", () => {
  const noBattingFirstErrors = validateMatchRecordInput(validationInput({
    stage: "start",
    matchName: "Gully Premier League",
    battingFirstTeamId: null
  }));
  const noTeamsErrors = validateMatchRecordInput(validationInput({
    stage: "start",
    matchName: "Gully Premier League",
    battingFirstTeamId: "teamA",
    availablePlayerIds: [],
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    performances: []
  }));

  assert.equal(noBattingFirstErrors.includes("SELECT THE BATTING-FIRST TEAM"), true);
  assert.equal(noTeamsErrors.includes("Select at least one available player."), true);
  assert.equal(noTeamsErrors.includes("Team A and Team B must each contain at least one player."), true);
});

test("Start Scoring works when required setup is complete", () => {
  assert.deepEqual(
    validateMatchRecordInput(validationInput({
      stage: "start",
      matchName: "Gully Premier League",
      battingFirstTeamId: "teamA",
      scheduledOversPerInnings: 8
    })),
    []
  );
});

test("Draft saving does not trigger finalisation side effects", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const nonFinalisedSaveSection =
    form.match(/async function persistNonFinalisedMatch[\s\S]*?async function validateAndSetStatus/)?.[0] ?? "";

  assert.match(form, /stage,\s*\n\s*scheduledOversPerInnings/);
  assert.match(form, /validateAndSetStatus\(\s*status,[\s\S]*?"draft"/);
  assert.match(form, /persistNonFinalisedMatch\(\s*buildCurrentMatchRecord/);
  assert.match(nonFinalisedSaveSection, /saveSupabaseAdminMatch/);
  assert.match(nonFinalisedSaveSection, /localMatchRepository\.saveMatch\(match\)/);
  assert.doesNotMatch(nonFinalisedSaveSection, /applyFinalisedMatchToLocalCareerStats/);
  assert.match(form, /if \(nextStatus === "finalised"\)[\s\S]*finalizeSupabaseAdminMatch/);
  assert.match(form, /applyFinalisedMatchToLocalCareerStats\(finalisedMatch\)/);
});

test("Create Match form supports quick fixture creation fields", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /matchNumber:\s*""/);
  assert.match(form, /startTime:\s*""/);
  assert.match(form, /Game number/);
  assert.match(form, /Start time/);
  assert.match(form, /getNextAvailableMatchNumber\(savedMatches, event\.target\.value\)/);
  assert.match(form, /Continue to Team Setup/);
  assert.match(form, /window\.location\.href = `\/matches\/\$\{matchId\}`/);
});

test("Create Match form rejects duplicate same-day game numbers and blocks second live match", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /hasDuplicateMatchNumber\(\{/);
  assert.match(form, /Game \$\{matchNumber\} already exists for this date/);
  assert.match(form, /getLiveMatchConflict\(savedMatches, matchId\)/);
  assert.match(
    form,
    /ANOTHER MATCH IS ALREADY IN PROGRESS/
  );
  assert.match(form, /Continue Current Match/);
});

test("Supabase mode sends match writes and finalisation to protected admin APIs", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const apiClient = readFileSync("lib/admin-match-write-client.ts", "utf8");
  const apiRoute = readFileSync("app/api/admin/matches/route.ts", "utf8");
  const finaliseRoute = readFileSync("app/api/admin/matches/finalize/route.ts", "utf8");
  const writeRepository = readFileSync("lib/supabase/match-write-repository.ts", "utf8");
  const finalisationPlan = readFileSync("lib/supabase/match-finalisation-plan.ts", "utf8");
  const finalisationRepository = readFileSync("lib/supabase/match-finalisation-repository.ts", "utf8");
  const atomicFinalisationSql = readFileSync(
    "supabase/migrations/20260807103000_atomic_match_finalisation.sql",
    "utf8"
  );

  assert.match(form, /const supabaseWriteMode = isSupabaseDataSource\(\)/);
  assert.match(form, /saveSupabaseAdminMatch\(\{/);
  assert.match(form, /finalizeSupabaseAdminMatch\(\{/);
  assert.match(form, /expectedUpdatedAt: supabaseUpdatedAt/);
  assert.match(form, /active_crown/);
  assert.match(form, /stale_match/);
  assert.match(form, /stale_career/);
  assert.match(form, /localMatchRepository\.saveMatch\(finalisedMatch\)/);
  assert.doesNotMatch(form, /setShowSupabaseFinaliseWarning/);
  assert.match(apiClient, /\/api\/admin\/matches/);
  assert.match(apiClient, /\/api\/admin\/matches\/finalize/);
  assert.match(apiRoute, /isAdminWithClient/);
  assert.match(apiRoute, /validateMatchOnServer/);
  assert.match(apiRoute, /revalidatePath\("\/"\)/);
  assert.match(finaliseRoute, /ADMIN LOGIN REQUIRED/);
  assert.match(finaliseRoute, /ADMIN ACCESS REQUIRED/);
  assert.match(finaliseRoute, /validateMatchOnServer/);
  assert.match(finaliseRoute, /validateSupabaseMatchPayload/);
  assert.match(finaliseRoute, /hasActiveCrown/);
  assert.match(finaliseRoute, /getCareerRows/);
  assert.match(finaliseRoute, /getMatchApplications/);
  assert.match(finaliseRoute, /buildFinalisationPlan/);
  assert.match(finaliseRoute, /finalizeAtomically/);
  assert.match(writeRepository, /is_demo: forceDemo \|\| \(existing\?\.is_demo \?\? false\)/);
  assert.match(writeRepository, /assertNoOtherLiveMatch/);
  assert.match(writeRepository, /deleted_at: deletedAt/);
  assert.match(writeRepository, /expectedUpdatedAt/);
  assert.match(finalisationPlan, /applyFinalisedMatchToCareerStats/);
  assert.match(finalisationPlan, /createEmptyCareerProgressionState/);
  assert.match(finalisationPlan, /existingApplications/);
  assert.match(finalisationRepository, /client\.rpc\("finalize_match_atomic"/);
  assert.match(finalisationRepository, /stale_match/);
  assert.match(finalisationRepository, /stale_career/);
  assert.match(atomicFinalisationSql, /create or replace function public\.finalize_match_atomic/);
  assert.match(atomicFinalisationSql, /if not public\.is_admin\(\)/);
  assert.match(atomicFinalisationSql, /set search_path = ''/);
  assert.match(atomicFinalisationSql, /for update/);
  assert.match(atomicFinalisationSql, /v_match\.status <> 'in_progress'/);
  assert.match(atomicFinalisationSql, /gully-legends-reset-demo-data/);
  assert.match(atomicFinalisationSql, /pg_advisory_xact_lock/);
  assert.match(atomicFinalisationSql, /month_already_crowned/);
  assert.match(atomicFinalisationSql, /update public\.player_career_stats/);
  assert.match(atomicFinalisationSql, /insert into public\.match_stat_applications/);
  assert.match(atomicFinalisationSql, /update public\.matches/);
  assert.match(atomicFinalisationSql, /already_applied/);
  assert.doesNotMatch(apiClient, /localStorage|MATCH_HISTORY_STORAGE_KEY/);
});

test("finalised match uses XP Awarded while drafts use Projected Match XP", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /isFinalised \? "XP Awarded" : "Projected match XP"/);
  assert.match(form, /className=\{`player-match-xp/);
});

test("finalised match actions replace editing controls and unsafe reopen is hidden", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /!isFinalised \? \(/);
  assert.match(form, /Save Draft/);
  assert.match(form, /Finalise Match/);
  assert.match(form, /Reset/);
  assert.match(form, /View Match Summary/);
  assert.match(form, /Back to Matches/);
  assert.match(form, /const canSafelyReopenFinalisedMatch = false/);
  assert.match(form, /\{canReopen \? \(/);
});

test("finalised match details use accessible collapsed disclosures", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /function MatchDetailsDisclosure/);
  assert.match(form, /defaultOpen = false/);
  assert.match(form, /aria-expanded=\{isOpen\}/);
  assert.match(form, /aria-controls=\{contentId\}/);
  assert.match(form, /hidden=\{!isOpen\}/);
  assert.match(form, /isFinalised \? \(\s*<MatchDetailsDisclosure[\s\S]*?: \(\s*<TeamBowlingSection/);
  assert.match(form, /isFinalised \? \(\s*<MatchDetailsDisclosure[\s\S]*?: \(\s*<TeamPlayerRecordsSection/);
});

test("finalised polish adds team accents and removes repeated over-level all-out notice", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(form, /team-section-a/);
  assert.match(form, /team-section-b/);
  assert.match(css, /--team-accent/);
  assert.match(css, /\.team-score-badge/);
  assert.match(css, /\.finalised-match input:disabled/);
  assert.doesNotMatch(form, /All available batting players have been dismissed\./);
});

test("run input normalizer removes leading zeroes and permits blank editing", () => {
  assert.equal(normalizeNonNegativeIntegerInput("13"), 13);
  assert.equal(normalizeNonNegativeIntegerInput("013"), 13);
  assert.equal(normalizeNonNegativeIntegerInput("001"), 1);
  assert.equal(normalizeNonNegativeIntegerInput("0"), 0);
  assert.equal(normalizeNonNegativeIntegerInput(""), "");
});

test("stored draft run values are normalised before display", () => {
  assert.equal(normalizeStoredRuns("013"), 13);
  assert.equal(normalizeStoredRuns("001"), 1);
  assert.equal(normalizeStoredRuns(0), 0);
  assert.equal(normalizeStoredRuns(null), "");
  assert.equal(normalizeStoredRuns(undefined), "");
  assert.equal(normalizeStoredRuns(""), "");
});

test("legacy draft wickets migrate into placeholder dismissal rows", () => {
  const { dismissals: _dismissals, ...legacyOver } = over("teamA", "aninda", 1, {
    dismissals: []
  });
  void _dismissals;
  const migrated = migrateLegacyBowlingOvers([
    {
      ...legacyOver,
      wicketsLost: 2
    }
  ]);

  assert.equal(migrated[0].dismissals.length, 2);
  assert.equal(migrated[0].dismissals[0].dismissedBatterId, "");
  assert.equal(migrated[0].dismissals[0].creditedBowlerId, "aninda");
  assert.equal(isBowlingOverComplete(migrated[0]), false);
});

test("wickets taken syncs only the required dismissal rows for the current over", () => {
  const baseOver = over("teamA", "aninda", 1, { dismissals: [] });
  const zeroWicketOver = syncDismissalRows(baseOver, 0);
  const oneWicketOver = syncDismissalRows(baseOver, 1);
  const twoWicketOver = syncDismissalRows(baseOver, 2);

  assert.equal(zeroWicketOver.wicketsTaken, 0);
  assert.equal(zeroWicketOver.dismissals.length, 0);
  assert.equal(isBowlingOverComplete(zeroWicketOver), true);

  assert.equal(oneWicketOver.wicketsTaken, 1);
  assert.equal(oneWicketOver.dismissals.length, 1);
  assert.equal(isBowlingOverComplete(oneWicketOver), false);

  assert.equal(twoWicketOver.wicketsTaken, 2);
  assert.equal(twoWicketOver.dismissals.length, 2);
});

test("one completed dismissal in over one permits the next over without remaining innings wickets", () => {
  const completedOver = over("teamA", "aninda", 1, {
    runsConceded: 10,
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        type: "bowled",
        creditedBowlerId: "aninda"
      })
    ]
  });
  const inningsState = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: [completedOver],
    scheduledOvers: 8,
    runs: 10
  });

  assert.equal(isBowlingOverComplete(completedOver), true);
  assert.equal(inningsState.isComplete, false);
  assert.equal(inningsState.isAllOut, false);
  assert.equal(calculateScoreFromBowlingFeed([completedOver]).wicketsLost, 1);
});

test("team selectors render from Available Today players only", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /const availablePlayers = useMemo/);
  assert.match(form, /availablePlayers\.map\(\(player\) =>/);
  assert.doesNotMatch(form, /function renderTeamSelector[\s\S]*?players\.map\(\(player\) =>/);
});

test("bowler selectors and player record sections use selected team players only", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /players=\{teamAPlayers\}/);
  assert.match(form, /players=\{teamBPlayers\}/);
  assert.match(form, /teamPlayers\.map\(\(player\) =>\s*\(\s*<option/);
  assert.match(form, /const orderedPerformances = sortBattingPerformances\(performances\)/);
  assert.match(form, /orderedPerformances\.map\(\(performance\) =>/);
});

test("availability and roster controls lock once the match leaves Draft", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /const isRosterLocked = status !== "draft"/);
  assert.match(form, /if \(isRosterLocked\) return/);
  assert.match(
    form,
    /isRosterLocked \|\|\s*isBalancing \|\|\s*availablePlayerIds\.length < 2 \|\|\s*!canUseTeamControls/
  );
});

test("over sequencing treats blank fields as incomplete and zero values as complete", () => {
  assert.equal(
    isBowlingOverComplete({
      ...over("teamA", "", 1),
      runsConceded: "",
      dismissals: []
    }),
    false
  );
  assert.equal(
    isBowlingOverComplete({
      ...over("teamA", "aninda", 1),
      runsConceded: "",
      dismissals: []
    }),
    false
  );
  assert.equal(
    isBowlingOverComplete({
      ...over("teamA", "aninda", 1),
      runsConceded: 0,
      dismissals: []
    }),
    true
  );
});

test("maiden overs require zero runs", () => {
  assert.equal(
    isBowlingOverComplete({
      ...over("teamA", "aninda", 1, { runsConceded: 5 }),
      maiden: true
    }),
    false
  );
  assert.equal(
    isBowlingOverComplete({
      ...over("teamA", "aninda", 1, { runsConceded: 0 }),
      maiden: true
    }),
    true
  );
});

test("four-player batting team permits at most four wickets", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["arunabha", "atripan", "biplab", "dipanjan"],
    performances: [performance("aninda", "teamA", 10)],
    bowlingOvers: {
      teamA: [over("teamA", "aninda", 1, { wicketsLost: 4 })],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Total wickets cannot exceed the number of players in the batting team."), false);
});

test("cumulative wickets across overs cannot exceed the batting team size", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["arunabha", "atripan", "biplab", "dipanjan"],
    performances: [performance("aninda", "teamA", 10)],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, { wicketsLost: 2 }),
        over("teamA", "aninda", 2, { wicketsLost: 3 })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Total wickets cannot exceed the number of players in the batting team."), true);
});

test("changing one over recalculates the remaining dismissal maximum", () => {
  const overs = [
    over("teamA", "aninda", 1, { wicketsLost: 1 }),
    over("teamA", "aninda", 2, { wicketsLost: 2 })
  ];

  assert.equal(
    calculateRemainingWicketsForOver({
      overs,
      currentOverId: "teamA-2",
      battingTeamPlayerCount: 4
    }),
    3
  );
});

test("Team A and Team B wicket caps use their own opposing player counts", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha", "atripan"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    performances: [],
    bowlingOvers: {
      teamA: [over("teamA", "aninda", 1, { wicketsLost: 3 })],
      teamB: [over("teamB", "biplab", 1, { wicketsLost: 3 })]
    }
  }));

  assert.equal(errors.includes("Total wickets cannot exceed the number of players in the batting team."), true);
});

test("innings state marks a four-player batting team all out at four wickets", () => {
  const state = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: [over("teamA", "aninda", 1, { wicketsLost: 2 }), over("teamA", "aninda", 2, { wicketsLost: 2 })],
    scheduledOvers: 8,
    runs: 24
  });

  assert.equal(state.isAllOut, true);
  assert.equal(state.isComplete, true);
  assert.equal(state.endReason, "all_out");
  assert.equal(getInningsCompleteMessage(state), "INNINGS COMPLETE - ALL 4 WICKETS TAKEN");
});

test("existing overs after the all-out point produce validation errors", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["arunabha", "atripan", "biplab", "dipanjan"],
    performances: [performance("aninda", "teamA", 10)],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, { wicketsLost: 1 }),
        over("teamA", "aninda", 2, { wicketsLost: 1 }),
        over("teamA", "aninda", 3, { wicketsLost: 1 }),
        over("teamA", "aninda", 4, { wicketsLost: 1 }),
        over("teamA", "aninda", 5, { wicketsLost: 0 })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Delete over 5; the innings was already all out."), true);
});

test("Add Over disables at the scheduled-over limit", () => {
  const state = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: [
      over("teamA", "aninda", 1),
      over("teamA", "aninda", 2)
    ],
    scheduledOvers: 2,
    runs: 15
  });

  assert.equal(state.isComplete, true);
  assert.equal(state.endReason, "overs_completed");
  assert.equal(getInningsCompleteMessage(state), "INNINGS COMPLETE - 2 OVERS COMPLETED");
});

test("server rejects completed overs beyond the scheduled-over limit", () => {
  const errors = validateMatchRecordInput(validationInput({
    scheduledOversPerInnings: 1,
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1),
        over("teamA", "aninda", 2)
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Completed overs cannot exceed the scheduled overs per innings."), true);
});

test("chase disables Add Over after target is reached", () => {
  const state = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: [over("teamA", "aninda", 1, { runsConceded: 12 })],
    scheduledOvers: 8,
    runs: 26,
    target: 26
  });

  assert.equal(state.isComplete, true);
  assert.equal(state.endReason, "target_reached");
  assert.equal(getInningsCompleteMessage(state), "CHASE COMPLETE - TARGET REACHED");
});

test("Team B Bowling updates Team A live score from complete overs", () => {
  const teamBBowling = [
    over("teamB", "biplab", 1, { runsConceded: 8, wicketsLost: 0 }),
    over("teamB", "biplab", 2, { runsConceded: 10, wicketsLost: 1 }),
    over("teamB", "biplab", 3, { runsConceded: 12, wicketsLost: 1 }),
    over("teamB", "biplab", 4, { runsConceded: 5, wicketsLost: 0 })
  ];
  const score = getLiveInningsScore({
    battingTeamId: "teamA",
    opposingBowlingOvers: teamBBowling,
    playerPerformances: [
      { ...performance("aninda", "teamA", 20), didBat: true },
      { ...performance("arunabha", "teamA", 13), didBat: true }
    ],
    extras: 2
  });

  assert.deepEqual(calculateScoreFromBowlingFeed(teamBBowling), {
    runs: 35,
    wicketsLost: 2,
    completedOvers: 4
  });
  assert.equal(formatInningsScore(score.runs, score.wicketsLost), "35/2");
  assert.equal(score.source, "bowling_feed");
  assert.equal(score.isReconciled, true);
});

test("Team A Bowling updates Team B live score and player runs are not added twice", () => {
  const score = getLiveInningsScore({
    battingTeamId: "teamB",
    opposingBowlingOvers: [
      over("teamA", "aninda", 1, { runsConceded: 8, wicketsLost: 0 }),
      over("teamA", "aninda", 2, { runsConceded: 10, wicketsLost: 1 })
    ],
    playerPerformances: [{ ...performance("biplab", "teamB", 99), didBat: true }],
    extras: 0
  });

  assert.equal(score.runs, 18);
  assert.equal(score.allocatedBatterRuns, 99);
  assert.equal(score.isReconciled, false);
});

test("before a complete over exists player records plus extras provide provisional score", () => {
  const score = getLiveInningsScore({
    battingTeamId: "teamA",
    opposingBowlingOvers: [
      {
        ...over("teamB", "", 1),
        runsConceded: "",
        dismissals: []
      }
    ],
    playerPerformances: [{ ...performance("aninda", "teamA", 11), didBat: true }],
    extras: 2
  });

  assert.equal(score.runs, 11);
  assert.equal(score.source, "player_records");
  assert.equal(score.isReconciled, true);
});

test("official bowling total derives automatic extras from player-run allocation", () => {
  const exactAllocation = calculateBattingAllocation(20, [
    performance("aninda", "teamA", 8),
    performance("atripan", "teamA", 2),
    performance("soman", "teamA", 10)
  ]);
  const allocationWithExtras = calculateBattingAllocation(20, [
    performance("aninda", "teamA", 8),
    performance("atripan", "teamA", 2),
    performance("soman", "teamA", 7)
  ]);

  assert.deepEqual(exactAllocation, {
    playerRunsTotal: 20,
    extras: 0,
    isValid: true,
    excessPlayerRuns: 0
  });
  assert.deepEqual(allocationWithExtras, {
    playerRunsTotal: 17,
    extras: 3,
    isValid: true,
    excessPlayerRuns: 0
  });
});

test("empty player runs are treated as zero in allocation calculations", () => {
  const allocation = calculateBattingAllocation(20, [
    { ...performance("aninda", "teamA", 8), runs: "" },
    performance("atripan", "teamA", 2)
  ]);

  assert.equal(allocation.playerRunsTotal, 2);
  assert.equal(allocation.extras, 18);
  assert.equal(allocation.isValid, true);
});

test("player totals use numeric addition instead of string concatenation", () => {
  const total = calculateTeamTotal("teamA", [
    { ...performance("aninda", "teamA", 0), runs: "013" as unknown as number },
    { ...performance("atripan", "teamA", 0), runs: "2" as unknown as number }
  ]);

  assert.equal(total, 15);
  assert.notEqual(total, "0132");
});

test("player-run total cannot exceed official bowling total", () => {
  const allocation = calculateBattingAllocation(20, [
    performance("aninda", "teamA", 8),
    performance("atripan", "teamA", 2),
    performance("soman", "teamA", 11)
  ]);

  assert.deepEqual(allocation, {
    playerRunsTotal: 21,
    extras: 0,
    isValid: false,
    excessPlayerRuns: 1
  });
});

test("dynamic player run maximum is calculated from other batter allocations", () => {
  const maximum = getMaximumRunsForPlayer("soman", 20, [
    performance("aninda", "teamA", 8),
    performance("atripan", "teamA", 2),
    performance("soman", "teamA", 0)
  ]);

  assert.equal(maximum, 10);
});

test("official result and score use bowling-feed totals without adding player runs again", () => {
  const score = getLiveInningsScore({
    battingTeamId: "teamA",
    opposingBowlingOvers: [
      over("teamB", "biplab", 1, { runsConceded: 8 }),
      over("teamB", "biplab", 2, { runsConceded: 6 }),
      over("teamB", "biplab", 3, { runsConceded: 4 }),
      over("teamB", "biplab", 4, { runsConceded: 2 })
    ],
    playerPerformances: [
      performance("aninda", "teamA", 8),
      performance("atripan", "teamA", 2),
      performance("soman", "teamA", 7)
    ],
    extras: 0
  });

  assert.equal(score.runs, 20);
  assert.equal(score.allocatedBatterRuns, 17);
  assert.equal(score.extras, 3);
  assert.equal(score.battingAllocationTotal, 20);
});

test("server rejects overs after the chase target was already reached", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["arunabha"],
    battingFirstTeamId: "teamB",
    performances: [
      performance("aninda", "teamA", 12),
      performance("arunabha", "teamB", 10)
    ],
    bowlingOvers: {
      teamA: [],
      teamB: [
        over("teamB", "arunabha", 1, { runsConceded: 11 }),
        over("teamB", "arunabha", 2, { runsConceded: 0 })
      ]
    }
  }));

  assert.equal(errors.includes("Delete over 2; the chase target was already reached."), true);
});

test("caught dismissal derives innings wicket, bowler wicket and catcher catch", () => {
  const caughtOver = over("teamA", "aninda", 1, {
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        type: "caught",
        creditedBowlerId: "aninda",
        fielderId: "arunabha"
      })
    ]
  });

  assert.equal(calculateScoreFromBowlingFeed([caughtOver]).wicketsLost, 1);
  assert.equal(calculateBowlerWickets("aninda", [caughtOver]), 1);
  assert.equal(calculatePlayerCatches("arunabha", [caughtOver]), 1);
  assert.equal(calculatePlayerRunOuts("arunabha", [caughtOver]), 0);
});

test("run-out dismissal derives innings wicket and fielder run-out only", () => {
  const runOutOver = over("teamA", "aninda", 1, {
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        type: "run_out",
        creditedBowlerId: null,
        fielderId: "arunabha"
      })
    ]
  });

  assert.equal(calculateScoreFromBowlingFeed([runOutOver]).wicketsLost, 1);
  assert.equal(calculateBowlerWickets("aninda", [runOutOver]), 0);
  assert.equal(calculatePlayerRunOuts("arunabha", [runOutOver]), 1);
});

test("bowler wicket derives innings wicket and bowler wicket only", () => {
  const bowlerWicketOver = over("teamA", "aninda", 1, { wicketsLost: 1 });

  assert.equal(calculateScoreFromBowlingFeed([bowlerWicketOver]).wicketsLost, 1);
  assert.equal(calculateBowlerWickets("aninda", [bowlerWicketOver]), 1);
  assert.equal(calculatePlayerCatches("aninda", [bowlerWicketOver]), 0);
  assert.equal(calculatePlayerRunOuts("aninda", [bowlerWicketOver]), 0);
});

test("three bowler-credited wickets in one over create one hat-trick", () => {
  const hatTrickOver = over("teamA", "aninda", 1, {
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        creditedBowlerId: "aninda"
      }),
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "dipanjan",
        type: "caught",
        creditedBowlerId: "aninda",
        fielderId: "arunabha"
      }),
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "gaurav",
        creditedBowlerId: "aninda"
      })
    ]
  });

  assert.equal(calculatePlayerHatTricks("aninda", [hatTrickOver]), 1);
});

test("two bowler wickets plus one run-out do not create a hat-trick", () => {
  const mixedOver = over("teamA", "aninda", 1, {
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        creditedBowlerId: "aninda"
      }),
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "dipanjan",
        creditedBowlerId: "aninda"
      }),
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "gaurav",
        type: "run_out",
        creditedBowlerId: null,
        fielderId: "arunabha"
      })
    ]
  });

  assert.equal(calculatePlayerHatTricks("aninda", [mixedOver]), 0);
});

test("four-over dismissal example derives per-player wickets catches and run-outs", () => {
  const bowlingOvers = [
    over("teamA", "aninda", 1, {
      runsConceded: 10,
      dismissals: [
        dismissal({
          overId: "teamA-1",
          battingTeamId: "teamB",
          bowlingTeamId: "teamA",
          dismissedBatterId: "biplab",
          type: "bowled",
          creditedBowlerId: "aninda"
        })
      ]
    }),
    over("teamA", "atripan", 2, {
      runsConceded: 15,
      dismissals: [
        dismissal({
          overId: "teamA-2",
          battingTeamId: "teamB",
          bowlingTeamId: "teamA",
          dismissedBatterId: "dipanjan",
          type: "run_out",
          creditedBowlerId: null,
          fielderId: "soman"
        })
      ]
    }),
    over("teamA", "aninda", 3, {
      runsConceded: 11,
      dismissals: [
        dismissal({
          overId: "teamA-3",
          battingTeamId: "teamB",
          bowlingTeamId: "teamA",
          dismissedBatterId: "gaurav",
          type: "caught",
          creditedBowlerId: "aninda",
          fielderId: "aninda"
        })
      ]
    }),
    over("teamA", "atripan", 4, {
      runsConceded: 5,
      dismissals: [
        dismissal({
          overId: "teamA-4",
          battingTeamId: "teamB",
          bowlingTeamId: "teamA",
          dismissedBatterId: "rohit",
          type: "caught",
          creditedBowlerId: "atripan",
          fielderId: "soman"
        })
      ]
    })
  ];
  const afterThreeOvers = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: bowlingOvers.slice(0, 3),
    scheduledOvers: 8,
    runs: 36
  });
  const allOut = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers,
    scheduledOvers: 8,
    runs: 41
  });
  const bowlerCreditedWickets =
    calculateBowlerWickets("aninda", bowlingOvers) +
    calculateBowlerWickets("atripan", bowlingOvers);
  const runOuts = calculatePlayerRunOuts("soman", bowlingOvers);

  assert.equal(calculateBowlerWickets("aninda", bowlingOvers), 2);
  assert.equal(calculatePlayerCatches("aninda", bowlingOvers), 1);
  assert.equal(calculateBowlerWickets("atripan", bowlingOvers), 1);
  assert.equal(calculatePlayerCatches("soman", bowlingOvers), 1);
  assert.equal(calculatePlayerRunOuts("soman", bowlingOvers), 1);
  assert.equal(calculateBowlerWickets("atripan", [bowlingOvers[1]]), 0);
  assert.equal(calculateScoreFromBowlingFeed(bowlingOvers).wicketsLost, 4);
  assert.equal(bowlerCreditedWickets + runOuts, 4);
  assert.equal(afterThreeOvers.isComplete, false);
  assert.equal(allOut.isAllOut, true);
  assert.equal(allOut.isComplete, true);
});

test("stumped dismissal credits bowler and selected non-bowler stumper only", () => {
  const stumpedOver = over("teamA", "aninda", 1, {
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        type: "stumped",
        creditedBowlerId: "aninda",
        fielderId: "arunabha"
      })
    ]
  });

  assert.equal(calculateScoreFromBowlingFeed([stumpedOver]).wicketsLost, 1);
  assert.equal(calculateBowlerWickets("aninda", [stumpedOver]), 1);
  assert.equal(calculatePlayerStumpings("arunabha", [stumpedOver]), 1);
  assert.equal(calculatePlayerCatches("arunabha", [stumpedOver]), 0);
  assert.equal(calculatePlayerRunOuts("arunabha", [stumpedOver]), 0);
});

test("server rejects stumping when stumper is the bowler", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "biplab"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab"],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              type: "stumped",
              creditedBowlerId: "aninda",
              fielderId: "aninda"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("The bowler cannot also be selected as the stumper."), true);
});

test("server rejects stumping when stumper is not from bowling team", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              type: "stumped",
              creditedBowlerId: "aninda",
              fielderId: "dipanjan"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Every stumping fielder must belong to the bowling team."), true);
});

test("server rejects duplicate dismissed batters in an innings", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              id: "dup-1",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              creditedBowlerId: "aninda"
            }),
            dismissal({
              id: "dup-2",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              creditedBowlerId: "aninda"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("A batter cannot be dismissed twice in the same innings."), true);
});

test("server rejects caught dismissals when catcher is not from bowling team", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              type: "caught",
              creditedBowlerId: "aninda",
              fielderId: "dipanjan"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Every catcher must belong to the bowling team."), true);
});

test("server rejects run-outs when fielder is not from bowling team", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              type: "run_out",
              creditedBowlerId: null,
              fielderId: "dipanjan"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Every run-out fielder must belong to the bowling team."), true);
});

test("server rejects incomplete dismissal rows when finalising", () => {
  const errors = validateMatchRecordInput(validationInput({
    status: "finalised",
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "",
              creditedBowlerId: "aninda"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Complete every bowling over before finalising."), true);
});

test("server rejects a fifth dismissal after a four-player team is all out", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["arunabha", "atripan", "biplab", "dipanjan"],
    performances: [performance("aninda", "teamA", 10)],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              id: "all-out-1",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "arunabha",
              creditedBowlerId: "aninda"
            }),
            dismissal({
              id: "all-out-2",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "atripan",
              creditedBowlerId: "aninda"
            }),
            dismissal({
              id: "all-out-3",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              type: "run_out",
              creditedBowlerId: null,
              fielderId: "aninda"
            }),
            dismissal({
              id: "all-out-4",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "dipanjan",
              type: "run_out",
              creditedBowlerId: null,
              fielderId: "aninda"
            }),
            dismissal({
              id: "all-out-5",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "dipanjan",
              creditedBowlerId: "aninda"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Total wickets cannot exceed the number of players in the batting team."), true);
});

test("server rejects runs or Out status for a player who did not bat", () => {
  const errors = validateMatchRecordInput(validationInput({
    performances: [
      { ...performance("aninda", "teamA", 12), didBat: false, wasOut: true },
      performance("biplab", "teamB", 0)
    ]
  }));

  assert.equal(errors.includes("A player who did not bat must have zero runs and cannot be marked Out."), true);
});

test("finalisation derives extras when player runs are below official total", () => {
  const errors = validateMatchRecordInput(validationInput({
    status: "finalised",
    availablePlayerIds: ["aninda", "arunabha", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    performances: [
      { ...performance("aninda", "teamA", 33), didBat: true },
      performance("arunabha", "teamA", 0),
      performance("biplab", "teamB", 0),
      performance("dipanjan", "teamB", 0)
    ],
    inningsExtras: {
      teamA: 0,
      teamB: 0
    },
    bowlingOvers: {
      teamA: [],
      teamB: [
        over("teamB", "biplab", 1, { runsConceded: 8, wicketsLost: 0 }),
        over("teamB", "biplab", 2, { runsConceded: 10, wicketsLost: 0 }),
        over("teamB", "biplab", 3, { runsConceded: 12, wicketsLost: 0 }),
        over("teamB", "biplab", 4, { runsConceded: 5, wicketsLost: 0 })
      ]
    }
  }));

  assert.equal(errors.length, 0);
});

test("finalisation fails when player runs exceed official total", () => {
  const errors = validateMatchRecordInput(validationInput({
    status: "finalised",
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab"],
    teamAPlayerIds: ["aninda", "arunabha", "atripan"],
    teamBPlayerIds: ["biplab"],
    performances: [
      { ...performance("aninda", "teamA", 36), didBat: true },
      performance("arunabha", "teamA", 0),
      performance("atripan", "teamA", 0),
      performance("biplab", "teamB", 0)
    ],
    inningsExtras: {
      teamA: 2,
      teamB: 0
    },
    bowlingOvers: {
      teamA: [],
      teamB: [
        over("teamB", "biplab", 1, { runsConceded: 8, wicketsLost: 0 }),
        over("teamB", "biplab", 2, { runsConceded: 10, wicketsLost: 1 }),
        over("teamB", "biplab", 3, { runsConceded: 12, wicketsLost: 1 }),
        over("teamB", "biplab", 4, { runsConceded: 5, wicketsLost: 0 })
      ]
    }
  }));

  assert.equal(
    errors.includes("Team A player runs exceed the official total by 1 runs."),
    true
  );
});

test("Team A batting first and defending produces a run-margin victory", () => {
  const result = calculateMatchResult(
    "finalised",
    "teamA",
    innings("teamA", 25, 2, 4),
    innings("teamB", 23, 3, 4)
  );

  assert.deepEqual(result, {
    type: "win_by_runs",
    winnerTeamId: "teamA",
    loserTeamId: "teamB",
    marginRuns: 2
  });
});

test("chasing team wins by wickets using the chasing team's player count", () => {
  const result = calculateMatchResult(
    "finalised",
    "teamB",
    innings("teamB", 35, 3, 4),
    innings("teamA", 37, 1, 4)
  );

  assert.deepEqual(result, {
    type: "win_by_wickets",
    winnerTeamId: "teamA",
    loserTeamId: "teamB",
    wicketsRemaining: 3
  });
});

test("draft live preview never announces a winner or margin", () => {
  const preview = getLiveResultPreview({
    firstInnings: innings("teamA", 0, 0, 4),
    secondInnings: innings("teamB", 9, 0, 4),
    chasingTeamName: "Team B",
    matchStatus: "draft"
  });

  assert.deepEqual(preview, {
    headline: "MATCH DATA IN PROGRESS",
    detail: "RESULT WILL BE CONFIRMED AFTER FINALISATION"
  });
  assert.doesNotMatch(preview.headline, /WINS|BY \d+ WICKETS|BY \d+ RUNS|MATCH TIED/);
});

test("target reached before finalisation stays neutral", () => {
  const first = innings("teamA", 12, 4, 4);
  const second = innings("teamB", 14, 1, 4);
  const preview = getLiveResultPreview({
    firstInnings: first,
    secondInnings: second,
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true
  });
  const finalResult = calculateMatchResult("finalised", "teamA", first, second);

  assert.deepEqual(preview, {
    headline: "TARGET REACHED",
    detail: "FINALISE THE MATCH TO CONFIRM THE RESULT"
  });
  assert.doesNotMatch(preview.headline, /BY \d+ WICKETS|WINS/);
  assert.equal(getFinalResultHeadline(finalResult, "Team A", "Team B"), "TEAM B WINS BY 3 WICKETS");
});

test("in-progress completed innings asks for review without announcing run margin", () => {
  const preview = getLiveResultPreview({
    firstInnings: innings("teamA", 14, 2, 4),
    secondInnings: innings("teamB", 12, 3, 4),
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true,
    secondInningsIsComplete: true
  });

  assert.deepEqual(preview, {
    headline: "MATCH DATA READY FOR REVIEW",
    detail: "FINALISE THE MATCH TO CONFIRM THE RESULT"
  });
  assert.doesNotMatch(preview.headline, /BY \d+ RUNS|WINS|MATCH TIED/);
});

test("tie is shown only after finalisation", () => {
  const first = innings("teamA", 14, 2, 4);
  const second = innings("teamB", 14, 3, 4);
  const preview = getLiveResultPreview({
    firstInnings: first,
    secondInnings: second,
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true,
    secondInningsIsComplete: true
  });
  const finalResult = calculateMatchResult("finalised", "teamA", first, second);

  assert.equal(preview.headline, "MATCH DATA READY FOR REVIEW");
  assert.equal(getFinalResultHeadline(finalResult, "Team A", "Team B"), "MATCH TIED");
});

test("live result wording never renders has reached the target", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.doesNotMatch(form.toLowerCase(), /has reached the target/);
  assert.doesNotMatch(form.toLowerCase(), /currently leads by wickets/);
  assert.doesNotMatch(form, /TEAM B BY 4 WICKETS/);
  assert.match(form, /const resultClassName = isFinal \? result\.type : "pending"/);
  assert.match(form, /isFinal && \(result\.type === "win_by_runs" \|\| result\.type === "win_by_wickets"\)/);
  assert.match(form, /!isFinal \? <Swords/);
});

test("equal final runs produce a tie regardless of wickets lost", () => {
  assert.deepEqual(
    calculateMatchResult(
      "finalised",
      "teamA",
      innings("teamA", 25, 2, 4),
      innings("teamB", 25, 4, 4)
    ),
    { type: "tie" }
  );
});

test("abandoned and cancelled statuses produce No Result only", () => {
  const first = innings("teamA", 25, 2, 4);
  const second = innings("teamB", 25, 4, 4);

  assert.deepEqual(calculateMatchResult("abandoned", "teamA", first, second), {
    type: "no_result"
  });
  assert.deepEqual(calculateMatchResult("cancelled", "teamA", first, second), {
    type: "no_result"
  });
});

test("draft status produces a chase preview only", () => {
  assert.deepEqual(
    calculateMatchResult(
      "draft",
      "teamA",
      innings("teamA", 25, 2, 4),
      innings("teamB", 23, 3, 4)
    ),
    {
      type: "pending",
      chasingTeamId: "teamB",
      target: 26,
      runsRequired: 3,
      targetReached: false,
      scoresLevel: false
    }
  );
});

test("in-progress status reports target reached before finalisation", () => {
  assert.deepEqual(
    calculateMatchResult(
      "in_progress",
      "teamB",
      innings("teamB", 35, 3, 4),
      innings("teamA", 37, 1, 4)
    ),
    {
      type: "pending",
      chasingTeamId: "teamA",
      target: 36,
      runsRequired: 0,
      targetReached: true,
      scoresLevel: false
    }
  );
});

test("scores level preview is explicit before finalisation", () => {
  assert.deepEqual(
    calculateMatchResult(
      "in_progress",
      "teamA",
      innings("teamA", 25, 2, 4),
      innings("teamB", 25, 3, 4)
    ),
    {
      type: "pending",
      chasingTeamId: "teamB",
      target: 26,
      runsRequired: 1,
      targetReached: false,
      scoresLevel: true
    }
  );
});

test("innings order can put Team B first and cricket score format is retained", () => {
  const first = innings("teamB", 35, 3, 4);
  const second = innings("teamA", 37, 1, 4);

  assert.equal(first.battingTeamId, "teamB");
  assert.equal(second.battingTeamId, "teamA");
  assert.equal(formatInningsScore(first.runs, first.wicketsLost), "35/3");
  assert.equal(formatInningsScore(second.runs, second.wicketsLost), "37/1");
});

test("invalid cross-team records prevent finalisation", () => {
  const errors = validateMatchRecordInput(validationInput({
    performances: [performance("aninda", "teamB", 12)]
  }));

  assert.equal(errors.includes("Every performance record must match the player's selected team."), true);
});

test("server validation requires an explicit batting-first team", () => {
  const errors = validateMatchRecordInput(validationInput({
    battingFirstTeamId: undefined
  }));

  assert.equal(errors.includes("SELECT THE BATTING-FIRST TEAM"), true);
});

test("team innings stores runs, wickets and overs under the batting side", () => {
  const built = buildTeamInnings({
    battingTeamId: "teamA",
    battingPlayerIds: ["aninda", "arunabha"],
    performances: [
      performance("aninda", "teamA", 11),
      performance("arunabha", "teamA", 14),
      performance("biplab", "teamB", 99)
    ],
    bowlingOvers: [
      over("teamB", "biplab", 1, { runsConceded: 15, wicketsLost: 1 }),
      over("teamB", "biplab", 2, { runsConceded: 10, wicketsLost: 1 })
    ]
  });

  assert.equal(built.battingTeamId, "teamA");
  assert.equal(built.bowlingTeamId, "teamB");
  assert.equal(built.runs, 25);
  assert.equal(built.wicketsLost, 2);
  assert.equal(built.completedOvers, 2);
  assert.deepEqual(built.battingPerformances.map((record) => record.playerId), [
    "aninda",
    "arunabha"
  ]);
});

test("odd attendance without Shared Player blocks finalisation", () => {
  const errors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      availablePlayerIds: ["aninda", "arunabha", "atripan"],
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["atripan"],
      performances: [
        performance("aninda", "teamA", 10),
        performance("arunabha", "teamA", 8),
        performance("atripan", "teamB", 9)
      ]
    })
  );

  assert.equal(errors.includes("Select one Shared Player to create equal teams."), true);
});

test("valid Shared Player duplication is accepted and ordinary duplication is rejected", () => {
  const validErrors = validateMatchRecordInput(
    validationInput({
      status: "draft",
      availablePlayerIds: ["aninda", "arunabha", "atripan"],
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "atripan"],
      sharedPlayerId: "aninda",
      performances: [
        { ...performance("aninda", "teamA", 12), representingTeamId: "teamA" as const },
        { ...performance("aninda", "teamB", 7), representingTeamId: "teamB" as const },
        performance("arunabha", "teamA", 8),
        performance("atripan", "teamB", 9)
      ]
    })
  );
  const invalidErrors = validateMatchRecordInput(
    validationInput({
      status: "draft",
      availablePlayerIds: ["aninda", "arunabha", "atripan"],
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "arunabha", "atripan"],
      sharedPlayerId: "aninda",
      performances: [
        { ...performance("aninda", "teamA", 12), representingTeamId: "teamA" as const },
        { ...performance("aninda", "teamB", 7), representingTeamId: "teamB" as const },
        performance("arunabha", "teamA", 8),
        performance("atripan", "teamB", 9)
      ]
    })
  );

  assert.equal(validErrors.includes("A player cannot be selected for both teams."), false);
  assert.equal(invalidErrors.includes("A player cannot be selected for both teams."), true);
});

test("Shared Player has separate Team A and Team B batting records", () => {
  const performances = [
    { ...performance("aninda", "teamA", 12), representingTeamId: "teamA" as const },
    { ...performance("aninda", "teamB", 7), representingTeamId: "teamB" as const },
    performance("arunabha", "teamA", 8),
    performance("atripan", "teamB", 9)
  ];

  assert.equal(getPerformanceKey("aninda", "teamA"), "aninda:teamA");
  assert.equal(calculateTeamTotal("teamA", performances), 20);
  assert.equal(calculateTeamTotal("teamB", performances), 16);
});

test("Shared Player counts as one batting slot for wicket limits", () => {
  const sevenPlayerState = getInningsState({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerCount: 4,
    bowlingOvers: [],
    scheduledOvers: 4,
    runs: 0
  });
  const ninePlayerState = getInningsState({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerCount: 5,
    bowlingOvers: [],
    scheduledOvers: 4,
    runs: 0
  });

  assert.equal(sevenPlayerState.maximumWickets, 4);
  assert.equal(ninePlayerState.maximumWickets, 5);
});

test("dismissals reject impossible self-dismissals", () => {
  const selfBowledErrors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      availablePlayerIds: ["aninda", "arunabha", "biplab"],
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "biplab"],
      sharedPlayerId: "aninda",
      performances: [
        { ...performance("aninda", "teamA", 10), representingTeamId: "teamA" as const },
        { ...performance("aninda", "teamB", 8), representingTeamId: "teamB" as const },
        performance("arunabha", "teamA", 6),
        performance("biplab", "teamB", 5)
      ],
      bowlingOvers: {
        teamA: [
          over("teamA", "aninda", 1, {
            dismissals: [
              dismissal({
                overId: "teamA-1",
                battingTeamId: "teamB",
                bowlingTeamId: "teamA",
                dismissedBatterId: "aninda",
                creditedBowlerId: "aninda"
              })
            ]
          })
        ],
        teamB: []
      }
    })
  );
  const selfCaughtErrors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      availablePlayerIds: ["aninda", "arunabha", "biplab"],
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "biplab"],
      sharedPlayerId: "aninda",
      performances: [
        { ...performance("aninda", "teamA", 10), representingTeamId: "teamA" as const },
        { ...performance("aninda", "teamB", 8), representingTeamId: "teamB" as const },
        performance("arunabha", "teamA", 6),
        performance("biplab", "teamB", 5)
      ],
      bowlingOvers: {
        teamA: [
          over("teamA", "aninda", 1, {
            dismissals: [
              dismissal({
                overId: "teamA-1",
                battingTeamId: "teamB",
                bowlingTeamId: "teamA",
                dismissedBatterId: "biplab",
                type: "caught",
                creditedBowlerId: "aninda",
                fielderId: "biplab"
              })
            ]
          })
        ],
        teamB: []
      }
    })
  );

  assert.equal(
    selfBowledErrors.includes("A player cannot be credited with dismissing themselves."),
    true
  );
  assert.equal(
    selfCaughtErrors.includes("A player cannot field their own dismissal."),
    true
  );
});

function baseState() {
  return {
    availablePlayerIds: ["aninda", "biplab"],
    teamAPlayerIds: [],
    teamBPlayerIds: []
  };
}

function validationInput(
  overrides: Partial<{
    matchDate: string;
    matchName: string;
    status: MatchStatus;
    stage: "schedule" | "draft" | "start" | "finalise";
    scheduledOversPerInnings: number | null;
    battingFirstTeamId?: TeamId | null;
    availablePlayerIds: string[];
    teamAPlayerIds: string[];
    teamBPlayerIds: string[];
    sharedPlayerId: string | null;
    inningsExtras: Record<TeamId, number>;
    performances: PlayerMatchPerformance[];
    bowlingOvers: {
      teamA: BowlingOver[];
      teamB: BowlingOver[];
    };
  }> = {}
) {
  return {
    matchDate: "2026-08-04",
    matchName: "Gully Premier League",
    status: "draft" as const,
    scheduledOversPerInnings: 8,
    battingFirstTeamId: "teamA" as const,
    availablePlayerIds: ["aninda", "biplab"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["biplab"],
    sharedPlayerId: null,
    inningsExtras: {
      teamA: 0,
      teamB: 0
    },
    performances: [
      performance("aninda", "teamA", 10),
      performance("biplab", "teamB", 12)
    ],
    bowlingOvers: {
      teamA: [],
      teamB: []
    },
    ...overrides
  };
}

function performance(
  playerId: string,
  teamId: TeamId,
  runs: number
): PlayerMatchPerformance {
  return {
    playerId,
    teamId,
    played: true,
    playerOfMatch: false,
    didBat: true,
    runs,
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0
  };
}

function innings(
  battingTeamId: TeamId,
  runs: number,
  wicketsLost: number,
  playerCount: number
): TeamInnings {
  return {
    battingTeamId,
    bowlingTeamId: battingTeamId === "teamA" ? "teamB" : "teamA",
    runs,
    wicketsLost,
    extras: 0,
    playerCount,
    completedOvers: 0,
    battingPerformances: [],
    bowlingOvers: []
  };
}

function over(
  teamId: TeamId,
  bowlerId: string,
  overNumber: number,
  overrides: Partial<Pick<BowlingOver, "runsConceded" | "dismissals">> & {
    wicketsLost?: number;
  } = {}
): BowlingOver {
  const id = `${teamId}-${overNumber}`;
  const battingTeamId = teamId === "teamA" ? "teamB" : "teamA";
  const dismissals =
    overrides.dismissals ??
    Array.from({ length: overrides.wicketsLost ?? 0 }, (_, index) =>
      dismissal({
        id: `${id}-dismissal-${index + 1}`,
        overId: id,
        battingTeamId,
        bowlingTeamId: teamId,
        dismissedBatterId:
          battingTeamId === "teamA"
            ? ["aninda", "arunabha", "atripan", "dipanjan"][
                overNumber - 1 + index
              ] ?? "aninda"
            : ["biplab", "dipanjan", "arunabha", "atripan"][
                overNumber - 1 + index
              ] ?? "biplab",
        creditedBowlerId: bowlerId || null
      })
    );

  return {
    id,
    bowlingTeamId: teamId,
    battingTeamId,
    bowlerId,
    overNumber,
    runsConceded: overrides.runsConceded ?? 0,
    wicketsTaken: dismissals.length,
    dismissals,
    maiden: false
  };
}

function dismissal(
  overrides: Partial<DismissalEvent> & Pick<
    DismissalEvent,
    "overId" | "battingTeamId" | "bowlingTeamId" | "dismissedBatterId"
  >
): DismissalEvent {
  return {
    id: overrides.id ?? `${overrides.overId}-dismissal`,
    overId: overrides.overId,
    battingTeamId: overrides.battingTeamId,
    bowlingTeamId: overrides.bowlingTeamId,
    dismissedBatterId: overrides.dismissedBatterId,
    type: overrides.type ?? "bowled",
    creditedBowlerId:
      "creditedBowlerId" in overrides ? overrides.creditedBowlerId! : "aninda",
    fielderId: "fielderId" in overrides ? overrides.fielderId! : null
  };
}
