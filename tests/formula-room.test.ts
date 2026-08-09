import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculatePlayerMatchXP,
  cumulativeXPForLevel,
  PLAYER_POWER_RULES,
  RATING_STATUS_RULES,
  XP_RULES
} from "../lib/progression";
import { PLAYER_POWER_ICONS } from "../lib/data/player-power-icons";
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

test("XP Engine displays values from shared XP rules and utility examples", () => {
  const formulaRoom = formulaRoomSource();
  const regularMatch = calculatePlayerMatchXP(
    performance({ didBat: true, runs: 18, wickets: 1, catches: 1 }),
    {
      result: {
        type: "win_by_runs",
        winnerTeamId: "teamA",
        loserTeamId: "teamB",
        marginRuns: 8
      }
    }
  );
  const strongMatch = calculatePlayerMatchXP(
    performance({
      playerOfMatch: true,
      didBat: true,
      runs: 52,
      wickets: 2,
      catches: 1
    }),
    {
      result: {
        type: "win_by_runs",
        winnerTeamId: "teamA",
        loserTeamId: "teamB",
        marginRuns: 18
      }
    }
  );

  assert.match(formulaRoom, /XP_RULES\.participation/);
  assert.match(formulaRoom, /XP_RULES\.winBonus/);
  assert.match(formulaRoom, /XP_RULES\.playerOfMatch/);
  assert.match(formulaRoom, /XP_RULES\.runsPerXP/);
  assert.match(formulaRoom, /XP_RULES\.fiftyBonus/);
  assert.match(formulaRoom, /XP_RULES\.hundredAdditionalBonus/);
  assert.match(formulaRoom, /XP_RULES\.duckPenalty/);
  assert.match(formulaRoom, /XP_RULES\.wicket/);
  assert.match(formulaRoom, /XP_RULES\.hatTrick/);
  assert.match(formulaRoom, /XP_RULES\.maiden/);
  assert.match(formulaRoom, /XP_RULES\.catch/);
  assert.match(formulaRoom, /XP_RULES\.runOut/);
  assert.match(formulaRoom, /XP_RULES\.stumping/);
  assert.match(formulaRoom, /XP_RULES\.fieldingCap/);
  assert.equal(XP_RULES.participation, 20);
  assert.equal(XP_RULES.winBonus, 5);
  assert.equal(XP_RULES.playerOfMatch, 15);
  assert.equal(XP_RULES.minimumMatchXP, -15);
  assert.equal(XP_RULES.maximumMatchXP, 120);
  assert.equal(regularMatch.awardedXP, 50);
  assert.equal(strongMatch.awardedXP, 107);
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
  assert.match(playerProfile, /batting:\s*1\.9/);
  assert.match(playerProfile, /bowling:\s*1\.85/);
  assert.match(playerProfile, /fielding:\s*1\.85/);
  assert.match(playerProfile, /function PlayerProfileIcon/);
  assert.match(playerProfile, /PLAYER_POWER_ICONS\.batting/);
  assert.match(playerProfile, /PLAYER_POWER_ICONS\.bowling/);
  assert.match(playerProfile, /PLAYER_POWER_ICONS\.fielding/);
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
  assert.match(css, /\.player-profile-icon-artwork\s*{[\s\S]*?transform:\s*scale\(var\(--artwork-scale,\s*1\.9\)\)/);
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
