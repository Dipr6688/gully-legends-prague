import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildMatchStory,
  calculateStorySimilarity,
  classifyMatchStory,
  getMatchStoryBackfillCandidates,
  isEligibleForMatchStory,
  type MatchStoryDraft
} from "../lib/match-story";
import type {
  BowlingOver,
  FinalisedPlayerMatchRecord,
  MatchRecord,
  MatchResult,
  MatchStory,
  PlayerMatchXPBreakdown,
  TeamId
} from "../lib/types/match";

function xpBreakdown(awardedXP: number): PlayerMatchXPBreakdown {
  return {
    participationXP: 5,
    winBonusXP: 0,
    playerOfMatchXP: 0,
    battingRunsXP: Math.max(0, awardedXP - 5),
    battingMilestoneXP: 0,
    duckPenaltyXP: 0,
    wicketXP: 0,
    hatTrickXP: 0,
    maidenXP: 0,
    expensiveOverPenaltyXP: 0,
    fieldingXP: 0,
    rawTotalXP: awardedXP,
    awardedXP
  };
}

function record({
  playerId,
  teamId,
  runs = 0,
  didBat = true,
  wickets = 0,
  catches = 0,
  runOuts = 0,
  stumpings = 0,
  playerOfMatch = false
}: {
  playerId: string;
  teamId: TeamId;
  runs?: number;
  didBat?: boolean;
  wickets?: number;
  catches?: number;
  runOuts?: number;
  stumpings?: number;
  playerOfMatch?: boolean;
}): FinalisedPlayerMatchRecord {
  return {
    playerId,
    teamId,
    representingTeamId: teamId,
    played: true,
    playerOfMatch,
    didBat,
    battingPosition: didBat ? 1 : null,
    runs: didBat ? runs : "",
    wasOut: false,
    wickets,
    hatTricks: 0,
    catches,
    runOuts,
    stumpings,
    xpBreakdown: xpBreakdown(20 + runs + wickets * 4 + catches * 2),
    progressionAppliedAt: "2026-08-12T12:00:00.000Z"
  };
}

function bowlingOver({
  id,
  bowlerId,
  battingTeamId,
  bowlingTeamId,
  wickets,
  runsConceded
}: {
  id: string;
  bowlerId: string;
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  wickets: number;
  runsConceded: number;
}): BowlingOver {
  return {
    id,
    bowlerId,
    battingTeamId,
    bowlingTeamId,
    overNumber: 1,
    legalBalls: 6,
    runsConceded,
    wicketsTaken: wickets,
    maiden: runsConceded === 0,
    dismissals: Array.from({ length: wickets }, (_, index) => ({
      id: `${id}-wicket-${index}`,
      overId: id,
      battingTeamId,
      bowlingTeamId,
      dismissedBatterId: index % 2 === 0 ? "aninda" : "soman",
      type: "bowled" as const,
      creditedBowlerId: bowlerId,
      fielderId: null
    }))
  };
}

function match({
  id,
  matchDate = "2026-08-12",
  matchNumber = 1,
  result = { type: "win_by_wickets", winnerTeamId: "teamB", loserTeamId: "teamA", wicketsRemaining: 1 },
  teamARuns = 61,
  teamBRuns = 62,
  teamAWickets = 5,
  teamBWickets = 3,
  firstCompletedOvers = 6,
  secondCompletedOvers = 5.5,
  battingFirstTeamId = "teamA",
  records,
  firstBowlingOvers = [],
  secondBowlingOvers = [],
  status = "finalised",
  isDemo = false,
  isDemoTestMatch = false,
  idPrefix = ""
}: {
  id: string;
  matchDate?: string;
  matchNumber?: number | null;
  result?: MatchResult;
  teamARuns?: number;
  teamBRuns?: number;
  teamAWickets?: number;
  teamBWickets?: number;
  firstCompletedOvers?: number;
  secondCompletedOvers?: number;
  battingFirstTeamId?: TeamId;
  records?: FinalisedPlayerMatchRecord[];
  firstBowlingOvers?: BowlingOver[];
  secondBowlingOvers?: BowlingOver[];
  status?: MatchRecord["status"];
  isDemo?: boolean;
  isDemoTestMatch?: boolean;
  idPrefix?: string;
}): MatchRecord {
  const finalRecords =
    records ??
    [
      record({
        playerId: "dheeraj",
        teamId: "teamA",
        runs: Math.max(0, Math.floor(teamARuns * 0.45)),
        playerOfMatch: result.type !== "win_by_wickets"
      }),
      record({ playerId: "aninda", teamId: "teamA", runs: 18, runOuts: 1 }),
      record({
        playerId: "rohit",
        teamId: "teamB",
        runs: Math.max(0, Math.floor(teamBRuns * 0.42)),
        wickets: 2,
        playerOfMatch: result.type === "win_by_wickets"
      }),
      record({ playerId: "naim", teamId: "teamB", runs: 16, catches: 1 })
    ];
  const firstTeam = battingFirstTeamId;
  const secondTeam = battingFirstTeamId === "teamA" ? "teamB" : "teamA";
  const firstRuns = firstTeam === "teamA" ? teamARuns : teamBRuns;
  const secondRuns = secondTeam === "teamA" ? teamARuns : teamBRuns;
  const firstWickets = firstTeam === "teamA" ? teamAWickets : teamBWickets;
  const secondWickets = secondTeam === "teamA" ? teamAWickets : teamBWickets;
  const teamARecords = finalRecords.filter((item) => item.teamId === "teamA");
  const teamBRecords = finalRecords.filter((item) => item.teamId === "teamB");

  return {
    id: `${idPrefix}${id}`,
    isDemo,
    isDemoTestMatch,
    matchDate,
    matchNumber,
    deletedAt: null,
    matchName: "Story Test Match",
    venue: "CZU Gully Arena",
    status,
    scheduledOversPerInnings: 6,
    battingFirstTeamId,
    chasingTeamId: secondTeam,
    teams: {
      teamA: {
        teamId: "teamA",
        teamName: "Team A",
        playerIds: teamARecords.map((item) => item.playerId),
        playerPerformances: teamARecords,
        bowlingOvers: secondBowlingOvers,
        totalRuns: teamARuns,
        completedBowlingOvers: secondCompletedOvers
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: teamBRecords.map((item) => item.playerId),
        playerPerformances: teamBRecords,
        bowlingOvers: firstBowlingOvers,
        totalRuns: teamBRuns,
        completedBowlingOvers: firstCompletedOvers
      }
    },
    innings: {
      first: {
        battingTeamId: firstTeam,
        bowlingTeamId: secondTeam,
        runs: firstRuns,
        wicketsLost: firstWickets,
        extras: 2,
        playerCount: 5,
        completedOvers: firstCompletedOvers,
        battingPerformances: firstTeam === "teamA" ? teamARecords : teamBRecords,
        bowlingOvers: firstBowlingOvers
      },
      second: {
        battingTeamId: secondTeam,
        bowlingTeamId: firstTeam,
        runs: secondRuns,
        wicketsLost: secondWickets,
        extras: 1,
        playerCount: 5,
        completedOvers: secondCompletedOvers,
        battingPerformances: secondTeam === "teamA" ? teamARecords : teamBRecords,
        bowlingOvers: secondBowlingOvers
      }
    },
    result,
    finalisedPlayerRecords: finalRecords,
    progressionAppliedAt: `${matchDate}T12:00:00.000Z`,
    quickScoring: {
      version: 2,
      setupLocked: true,
      battingMode: "two_batter",
      inningsPhase: "second_innings",
      inningsAEvents: [],
      inningsBEvents: []
    }
  };
}

function storedStory(draft: MatchStoryDraft): MatchStory {
  return {
    ...draft,
    generatedAt: "2026-08-12T12:30:00.000Z",
    createdAt: "2026-08-12T12:30:00.000Z",
    updatedAt: "2026-08-12T12:30:00.000Z"
  };
}

function assertStoryShape(story: MatchStoryDraft | null) {
  assert.ok(story);
  assert.match(story.title, /^[A-Za-z0-9 ]{2,40}$/);
  assert.ok(story.title.split(/\s+/).length >= 2);
  assert.ok(story.title.split(/\s+/).length <= 6);
  const sentenceCount = story.storyText
    .split(/[.!?]+/)
    .filter((sentence) => sentence.trim()).length;

  assert.ok(sentenceCount >= 3);
  assert.ok(sentenceCount <= 5);
  assert.ok(story.storyText.split(/\s+/).length <= 140);
}

function getLastSentence(value: string): string {
  return (
    value
      .split(".")
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .at(-1) ?? ""
  );
}

test("Match Story classifies close chases successful defences last-over finishes and ties", () => {
  assert.ok(
    classifyMatchStory(
      match({
        id: "close-chase",
        result: {
          type: "win_by_wickets",
          winnerTeamId: "teamB",
          loserTeamId: "teamA",
          wicketsRemaining: 1
        },
        secondCompletedOvers: 5.5
      })
    ).includes("CLOSE_CHASE")
  );
  assert.ok(
    classifyMatchStory(
      match({
        id: "last-over",
        result: {
          type: "win_by_wickets",
          winnerTeamId: "teamB",
          loserTeamId: "teamA",
          wicketsRemaining: 3
        },
        secondCompletedOvers: 5.3
      })
    ).includes("LAST_OVER_FINISH")
  );
  assert.ok(
    classifyMatchStory(
      match({
        id: "defence",
        result: {
          type: "win_by_runs",
          winnerTeamId: "teamA",
          loserTeamId: "teamB",
          marginRuns: 6
        },
        teamARuns: 96,
        teamBRuns: 90
      })
    ).includes("SUCCESSFUL_DEFENCE")
  );
  assert.ok(
    classifyMatchStory(
      match({
        id: "tie",
        result: { type: "tie" },
        teamARuns: 60,
        teamBRuns: 60
      })
    ).includes("TIE")
  );
});

test("Match Story identifies wicket-heavy run-out and batting-heavy moments without negative wording", () => {
  const story = buildMatchStory({
    match: match({
      id: "moments",
      teamARuns: 112,
      teamBRuns: 84,
      teamAWickets: 4,
      teamBWickets: 5,
      result: {
        type: "win_by_runs",
        winnerTeamId: "teamA",
        loserTeamId: "teamB",
        marginRuns: 28
      },
      records: [
        record({ playerId: "dipanjan", teamId: "teamA", runs: 52, playerOfMatch: true }),
        record({ playerId: "aninda", teamId: "teamA", runs: 20 }),
        record({ playerId: "rohit", teamId: "teamB", runs: 30, wickets: 3 }),
        record({ playerId: "naim", teamId: "teamB", runs: 12, runOuts: 1 })
      ],
      firstBowlingOvers: [
        bowlingOver({
          id: "rohit-over",
          bowlerId: "rohit",
          battingTeamId: "teamA",
          bowlingTeamId: "teamB",
          wickets: 3,
          runsConceded: 9
        })
      ]
    })
  });
  const traits = classifyMatchStory(match({ id: "traits", teamARuns: 112, teamBRuns: 84 }));

  assertStoryShape(story);
  assert.ok(traits.includes("BATTING_HEAVY"));
  assert.doesNotMatch(
    story?.storyText ?? "",
    /terrible|failed badly|choked|useless|poor form|dropped catch|drop|expensive|duck/i
  );
  assert.doesNotMatch(
    story?.storyText ?? "",
    /clearest batting contribution|scorecard through fielding work|put \d+ next to their name|bowling card its sharpest mark|gave the batting column its main number|gave the fielding notes/i
  );
});

test("Match Story uses natural cricket phrasing and prose result text", () => {
  const chaseStory = buildMatchStory({
    match: match({
      id: "natural-chase",
      result: {
        type: "win_by_wickets",
        winnerTeamId: "teamB",
        loserTeamId: "teamA",
        wicketsRemaining: 1
      },
      teamARuns: 61,
      teamBRuns: 62
    })
  });
  const defenceStory = buildMatchStory({
    match: match({
      id: "natural-defence",
      result: {
        type: "win_by_runs",
        winnerTeamId: "teamA",
        loserTeamId: "teamB",
        marginRuns: 1
      },
      teamARuns: 61,
      teamBRuns: 60
    })
  });

  assertStoryShape(chaseStory);
  assertStoryShape(defenceStory);
  assert.match(chaseStory?.storyText ?? "", /Team B won by one wicket/i);
  assert.match(defenceStory?.storyText ?? "", /Team A won by one run/i);
  assert.doesNotMatch(chaseStory?.storyText ?? "", /\bTEAM [AB] WINS\b/);
  assert.doesNotMatch(defenceStory?.storyText ?? "", /\bTEAM [AB] WINS\b/);
  assert.doesNotMatch(chaseStory?.storyText ?? "", /The cricket bit|The useful detail/i);
});

test("Match Story can mention POM but does not always build around POM", () => {
  const pomSampleStories = Array.from({ length: 12 }, (_, index) =>
    buildMatchStory({
      match: match({
        id: `pom-mentioned-${index}`,
        records: [
          record({ playerId: "rohit", teamId: "teamB", runs: 32, playerOfMatch: true }),
          record({ playerId: "aninda", teamId: "teamA", runs: 7 })
        ]
      })
    })
  );
  const richerStory = buildMatchStory({
    match: match({
      id: "pom-not-needed",
      records: [
        record({ playerId: "rohit", teamId: "teamB", runs: 38, wickets: 3 }),
        record({ playerId: "aninda", teamId: "teamA", runs: 34, runOuts: 1 }),
        record({ playerId: "dheeraj", teamId: "teamA", runs: 18, playerOfMatch: true }),
        record({ playerId: "soman", teamId: "teamB", runs: 16 })
      ],
      firstBowlingOvers: [
        bowlingOver({
          id: "rohit-three",
          bowlerId: "rohit",
          battingTeamId: "teamA",
          bowlingTeamId: "teamB",
          wickets: 3,
          runsConceded: 6
        })
      ]
    })
  });

  assert.equal(
    pomSampleStories.some((story) => /Player of the Match/i.test(story?.storyText ?? "")),
    true
  );
  assert.equal(
    pomSampleStories.every((story) => /Player of the Match/i.test(story?.storyText ?? "")),
    false
  );
  assert.doesNotMatch(richerStory?.storyText ?? "", /Dheeraj took the official Player of the Match/i);
});

test("Match Story excludes demos pending states no-results deleted matches and APK pending previews", () => {
  assert.equal(isEligibleForMatchStory(match({ id: "official" })), true);
  assert.equal(isEligibleForMatchStory(match({ id: "demo", isDemo: true })), false);
  assert.equal(isEligibleForMatchStory(match({ id: "demo-test", isDemoTestMatch: true })), false);
  assert.equal(isEligibleForMatchStory(match({ id: "draft", status: "draft" })), false);
  assert.equal(isEligibleForMatchStory(match({ id: "apk-pending-preview", idPrefix: "" })), false);
  assert.equal(
    isEligibleForMatchStory({
      ...match({ id: "no-result" }),
      result: { type: "no_result", reason: "abandoned" }
    }),
    false
  );
  assert.equal(buildMatchStory({ match: match({ id: "demo-story", isDemo: true }) }), null);
});

test("Match Story generation is deterministic and avoids repeated recent titles/openings", () => {
  const current = match({ id: "stable-story", teamARuns: 61, teamBRuns: 62 });
  const first = buildMatchStory({ match: current });
  const second = buildMatchStory({ match: current });
  const varied = buildMatchStory({
    match: current,
    recentStories: first ? [storedStory(first)] : []
  });

  assert.deepEqual(first, second);
  assert.notEqual(varied?.storyText, first?.storyText);
  assert.notEqual(varied?.title, first?.title);
  assert.ok(calculateStorySimilarity(first?.storyText ?? "", varied?.storyText ?? "") <= 0.8);
});

test("Match Story similarity keeps short cricket numbers in the comparison", () => {
  const first =
    "Aninda was involved in one run-out. Team A 53/5 came first, and Team B 54/3 followed in the reply. Dheeraj made 23. Team B won by one wicket.";
  const second =
    "Aninda was involved in one run-out. Team A 57/5 came first, and Team B 58/3 followed in the reply. Dheeraj made 25. Team B won by one wicket.";

  assert.ok(calculateStorySimilarity(first, second) < 0.9);
});

test("Match Story repetition stress test keeps stories titles and structures varied", () => {
  const recentStories: MatchStory[] = [];
  const allStories = new Set<string>();
  const stories: MatchStoryDraft[] = [];

  for (let index = 0; index < 60; index += 1) {
    const current = match({
      id: `stress-${index}`,
      matchDate: `2026-08-${String(1 + (index % 20)).padStart(2, "0")}`,
      matchNumber: index + 1,
      teamARuns: 50 + (index % 9),
      teamBRuns: 51 + (index % 9),
      secondCompletedOvers: 4 + (index % 12) / 10
    });
    const story = buildMatchStory({ match: current, recentStories });

    assertStoryShape(story);
    assert.doesNotMatch(story?.storyText ?? "", /Team [AB]'s Team [AB]/);
    assert.doesNotMatch(story?.storyText ?? "", /Team [AB] posted Team [AB]/);
    assert.doesNotMatch(
      story?.storyText ?? "",
      /The useful detail|One proper moment|The cricket bit|A small swing|The friendly twist|The scorecard note|without needing any extra decoration|other fingerprints/
    );
    assert.equal(allStories.has(story?.storyText ?? ""), false);
    allStories.add(story?.storyText ?? "");
    if (story) stories.push(story);
    if (story) recentStories.unshift(storedStory(story));
  }

  const titleCounts = new Map<string, number>();
  const closingCounts = new Map<string, number>();
  const structureRuns: number[] = [];
  let currentStructure = "";
  let currentRunLength = 0;

  for (const story of stories) {
    titleCounts.set(story.title, (titleCounts.get(story.title) ?? 0) + 1);
    const closing = getLastSentence(story.storyText);
    closingCounts.set(closing, (closingCounts.get(closing) ?? 0) + 1);

    const structure = story.storyStyle.split(":")[1] ?? story.storyStyle;
    if (structure === currentStructure) {
      currentRunLength += 1;
    } else {
      if (currentRunLength > 0) structureRuns.push(currentRunLength);
      currentStructure = structure;
      currentRunLength = 1;
    }
  }
  structureRuns.push(currentRunLength);

  assert.ok(Math.max(...titleCounts.values()) <= 3);
  assert.ok(Math.max(...closingCounts.values()) <= 4);
  assert.ok(Math.max(...structureRuns) <= 2);
  assert.equal(
    stories.some((story) =>
      /clearest batting contribution|scorecard through fielding work|put \d+ next to their name|bowling card its sharpest mark|TEAM [AB] WINS|MATCH TIED/i.test(
        story.storyText
      )
    ),
    false
  );
});

test("Match Story backfill candidates are eligible official matches without an existing story", () => {
  const draft = buildMatchStory({ match: match({ id: "candidate" }) });
  const withStory = {
    ...match({ id: "with-story" }),
    matchStory: draft ? storedStory(draft) : null
  };
  const candidates = getMatchStoryBackfillCandidates([
    match({ id: "needs-story" }),
    withStory,
    match({ id: "demo", isDemo: true }),
    match({ id: "in-progress", status: "in_progress" })
  ]);

  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["needs-story"]
  );
});

test("Match Story persistence is isolated, idempotent and hooked after finalisation", () => {
  const migration = readFileSync(
    "supabase/migrations/20260827120000_match_stories.sql",
    "utf8"
  );
  const repository = readFileSync(
    "lib/supabase/match-story-repository.ts",
    "utf8"
  );
  const helper = readFileSync(
    "lib/supabase/match-story-finalisation.ts",
    "utf8"
  );
  const finaliseRoute = readFileSync(
    "app/api/admin/matches/finalize/route.ts",
    "utf8"
  );
  const apkFinaliseRoute = readFileSync(
    "app/api/admin/apk-imports/[importId]/finalize/route.ts",
    "utf8"
  );
  const finaliseIndex = finaliseRoute.indexOf("finalizeAtomically(plan)");
  const storyIndex = finaliseRoute.indexOf(
    "await safelyCreateMatchStoryAfterOfficialFinalisation",
    finaliseIndex
  );

  assert.match(migration, /create table if not exists public\.match_stories/);
  assert.match(migration, /match_id text primary key references public\.matches\(id\) on delete cascade/);
  assert.match(migration, /alter table public\.match_stories enable row level security/);
  assert.match(migration, /grant select on public\.match_stories to anon, authenticated/);
  assert.match(migration, /with check \(\s*public\.is_admin\(\)/);
  assert.match(repository, /ignoreDuplicates:\s*true/);
  assert.match(repository, /onConflict:\s*"match_id"/);
  assert.match(helper, /try \{/);
  assert.match(helper, /console\.error\("Match story generation failed after official finalisation\."/);
  assert.ok(finaliseIndex >= 0);
  assert.ok(storyIndex > finaliseIndex);
  assert.match(apkFinaliseRoute, /safelyCreateMatchStoryAfterOfficialFinalisation/);
  assert.match(finaliseRoute, /revalidatePath\("\/match-diary"\)/);
});

test("Match Story UI renders scorecard and diary surfaces without render-time generation", () => {
  const scorecard = readFileSync("components/matches/MatchScorecard.tsx", "utf8");
  const archive = readFileSync("components/matches/MatchArchive.tsx", "utf8");
  const diary = readFileSync("app/match-diary/page.tsx", "utf8");
  const publicRead = readFileSync("lib/supabase/public-read-data.ts", "utf8");

  assert.match(scorecard, /match\.matchStory/);
  assert.match(scorecard, /Match Story/);
  assert.match(archive, /match-archive-story-title/);
  assert.match(diary, /Match Diary/);
  assert.match(diary, /filter\(\(match\) => match\.matchStory\)/);
  assert.doesNotMatch(scorecard + archive + diary, /buildMatchStory\(/);
  assert.match(publicRead, /SupabaseMatchStoryRepository/);
  assert.match(publicRead, /storyRepository\.getStories\(\)\.catch\(\(\) => \[\]\)/);
});
