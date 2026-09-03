import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  cumulativeXPForLevel,
  PLAYER_POWER_RULES,
  RATING_STATUS_RULES,
  XP_V2_EFFECTIVE_DATE_LABEL,
  XP_V2_OVER_QUALITY_RULES,
  XP_V2_RULES
} from "../lib/progression";
import {
  PLAYER_FILE_ICONS,
  PLAYER_POWER_ICONS,
  PLAYER_PROFILE_POWER_ICONS
} from "../lib/data/player-power-icons";
import { calculateBattingAllocation, calculateMatchResult } from "../lib/match-records";
import type { PlayerMatchPerformance, TeamInnings } from "../lib/types/match";

const formulaRoomSource = () =>
  readFileSync("components/stats/FormulaRoom.tsx", "utf8");
const playerProfileSource = () =>
  readFileSync("components/players/PlayerProfile.tsx", "utf8");
const playerCardSource = () =>
  readFileSync("components/players/PlayerCard.tsx", "utf8");
const playerPowerIconConfigSource = () =>
  readFileSync("lib/data/player-power-icons.ts", "utf8");
const statsPageSource = () => readFileSync("app/stats/page.tsx", "utf8");
const cssSource = () => readFileSync("app/globals.css", "utf8");

function performance(overrides: Partial<PlayerMatchPerformance> = {}): PlayerMatchPerformance {
  return {
    playerId: "aninda",
    teamId: "teamA",
    played: true,
    playerOfMatch: false,
    didBat: false,
    runs: 0,
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    ...overrides
  };
}

function innings(teamId: "teamA" | "teamB", runs: number, wicketsLost: number): TeamInnings {
  return {
    battingTeamId: teamId,
    bowlingTeamId: teamId === "teamA" ? "teamB" : "teamA",
    runs,
    wicketsLost,
    extras: 0,
    playerCount: 4,
    completedOvers: 4,
    battingPerformances: [],
    bowlingOvers: []
  };
}

test("Stats page renders the Formula Room instead of placeholder cards", () => {
  const page = statsPageSource();
  const formulaRoom = formulaRoomSource();

  assert.match(page, /<FormulaRoom \/>/);
  assert.match(formulaRoom, /FORMULA ROOM/);
  assert.match(formulaRoom, /Decode the rules behind XP, Levels, Player Power and match calculations/);
  assert.doesNotMatch(formulaRoom, /Rating starts at 0\/100/);
  assert.doesNotMatch(formulaRoom, /Calculation logic will be added/);
  assert.doesNotMatch(formulaRoom, /When finalised match data exists/i);
  assert.doesNotMatch(formulaRoom, /Coming in a later phase/i);
  assert.doesNotMatch(formulaRoom, /Phase 1/i);
  assert.doesNotMatch(formulaRoom, /mock data/i);
});

test("Formula Room tabs render all sections and are accessible", () => {
  const formulaRoom = formulaRoomSource();

  assert.match(formulaRoom, /"xp-engine"/);
  assert.match(formulaRoom, /"level-ladder"/);
  assert.match(formulaRoom, /"player-power"/);
  assert.match(formulaRoom, /"match-maths"/);
  assert.match(formulaRoom, /useState<FormulaTabId>\(getInitialFormulaTab\)/);
  assert.match(formulaRoom, /return "xp-engine"/);
  assert.match(formulaRoom, /role="tablist"/);
  assert.match(formulaRoom, /role="tab"/);
  assert.match(formulaRoom, /aria-selected=\{activeTab === tab\.id\}/);
  assert.match(formulaRoom, /role="tabpanel"/);
  assert.match(formulaRoom, /onKeyDown/);
  assert.match(formulaRoom, /ArrowRight/);
  assert.match(formulaRoom, /ArrowLeft/);
  assert.match(formulaRoom, /url\.searchParams\.set\("tab", tabId\)/);
});

test("Formula Room does not duplicate Leaderboard categories", () => {
  const formulaRoom = formulaRoomSource();

  assert.doesNotMatch(formulaRoom, /Most Runs/);
  assert.doesNotMatch(formulaRoom, /Most Wickets/);
  assert.doesNotMatch(formulaRoom, /Most Catches/);
  assert.doesNotMatch(formulaRoom, /Highest XP/);
  assert.doesNotMatch(formulaRoom, /Highest-Level/);
  assert.doesNotMatch(formulaRoom, /top-three/i);
});

test("Formula Room documents shared advanced boundary calculations without duplicating rankings", () => {
  const formulaRoom = formulaRoomSource();

  assert.match(formulaRoom, /Fours/);
  assert.match(formulaRoom, /Exactly 4 batter runs from one delivery/);
  assert.match(formulaRoom, /Sixes/);
  assert.match(formulaRoom, /Exactly 6 batter runs from one delivery/);
  assert.match(formulaRoom, /Boundary Count/);
  assert.match(formulaRoom, /Career fours \+ career sixes from event-backed matches/);
  assert.match(formulaRoom, /Six Machine/);
  assert.match(formulaRoom, /Most career sixes from event-backed finalised matches/);
  assert.match(formulaRoom, /Boundary Bandit/);
  assert.match(formulaRoom, /Safe Hands/);
  assert.match(
    formulaRoom,
    /Ranked by career catches\. If catches are tied, more career\s+run-outs ranks higher/
  );
  assert.match(
    formulaRoom,
    /If catches and run-outs are both equal,\s+players share the rank/
  );
  assert.match(formulaRoom, /Best Batting Average/);
  assert.match(formulaRoom, /Runs scored \/ Times dismissed/);
  assert.match(formulaRoom, /Minimum 5 batting innings and at\s+least 1 dismissal/);
  assert.match(formulaRoom, /Tracked Runs \/ Tracked Balls Faced x 100/);
  assert.match(formulaRoom, /Tracked Runs Conceded x 6 \/ Tracked Legal Balls/);
  assert.match(
    formulaRoom,
    /Some historical Gully Legends matches were played before ball-by-ball\s+tracking was introduced/
  );
  assert.match(
    formulaRoom,
    /Career totals such as runs and wickets still\s+include those matches where reliable data exists/
  );
  assert.match(
    formulaRoom,
    /Balls faced, strike\s+rate, economy, fours and sixes are calculated only from matches with\s+reliable ball-by-ball event history/
  );
  assert.match(
    formulaRoom,
    /Older values are shown as\s+unavailable rather than estimated/
  );
});

test("XP Engine presents XP v2 as current and covers every public rule", () => {
  const formulaRoom = formulaRoomSource();

  assert.equal(XP_V2_EFFECTIVE_DATE_LABEL, "1 September 2026");
  assert.match(formulaRoom, /XP_V2_EFFECTIVE_DATE_LABEL/);
  assert.match(formulaRoom, /XP_V2_OVER_QUALITY_RULES/);
  assert.match(formulaRoom, /XP_V2_RULES/);
  assert.match(formulaRoom, /Current rules/);
  assert.match(formulaRoom, /XP Engine v2/);
  assert.match(formulaRoom, /General XP/);
  assert.equal(XP_V2_RULES.participation, 20);
  assert.equal(XP_V2_RULES.winBonus, 5);
  assert.equal(XP_V2_RULES.playerOfMatch, 15);

  assert.match(formulaRoom, /Batting XP v2/);
  assert.match(formulaRoom, /Completed pairs in the first 60 runs/);
  assert.match(formulaRoom, /completed groups of 4 after 60/);
  assert.equal(XP_V2_RULES.fiftyBonus, 15);
  assert.equal(XP_V2_RULES.hundredAdditionalBonus, 25);
  assert.equal(XP_V2_RULES.duckPenalty, -8);
  assert.equal(XP_V2_RULES.regularBattingCareerCap, 50);
  assert.match(formulaRoom, /not-out zero and Did Not Bat are not ducks/);

  assert.match(formulaRoom, /Bowling XP v2/);
  assert.deepEqual(
    XP_V2_OVER_QUALITY_RULES.map(({ label, points }) => [label, points]),
    [
      ["0 runs", 10],
      ["1-3 runs", 6],
      ["4-6 runs", 3],
      ["7-9 runs", 1],
      ["10-12 runs", 0],
      ["13-15 runs", -2],
      ["16-18 runs", -4],
      ["19-21 runs", -6],
      ["22-24 runs", -8],
      ["25-29 runs", -11],
      ["30+ runs", -15]
    ]
  );
  assert.match(formulaRoom, /Only a completed\s+six-legal-ball over earns a quality score/);
  assert.match(formulaRoom, /0-run over is the maiden reward: \+10 once/);
  assert.match(formulaRoom, /There is no separate\s+maiden bonus in v2/);
  assert.equal(XP_V2_RULES.positiveOverQualityCareerCap, 30);
  assert.equal(XP_V2_RULES.negativeOverQualityCareerFloor, -20);

  assert.match(formulaRoom, /Fielding XP v2/);
  assert.equal(XP_V2_RULES.catch, 6);
  assert.equal(XP_V2_RULES.runOut, 8);
  assert.equal(XP_V2_RULES.stumping, 8);
  assert.equal(XP_V2_RULES.fieldingCareerCap, 40);

  assert.match(formulaRoom, /Career match XP/);
  assert.equal(XP_V2_RULES.minimumMatchXP, -15);
  assert.equal(XP_V2_RULES.maximumMatchXP, 160);
  assert.match(formulaRoom, /Monthly Beast raw category points/);
  assert.match(formulaRoom, /Career XP vs Beast Points/);
  assert.match(formulaRoom, /Participation, win bonus and Player of the Match XP do not count toward\s+Beast crowns/);
  assert.match(formulaRoom, /Total career XP does not count either/);
  assert.match(formulaRoom, /Earlier Matches Keep Their Original Rules/);

  assert.doesNotMatch(formulaRoom, /XP_RULES/);
  assert.doesNotMatch(formulaRoom, /Ordinary batting XP cap/);
  assert.doesNotMatch(formulaRoom, /Over Damage Penalties/);
  assert.doesNotMatch(formulaRoom, /Combined fielding cap/);
  assert.doesNotMatch(formulaRoom, /const XP_V2\s*=/);
  assert.doesNotMatch(formulaRoom, /const BOWLING_OVER_QUALITY\s*=/);
});

test("Formula Room XP examples expand independently without grid row stretching", () => {
  const formulaRoom = formulaRoomSource();
  const css = cssSource();

  assert.match(formulaRoom, /type FormulaExampleId = "solidAllRound" \| "strongMatch"/);
  assert.match(formulaRoom, /useState<Record<FormulaExampleId, boolean>>\(\{[\s\S]*?solidAllRound:\s*false,[\s\S]*?strongMatch:\s*false/);
  assert.match(formulaRoom, /function toggleExample\(id: FormulaExampleId\)/);
  assert.match(formulaRoom, /\.\.\.previous,[\s\S]*?\[id\]: !previous\[id\]/);
  assert.match(formulaRoom, /id="solidAllRound"/);
  assert.match(formulaRoom, /isOpen=\{openExamples\.solidAllRound\}/);
  assert.match(formulaRoom, /id="strongMatch"/);
  assert.match(formulaRoom, /isOpen=\{openExamples\.strongMatch\}/);
  assert.match(formulaRoom, /aria-expanded=\{isOpen\}/);
  assert.match(formulaRoom, /aria-controls=\{`formula-example-\$\{id\}`\}/);
  assert.match(formulaRoom, /onClick=\{\(\) => onToggle\(id\)\}/);
  assert.match(formulaRoom, /\{isOpen \? \([\s\S]*?<div id=\{`formula-example-\$\{id\}`\} className="xp-receipt-lines">/);
  assert.match(formulaRoom, /isOpen \? "▼" : "▶"/);
  assert.doesNotMatch(formulaRoom, /<details className="xp-receipt"/);
  assert.doesNotMatch(formulaRoom, /<summary>/);
  assert.match(css, /\.formula-grid\s*{[\s\S]*?align-items:\s*start/);
  assert.match(css, /\.xp-receipt\s*{[\s\S]*?align-self:\s*start/);
  assert.match(css, /\.xp-receipt\s*{[\s\S]*?height:\s*fit-content/);
  assert.doesNotMatch(css, /\.formula-grid\s*{[^}]*align-items:\s*stretch/);
  assert.doesNotMatch(css, /\.formula-grid\s*{[^}]*grid-auto-rows:\s*1fr/);
  assert.doesNotMatch(css, /\.xp-receipt\s*{[^}]*(h-full|min-height:\s*100%)/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*?\.formula-grid\.two/);
});

test("Level Ladder thresholds are generated from cumulative XP utility", () => {
  const formulaRoom = formulaRoomSource();

  assert.match(formulaRoom, /cumulativeXPForLevel\(level\)/);
  assert.equal(cumulativeXPForLevel(1), 150);
  assert.equal(cumulativeXPForLevel(2), 360);
  assert.equal(cumulativeXPForLevel(3), 650);
  assert.equal(cumulativeXPForLevel(5), 1550);
  assert.equal(cumulativeXPForLevel(10), 6600);
  assert.match(formulaRoom, /Level Protection Active/);
  assert.match(formulaRoom, /Expected Legend Journey/);
});

test("Player Power explains only the shared current formula factors", () => {
  const formulaRoom = formulaRoomSource();

  assert.match(formulaRoom, /PLAYER_POWER_RULES/);
  assert.equal(PLAYER_POWER_RULES.batting.title, "Blade Power");
  assert.equal(PLAYER_POWER_RULES.bowling.title, "Delivery Threat");
  assert.equal(PLAYER_POWER_RULES.fielding.title, "Field Reflex");
  assert.match(formulaRoom, /RATING_STATUS_RULES/);
  assert.deepEqual(
    RATING_STATUS_RULES.map((rule) => rule.status),
    ["UNRATED", "SCOUTING", "PROVISIONAL", "ESTABLISHED"]
  );
  assert.doesNotMatch(formulaRoom, /all players as 0\/100/i);
});

test("Match Maths examples are calculated from match utilities", () => {
  const formulaRoom = formulaRoomSource();
  const allocation = calculateBattingAllocation(40, [
    performance({ didBat: true, runs: 39 })
  ]);
  const defending = calculateMatchResult(
    "finalised",
    "teamA",
    innings("teamA", 14, 2),
    innings("teamB", 12, 3)
  );
  const chasing = calculateMatchResult(
    "finalised",
    "teamA",
    innings("teamA", 14, 2),
    innings("teamB", 15, 1)
  );
  const tied = calculateMatchResult(
    "finalised",
    "teamA",
    innings("teamA", 14, 2),
    innings("teamB", 14, 3)
  );

  assert.equal(allocation.extras, 1);
  assert.deepEqual(defending, {
    type: "win_by_runs",
    winnerTeamId: "teamA",
    loserTeamId: "teamB",
    marginRuns: 2
  });
  assert.deepEqual(chasing, {
    type: "win_by_wickets",
    winnerTeamId: "teamB",
    loserTeamId: "teamA",
    wicketsRemaining: 3
  });
  assert.deepEqual(tied, { type: "tie" });
  assert.match(formulaRoom, /calculateBattingAllocation/);
  assert.match(formulaRoom, /calculateMatchResult/);
  assert.match(formulaRoom, /No wicket/);
  assert.match(formulaRoom, /\+1 catch/);
  assert.match(formulaRoom, /\+1 stumping/);
  assert.match(formulaRoom, /First-innings score - chasing score/);
  assert.match(formulaRoom, /Chasing team player count - chasing wickets lost/);
  assert.match(formulaRoom, /Equal final innings totals mean the match is tied/);
  assert.match(formulaRoom, /Finalisation Rule/);
});

test("Formula Room uses approved assets and responsive overflow protections", () => {
  const formulaRoom = formulaRoomSource();
  const css = cssSource();

  assert.match(formulaRoom, /from "next\/image"/);
  assert.match(formulaRoom, /function FormulaSectionIcon/);
  assert.match(formulaRoom, /FORMULA_ICON_SCALE/);
  assert.match(formulaRoom, /batting:\s*1\.65/);
  assert.match(formulaRoom, /bowling:\s*1\.55/);
  assert.match(formulaRoom, /fielding:\s*1\.55/);
  assert.match(formulaRoom, /iconSize="hero"/);
  assert.match(formulaRoom, /iconSize="large"/);
  assert.match(formulaRoom, /\/ui\/most-runs-bat\.png/);
  assert.match(formulaRoom, /\/ui\/most-wickets-wicket-smash\.png/);
  assert.match(formulaRoom, /\/ui\/most-catches-gloves-ball\.png/);
  assert.match(css, /\.formula-tabs\s*{[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.formula-grid\s*{[\s\S]*?min-width:\s*0/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*?\.formula-grid\.two/);
});

test("Player Power surfaces use the approved shared icon configuration", () => {
  const formulaRoom = formulaRoomSource();
  const playerProfile = playerProfileSource();
  const playerCard = playerCardSource();
  const iconConfig = playerPowerIconConfigSource();
  const css = cssSource();

  assert.deepEqual(PLAYER_POWER_ICONS, {
    batting: "/ui/player-batting-power.png",
    bowling: "/ui/player-bowling-power.png",
    fielding: "/ui/player-fielding-power.png"
  });
  assert.doesNotMatch(iconConfig, /C:\\\\cricket_website/);
  assert.doesNotMatch(iconConfig, /icons\/player-power/);
  assert.match(formulaRoom, /PLAYER_POWER_ICONS\.batting/);
  assert.match(formulaRoom, /PLAYER_POWER_ICONS\.bowling/);
  assert.match(formulaRoom, /PLAYER_POWER_ICONS\.fielding/);
  assert.match(playerProfile, /PLAYER_PROFILE_ICON_SCALE/);
  assert.match(playerProfile, /batting:\s*1\.08/);
  assert.match(playerProfile, /bowling:\s*1\.08/);
  assert.match(playerProfile, /fielding:\s*1\.08/);
  assert.match(playerProfile, /function PlayerProfileIcon/);
  assert.match(playerProfile, /PLAYER_PROFILE_POWER_ICONS\.batting/);
  assert.match(playerProfile, /PLAYER_PROFILE_POWER_ICONS\.bowling/);
  assert.match(playerProfile, /PLAYER_PROFILE_POWER_ICONS\.fielding/);
  assert.match(playerProfile, /PLAYER_FILE_ICONS\.batting/);
  assert.match(playerProfile, /PLAYER_FILE_ICONS\.bowling/);
  assert.match(playerProfile, /PLAYER_FILE_ICONS\.fielding/);
  assert.match(playerProfile, /value: player\.ratings\.batting/);
  assert.match(playerProfile, /value: player\.ratings\.bowling/);
  assert.match(playerProfile, /value: player\.ratings\.fielding/);
  assert.match(playerCard, /value=\{player\.ratings\.batting\}/);
  assert.match(playerCard, /value=\{player\.ratings\.bowling\}/);
  assert.match(playerCard, /value=\{player\.ratings\.fielding\}/);
  assert.doesNotMatch(playerProfile, /\/ui\/most-runs-bat\.png/);
  assert.doesNotMatch(playerProfile, /\/ui\/most-wickets-wicket-smash\.png/);
  assert.doesNotMatch(playerProfile, /\/ui\/most-catches-gloves-ball\.png/);
  assert.match(css, /\.player-profile-icon-artwork\s*{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.player-profile-icon-artwork\s*{[\s\S]*?height:\s*100%/);
  assert.match(css, /\.player-profile-icon-artwork\s*{[\s\S]*?padding:\s*0/);
  assert.match(css, /\.player-profile-icon-artwork\s*{[\s\S]*?transform:\s*scale\(var\(--artwork-scale,\s*1\.08\)\)/);
});

test("Player Profile uses separate polished icon families for power and file traits", () => {
  const playerProfile = playerProfileSource();
  const iconConfig = playerPowerIconConfigSource();
  const css = cssSource();

  assert.deepEqual(PLAYER_PROFILE_POWER_ICONS, {
    batting: "/ui/player-profile/blade-power.png",
    bowling: "/ui/player-profile/delivery-threat.png",
    fielding: "/ui/player-profile/field-reflex.png"
  });
  assert.deepEqual(PLAYER_FILE_ICONS, {
    batting: "/ui/player-profile/batting-dna.png",
    bowling: "/ui/player-profile/bowling-arsenal.png",
    fielding: "/ui/player-profile/fielding-instinct.png"
  });
  assert.notDeepEqual(PLAYER_PROFILE_POWER_ICONS, PLAYER_FILE_ICONS);
  for (const iconPath of [
    ...Object.values(PLAYER_PROFILE_POWER_ICONS),
    ...Object.values(PLAYER_FILE_ICONS)
  ]) {
    assert.equal(existsSync(`public${iconPath}`), true, `${iconPath} should exist`);
  }
  assert.match(iconConfig, /PLAYER_PROFILE_POWER_ICONS/);
  assert.match(iconConfig, /PLAYER_FILE_ICONS/);
  assert.match(playerProfile, /label:\s*"Blade Power"[\s\S]*?PLAYER_PROFILE_POWER_ICONS\.batting/);
  assert.match(playerProfile, /label:\s*"Batting DNA"[\s\S]*?PLAYER_FILE_ICONS\.batting/);
  assert.match(css, /\.career-detail-grid h3\s*{[\s\S]*?font-size:\s*clamp\(1\.05rem,\s*1\.5vw,\s*1\.18rem\)/);
  assert.match(css, /\.career-detail-grid dt\s*{[\s\S]*?font-size:\s*0\.86rem/);
  assert.match(css, /\.career-detail-grid dd\s*{[\s\S]*?font-size:\s*1\.02rem/);
});

test("Formula Room large heading icons use requested responsive holder sizes", () => {
  const css = cssSource();

  assert.match(css, /\.formula-section-icon-hero\s*{[\s\S]*?width:\s*80px/);
  assert.match(css, /\.formula-section-icon-hero\s*{[\s\S]*?height:\s*80px/);
  assert.match(css, /\.formula-section-icon-large\s*{[\s\S]*?width:\s*72px/);
  assert.match(css, /\.formula-section-icon-large\s*{[\s\S]*?height:\s*72px/);
  assert.match(css, /\.formula-section-icon-image\s*{[\s\S]*?object-fit:\s*contain/);
  assert.match(css, /\.formula-section-icon\s*{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.formula-section-icon-image\s*{[\s\S]*?padding:\s*2px/);
  assert.match(css, /\.formula-section-icon-image\s*{[\s\S]*?transform:\s*scale\(var\(--artwork-scale,\s*1\.55\)\)/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*?\.formula-section-icon-hero\s*{[\s\S]*?width:\s*72px/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*?\.formula-section-icon-large\s*{[\s\S]*?width:\s*66px/);
  assert.match(css, /@media \(max-width:\s*520px\)[\s\S]*?\.formula-section-icon-hero\s*{[\s\S]*?width:\s*62px/);
  assert.match(css, /@media \(max-width:\s*520px\)[\s\S]*?\.formula-section-icon-large\s*{[\s\S]*?width:\s*58px/);
});
