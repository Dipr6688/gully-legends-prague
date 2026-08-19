"use client";

import Image, { type StaticImageData } from "next/image";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode
} from "react";
import {
  calculatePlayerMatchXP,
  cumulativeXPForLevel,
  LEVEL_RULES,
  PLAYER_POWER_RULES,
  RATING_STATUS_RULES,
  XP_RULES
} from "@/lib/progression";
import {
  calculateBattingAllocation,
  calculateMatchResult,
  formatInningsScore,
  MATCH_RULES
} from "@/lib/match-records";
import {
  ADVANCED_CRICKET_STAT_RULES,
  calculateBattingStrikeRate,
  calculateBowlingEconomy
} from "@/lib/advanced-cricket-stats";
import type {
  MatchResult,
  PlayerMatchPerformance,
  TeamId,
  TeamInnings
} from "@/lib/types/match";
import { PLAYER_POWER_ICONS } from "@/lib/data/player-power-icons";

type FormulaAccent = "gold" | "cyan" | "orange" | "green" | "purple";
type FormulaIconAccent = "orange" | "purple" | "green";
type FormulaTabId = "xp-engine" | "level-ladder" | "player-power" | "match-maths";
type FormulaExampleId = "solidAllRound" | "strongMatch";

type FormulaSectionIconProps = {
  src: StaticImageData | string;
  alt: string;
  accent: FormulaIconAccent;
  artworkScale?: number;
  size?: "large" | "hero";
};

type FormulaCardProps = {
  eyebrow?: string;
  title: string;
  formula?: ReactNode;
  accent: FormulaAccent;
  icon?: StaticImageData | string;
  iconSize?: "large" | "hero";
  iconArtworkScale?: number;
  children: ReactNode;
};

const tabs = [
  { id: "xp-engine", label: "XP ENGINE" },
  { id: "level-ladder", label: "LEVEL LADDER" },
  { id: "player-power", label: "PLAYER POWER" },
  { id: "match-maths", label: "MATCH MATHS" }
] as const satisfies Array<{ id: FormulaTabId; label: string }>;

const icons = {
  batting: "/ui/most-runs-bat.png",
  bowling: "/ui/most-wickets-wicket-smash.png",
  fielding: "/ui/most-catches-gloves-ball.png"
} as const;

const FORMULA_ICON_SCALE = {
  batting: 1.65,
  bowling: 1.55,
  fielding: 1.55
} as const;

function getInitialFormulaTab(): FormulaTabId {
  if (typeof window === "undefined") return "xp-engine";

  const requestedTab = new URLSearchParams(window.location.search).get("tab");

  return tabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as FormulaTabId)
    : "xp-engine";
}

function formatSignedXP(value: number) {
  return value > 0 ? `+${value} XP` : `${value} XP`;
}

function getFormulaIconAccent(accent: FormulaAccent): FormulaIconAccent {
  if (accent === "purple" || accent === "green") return accent;

  return "orange";
}

function makePerformance(
  overrides: Partial<PlayerMatchPerformance> = {}
): PlayerMatchPerformance {
  return {
    playerId: "formula-player",
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

function makeInnings(
  battingTeamId: TeamId,
  runs: number,
  wicketsLost: number,
  playerCount = 4
): TeamInnings {
  return {
    battingTeamId,
    bowlingTeamId: battingTeamId === "teamA" ? "teamB" : "teamA",
    runs,
    wicketsLost,
    extras: 0,
    playerCount,
    completedOvers: 4,
    battingPerformances: [],
    bowlingOvers: []
  };
}

function getResultHeadline(result: MatchResult) {
  if (result.type === "win_by_runs") {
    return `TEAM A WINS BY ${result.marginRuns} RUNS`;
  }

  if (result.type === "win_by_wickets") {
    return `TEAM B WINS BY ${result.wicketsRemaining} WICKETS`;
  }

  if (result.type === "tie") return "MATCH TIED";

  return "FINAL RESULT PENDING";
}

function FormulaCard({
  eyebrow,
  title,
  formula,
  accent,
  icon,
  iconSize,
  iconArtworkScale,
  children
}: FormulaCardProps) {
  return (
    <article className={`formula-card formula-card-${accent}`}>
      <div className="formula-card-header">
        {icon && iconSize ? (
          <FormulaSectionIcon
            src={icon}
            alt=""
            accent={getFormulaIconAccent(accent)}
            artworkScale={iconArtworkScale}
            size={iconSize}
          />
        ) : icon ? (
          <Image
            src={icon}
            alt=""
            width={96}
            height={96}
            className="formula-card-icon"
            aria-hidden="true"
          />
        ) : null}
        <div className="formula-heading-copy">
          {eyebrow ? <p className="formula-eyebrow">{eyebrow}</p> : null}
          <h3>{title}</h3>
        </div>
      </div>
      {formula ? <div className="formula-equation">{formula}</div> : null}
      <div className="formula-card-body">{children}</div>
    </article>
  );
}

function FormulaSectionIcon({
  src,
  alt,
  accent,
  artworkScale = 1.55,
  size = "large"
}: FormulaSectionIconProps) {
  return (
    <div
      className={`formula-section-icon formula-section-icon-${accent} formula-section-icon-${size}`}
      style={{ "--artwork-scale": artworkScale } as CSSProperties}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={size === "hero" ? "80px" : "72px"}
        className="formula-section-icon-image"
      />
    </div>
  );
}

function FormulaRoomTabs({
  activeTab,
  onTabChange
}: {
  activeTab: FormulaTabId;
  onTabChange: (tabId: FormulaTabId) => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = tabs.length - 1;
    const nextIndex =
      event.key === "ArrowRight"
        ? index === lastIndex
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? lastIndex
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;

    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onTabChange(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="formula-tabs" role="tablist" aria-label="Formula Room sections">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => {
            tabRefs.current[index] = node;
          }}
          id={`${tab.id}-tab`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`${tab.id}-panel`}
          className="formula-tab-button"
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function RewardCard({
  title,
  value,
  text,
  accent
}: {
  title: string;
  value: string;
  text: string;
  accent: FormulaAccent;
}) {
  return (
    <div className={`formula-reward formula-reward-${accent}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{text}</p>
    </div>
  );
}

function XPReceipt({
  id,
  title,
  rows,
  total,
  isOpen,
  onToggle
}: {
  id: FormulaExampleId;
  title: string;
  rows: Array<[string, number]>;
  total: number;
  isOpen: boolean;
  onToggle: (id: FormulaExampleId) => void;
}) {
  return (
    <article className="xp-receipt" data-example-id={id}>
      <button
        type="button"
        className="xp-receipt-button"
        aria-expanded={isOpen}
        aria-controls={`formula-example-${id}`}
        onClick={() => onToggle(id)}
      >
        <span aria-hidden="true">{isOpen ? "▼" : "▶"}</span>
        <strong>{title}</strong>
      </button>
      {isOpen ? (
        <div id={`formula-example-${id}`} className="xp-receipt-lines">
          {rows.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value > 0 ? `+${value}` : value}</strong>
            </div>
          ))}
          <div className="xp-receipt-total">
            <span>XP AWARDED</span>
            <strong>+{total}</strong>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function FormulaRoomHero() {
  return (
    <section className="formula-hero">
      <p className="formula-eyebrow">Stats</p>
      <h1 className="comic-title">FORMULA ROOM</h1>
      <p>
        Decode the rules behind XP, Levels, Player Power and match calculations.
        Every value comes from finalised Gully Legends performances.
      </p>
    </section>
  );
}

function FormulaFairnessStrip() {
  return (
    <div className="formula-fairness-strip" aria-label="Formula fairness rules">
      <span>Only finalised matches count</span>
      <span>No manual stat boosts</span>
      <span>Achieved Levels never drop</span>
    </div>
  );
}

function XPEnginePanel() {
  const [openExamples, setOpenExamples] = useState<Record<FormulaExampleId, boolean>>({
    solidAllRound: false,
    strongMatch: false
  });
  const regularMatch = calculatePlayerMatchXP(
    makePerformance({ didBat: true, runs: 18, wickets: 1, catches: 1 }),
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
    makePerformance({
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
  const batting18 = calculatePlayerMatchXP(makePerformance({ didBat: true, runs: 18 }));
  const batting52 = calculatePlayerMatchXP(makePerformance({ didBat: true, runs: 52 }));
  const batting100 = calculatePlayerMatchXP(makePerformance({ didBat: true, runs: 100 }));

  function toggleExample(id: FormulaExampleId) {
    setOpenExamples((previous) => ({
      ...previous,
      [id]: !previous[id]
    }));
  }

  return (
    <section
      id="xp-engine-panel"
      role="tabpanel"
      aria-labelledby="xp-engine-tab"
      className="formula-tab-panel"
    >
      <div className="formula-section-intro">
        <h2>XP Engine</h2>
        <p>
          Every finalised performance feeds the XP Engine. Draft and in-progress
          matches never change permanent XP.
        </p>
      </div>

      <div className="formula-grid three">
        <RewardCard
          title="Play the Match"
          value={formatSignedXP(XP_RULES.participation)}
          text="Every player marked as Played receives participation XP."
          accent="purple"
        />
        <RewardCard
          title="Win the Battle"
          value={formatSignedXP(XP_RULES.winBonus)}
          text="Every participating player on the winning team receives the win bonus."
          accent="gold"
        />
        <RewardCard
          title="Rule the Match"
          value={formatSignedXP(XP_RULES.playerOfMatch)}
          text="One outstanding player may receive the Player of the Match reward."
          accent="cyan"
        />
      </div>

      <div className="formula-grid two">
        <FormulaCard
          eyebrow="Batting XP"
          title="Blade Rewards"
          accent="orange"
          icon={icons.batting}
          iconArtworkScale={FORMULA_ICON_SCALE.batting}
          iconSize="hero"
        >
          <dl className="formula-rule-list">
            <div><dt>Every {XP_RULES.runsPerXP} runs</dt><dd>+1 XP</dd></div>
            <div><dt>Ordinary batting XP cap</dt><dd>{XP_RULES.ordinaryBattingCap} XP</dd></div>
            <div><dt>50 or more runs</dt><dd>{formatSignedXP(XP_RULES.fiftyBonus)}</dd></div>
            <div><dt>100 or more runs</dt><dd>{formatSignedXP(XP_RULES.hundredAdditionalBonus)}</dd></div>
            <div><dt>Out for zero</dt><dd>{formatSignedXP(XP_RULES.duckPenalty)}</dd></div>
          </dl>
          <p>
            The duck penalty applies only when the player batted, scored zero and
            was dismissed. Not-out zero and Did Not Bat receive no duck penalty.
            Extras belong to the team, not to an individual batter.
          </p>
          <div className="formula-mini-examples">
            <div><strong>18 Runs</strong><span>{batting18.battingRunsXP} XP</span></div>
            <div>
              <strong>52 Runs</strong>
              <span>
                {batting52.battingRunsXP} run XP + {batting52.battingMilestoneXP} milestone XP ={" "}
                {batting52.battingRunsXP + batting52.battingMilestoneXP} XP
              </span>
            </div>
            <div>
              <strong>100 Runs</strong>
              <span>
                {batting100.battingRunsXP} run XP + {XP_RULES.fiftyBonus} fifty bonus +{" "}
                {XP_RULES.hundredAdditionalBonus} century bonus ={" "}
                {batting100.battingRunsXP + batting100.battingMilestoneXP} XP
              </span>
            </div>
          </div>
        </FormulaCard>

        <FormulaCard
          eyebrow="Bowling XP"
          title="Delivery Rewards"
          accent="purple"
          icon={icons.bowling}
          iconArtworkScale={FORMULA_ICON_SCALE.bowling}
          iconSize="hero"
        >
          <dl className="formula-rule-list">
            <div><dt>Bowler-credited wicket</dt><dd>{formatSignedXP(XP_RULES.wicket)}</dd></div>
            <div><dt>Hat-trick</dt><dd>{formatSignedXP(XP_RULES.hatTrick)}</dd></div>
            <div><dt>Maiden over</dt><dd>{formatSignedXP(XP_RULES.maiden)}</dd></div>
            <div><dt>Run-out</dt><dd>No wicket XP for the bowler</dd></div>
          </dl>
          <p>Bowled, LBW, caught, stumped and other bowler-credited dismissals credit the bowler. A run-out dismisses the batter but does not credit the bowler.</p>
          <div className="formula-damage-box">
            <h4>Over Damage Penalties</h4>
            <span>21-24 runs: {formatSignedXP(XP_RULES.expensiveOver.twentyOneToTwentyFour)}</span>
            <span>25-29 runs: {formatSignedXP(XP_RULES.expensiveOver.twentyFiveToTwentyNine)}</span>
            <span>30 or more: {formatSignedXP(XP_RULES.expensiveOver.thirtyOrMore)}</span>
            <strong>Match floor: {XP_RULES.expensiveOver.matchPenaltyFloor} XP</strong>
            <p>Each completed over is assessed separately. The cap keeps one difficult spell from destroying long-term progress.</p>
          </div>
        </FormulaCard>
      </div>

      <FormulaCard
        eyebrow="Fielding XP"
        title="Fielding Rewards"
        accent="green"
        icon={icons.fielding}
        iconArtworkScale={FORMULA_ICON_SCALE.fielding}
        iconSize="hero"
      >
        <dl className="formula-rule-list four">
          <div><dt>Catch</dt><dd>{formatSignedXP(XP_RULES.catch)}</dd></div>
          <div><dt>Run-out</dt><dd>{formatSignedXP(XP_RULES.runOut)}</dd></div>
          <div><dt>Stumping</dt><dd>{formatSignedXP(XP_RULES.stumping)}</dd></div>
          <div><dt>Combined fielding cap</dt><dd>{XP_RULES.fieldingCap} XP</dd></div>
        </dl>
        <div className="formula-credit-grid">
          <CreditCard title="Caught" bowler="+1 wicket and wicket XP" fielder="+1 catch and catch XP" innings="+1 wicket" />
          <CreditCard title="Run-out" bowler="No wicket" fielder="+1 run-out and run-out XP" innings="+1 wicket" />
          <CreditCard title="Stumped" bowler="+1 wicket and wicket XP" fielder="+1 stumping and stumping XP" innings="+1 wicket" />
        </div>
      </FormulaCard>

      <div id="monthly-beasts">
        <FormulaCard
          eyebrow="Monthly Beasts"
          title="How Beast Crowns Are Decided"
          accent="gold"
        >
          <dl className="formula-rule-list">
            <div><dt>Batting Beast</dt><dd>Monthly batting XP</dd></div>
            <div><dt>Bowling Beast</dt><dd>Monthly bowling XP</dd></div>
            <div>
              <dt>Fielding Beast</dt>
              <dd>Catches and run-out XP</dd>
            </div>
          </dl>
          <p>
            Only successfully finalised matches count. Participation, win bonus
            and Player of the Match XP do not count toward Beast crowns.
          </p>
          <p>
            Equal category XP creates joint leaders, and crowned months store
            those winners as official snapshots.
          </p>
        </FormulaCard>
      </div>

      <div className="formula-range-panel">
        <h3>Match XP Range</h3>
        <div><strong>{XP_RULES.minimumMatchXP} Minimum</strong><strong>+{XP_RULES.maximumMatchXP} Maximum</strong></div>
        <p>
          Exceptional performances receive major rewards, but the match cap keeps
          progression balanced. Penalties can reduce XP progress, but they can
          never remove an achieved Level.
        </p>
      </div>

      <div className="formula-grid two">
        <XPReceipt
          id="solidAllRound"
          title="Solid All-Round Match"
          rows={[
            ["Played", regularMatch.participationXP],
            ["Team won", regularMatch.winBonusXP],
            ["18 runs", regularMatch.battingRunsXP],
            ["1 wicket", regularMatch.wicketXP],
            ["1 catch", regularMatch.fieldingXP]
          ]}
          total={regularMatch.awardedXP}
          isOpen={openExamples.solidAllRound}
          onToggle={toggleExample}
        />
        <XPReceipt
          id="strongMatch"
          title="Strong Match"
          rows={[
            ["Played", strongMatch.participationXP],
            ["Team won", strongMatch.winBonusXP],
            ["Player of the Match", strongMatch.playerOfMatchXP],
            ["52 runs", strongMatch.battingRunsXP],
            ["50-run milestone", strongMatch.battingMilestoneXP],
            ["2 wickets", strongMatch.wicketXP],
            ["1 catch", strongMatch.fieldingXP]
          ]}
          total={strongMatch.awardedXP}
          isOpen={openExamples.strongMatch}
          onToggle={toggleExample}
        />
      </div>
    </section>
  );
}

function CreditCard({
  title,
  bowler,
  fielder,
  innings
}: {
  title: string;
  bowler: string;
  fielder: string;
  innings: string;
}) {
  return (
    <div className="formula-credit-card">
      <h4>{title}</h4>
      <p><strong>Bowler:</strong> {bowler}</p>
      <p><strong>Fielder:</strong> {fielder}</p>
      <p><strong>Innings:</strong> {innings}</p>
    </div>
  );
}

function LevelLadderPanel() {
  const earlyLevels = [0, 1, 2, 3, 4, 5];
  const advancedLevels = [6, 7, 8, 9, 10];

  return (
    <section
      id="level-ladder-panel"
      role="tabpanel"
      aria-labelledby="level-ladder-tab"
      className="formula-tab-panel"
    >
      <div className="formula-section-intro">
        <h2>The Road to Legend Status</h2>
        <p>
          Higher Levels require progressively more XP, turning the top ranks
          into long-term achievements.
        </p>
      </div>
      <FormulaCard
        eyebrow="Next Level"
        title="XP Needed for the Next Level"
        accent="purple"
        formula={
          <>
            {LEVEL_RULES.baseXP} + {LEVEL_RULES.linearXP} x Current Level +{" "}
            {LEVEL_RULES.quadraticXP} x Current Level^2
          </>
        }
      >
        <p>
          The requirement increases after every Level. Early Levels arrive
          relatively quickly while advanced Levels require sustained performance.
        </p>
      </FormulaCard>

      <div className="level-milestones">
        {earlyLevels.map((level) => (
          <div key={level} className="level-milestone-card">
            <span>Level {level}</span>
            <strong>{cumulativeXPForLevel(level).toLocaleString()} total XP</strong>
          </div>
        ))}
      </div>

      <div className="formula-grid two">
        <FormulaCard title="Levels 6-10" accent="cyan">
          <div className="formula-compact-table">
            {advancedLevels.map((level) => (
              <div key={level}>
                <span>Level {level}</span>
                <strong>{cumulativeXPForLevel(level).toLocaleString()} XP</strong>
              </div>
            ))}
          </div>
          <p>The same formula continues beyond Level 10.</p>
        </FormulaCard>
        <FormulaCard
          eyebrow="Shield Active"
          title="Level Protection Active"
          accent="gold"
        >
          <p>
            Once a player earns a Level, that Level cannot be lost. Negative
            match XP may reduce progress toward the next Level, but it can never
            demote the player.
          </p>
          <p>
            Level 3 begins at {cumulativeXPForLevel(3)} XP. A Level 3 player&apos;s XP
            may fall from 720 to 705, but it can never fall below{" "}
            {cumulativeXPForLevel(3)} while Level 3 is protected.
          </p>
        </FormulaCard>
      </div>

      <FormulaCard title="Expected Legend Journey" accent="purple">
        <p>
          Gully Legends normally plays approximately four matches per month. The
          Level curve is balanced around that schedule.
        </p>
        <div className="formula-journey-grid">
          {[
            ["Level 1", "Approximately 1-2 months"],
            ["Level 2", "Approximately 2-3 months total"],
            ["Level 3", "Approximately 4-5 months total"],
            ["Level 4", "Approximately 7-9 months total"],
            ["Level 5", "Approximately 10-13 months total"],
            ["Level 10", "Long-term Legend status"]
          ].map(([level, pace]) => (
            <div key={level}>
              <strong>{level}</strong>
              <span>{pace}</span>
            </div>
          ))}
        </div>
        <p>Actual progress depends on matches played and individual performance.</p>
      </FormulaCard>
    </section>
  );
}

function PlayerPowerPanel() {
  return (
    <section
      id="player-power-panel"
      role="tabpanel"
      aria-labelledby="player-power-tab"
      className="formula-tab-panel"
    >
      <div className="formula-section-intro">
        <h2>Build Your Player Power</h2>
        <p>
          XP controls your Level. Finalised cricket performance shapes your
          Player Power ratings.
        </p>
      </div>
      <div className="power-split">
        <strong>XP -&gt; Level</strong>
        <strong>Cricket Performance -&gt; Player Power</strong>
      </div>
      <div className="formula-grid three">
        {[
          ["batting", PLAYER_POWER_ICONS.batting, "orange"],
          ["bowling", PLAYER_POWER_ICONS.bowling, "purple"],
          ["fielding", PLAYER_POWER_ICONS.fielding, "green"]
        ].map(([key, icon, accent]) => {
          const rule = PLAYER_POWER_RULES[key as keyof typeof PLAYER_POWER_RULES];

          return (
            <FormulaCard
              key={key}
              title={rule.title}
              accent={accent as FormulaAccent}
              icon={icon}
              iconArtworkScale={
                FORMULA_ICON_SCALE[key as keyof typeof FORMULA_ICON_SCALE]
              }
              iconSize="large"
            >
              <p>Output range: {rule.outputRange}</p>
              <ul className="formula-factor-list">
                {rule.factors.map((factor) => (
                  <li key={factor.label}>
                    <span>{factor.label}</span>
                    <strong>{Math.round(factor.weight * 100)}%</strong>
                  </li>
                ))}
              </ul>
            </FormulaCard>
          );
        })}
      </div>
      <FormulaCard title="Rating Status" accent="cyan">
        <p>New players do not begin as weak players. They begin Unrated.</p>
        <div className="rating-status-grid">
          {RATING_STATUS_RULES.map((rule) => (
            <div key={rule.status}>
              <strong>{rule.status}</strong>
              <span>{rule.range}</span>
              <p>{rule.description}</p>
            </div>
          ))}
        </div>
      </FormulaCard>
    </section>
  );
}

function MatchMathsPanel() {
  const allocation = calculateBattingAllocation(40, [
    makePerformance({ didBat: true, runs: 39 })
  ]);
  const defendingResult = calculateMatchResult(
    "finalised",
    "teamA",
    makeInnings("teamA", 14, 2),
    makeInnings("teamB", 12, 3)
  );
  const chasingResult = calculateMatchResult(
    "finalised",
    "teamA",
    makeInnings("teamA", 14, 2),
    makeInnings("teamB", 15, 1)
  );
  const tieResult = calculateMatchResult(
    "finalised",
    "teamA",
    makeInnings("teamA", 14, 2),
    makeInnings("teamB", 14, 3)
  );
  const strikeRateExample = calculateBattingStrikeRate({
    runs: 31,
    ballsFaced: 17
  });
  const economyExample = calculateBowlingEconomy({
    runsConceded: 15,
    legalBalls: 11
  });

  return (
    <section
      id="match-maths-panel"
      role="tabpanel"
      aria-labelledby="match-maths-tab"
      className="formula-tab-panel"
    >
      <div className="formula-section-intro">
        <h2>Cricket Logic, Decoded</h2>
        <p>
          See how player records, bowling feeds and dismissal events become the
          official score and result.
        </p>
      </div>

      <div className="formula-grid two">
        <FormulaCard
          eyebrow="Team Score"
          title="Official Innings Total"
          accent="cyan"
          formula={
            <>
              {MATCH_RULES.teamScore.formula[0]} <span>+</span> {MATCH_RULES.teamScore.formula[1]}
            </>
          }
        >
          <p>
            Official innings runs come from validated match data. Individual
            batter runs explain part of the total. Extras belong to the team but
            not to any batter, and player runs can never exceed the team total.
          </p>
          <div className="formula-score-example">
            <span>Player runs <strong>39</strong></span>
            <span>Extras <strong>{allocation.extras}</strong></span>
            <span>Official score <strong>40</strong></span>
          </div>
          <p>
            Extras may include wides, no-balls, byes or other team extras under
            the simplified Gully Legends scorecard.
          </p>
        </FormulaCard>

        <FormulaCard
          eyebrow="Wickets"
          title="Wicket Accounting"
          accent="orange"
          formula={
            <>
              {MATCH_RULES.wickets.formula[0]} <span>+</span> {MATCH_RULES.wickets.formula[1]}
            </>
          }
        >
          <p>
            Catches and stumpings are not added again to total wickets. They
            describe bowler-credited dismissals. A run-out is an innings wicket
            but not a bowler wicket.
          </p>
          <div className="formula-score-example">
            <span>3 bowler wickets</span>
            <span>+ 1 run-out</span>
            <strong>= 4 total wickets</strong>
          </div>
        </FormulaCard>
      </div>

      <FormulaCard title="Dismissal Credits" accent="green">
        <div className="formula-credit-grid">
          <CreditCard title="Bowled / LBW / Other Bowler Wicket" bowler={MATCH_RULES.dismissalCredits.bowlerWicket.bowler} fielder={MATCH_RULES.dismissalCredits.bowlerWicket.fielder} innings={MATCH_RULES.dismissalCredits.bowlerWicket.innings} />
          <CreditCard title="Caught" bowler={MATCH_RULES.dismissalCredits.caught.bowler} fielder={MATCH_RULES.dismissalCredits.caught.fielder} innings={MATCH_RULES.dismissalCredits.caught.innings} />
          <CreditCard title="Run-out" bowler={MATCH_RULES.dismissalCredits.runOut.bowler} fielder={MATCH_RULES.dismissalCredits.runOut.fielder} innings={MATCH_RULES.dismissalCredits.runOut.innings} />
          <CreditCard title="Stumped" bowler={MATCH_RULES.dismissalCredits.stumped.bowler} fielder={MATCH_RULES.dismissalCredits.stumped.fielder} innings={MATCH_RULES.dismissalCredits.stumped.innings} />
        </div>
        <p>The bowler cannot be selected as the stumper.</p>
      </FormulaCard>

      <FormulaCard
        eyebrow="Advanced Cricket Stats"
        title="Balls, Blades and Economy"
        accent="cyan"
      >
        <dl className="formula-rule-list">
          <div>
            <dt>Balls Faced</dt>
            <dd>Normal balls count. Wides do not. No-balls count for the batter.</dd>
          </div>
          <div>
            <dt>Strike Rate</dt>
            <dd>Tracked Runs / Tracked Balls Faced x 100</dd>
          </div>
          <div>
            <dt>Best Strike Rate</dt>
            <dd>
              Minimum{" "}
              {ADVANCED_CRICKET_STAT_RULES.minimumBallsFacedForStrikeRate} balls faced
            </dd>
          </div>
          <div>
            <dt>Economy</dt>
            <dd>Tracked Runs Conceded x 6 / Tracked Legal Balls</dd>
          </div>
          <div>
            <dt>Best Economy</dt>
            <dd>
              Minimum{" "}
              {ADVANCED_CRICKET_STAT_RULES.minimumLegalBallsForEconomy} legal balls
            </dd>
          </div>
          <div>
            <dt>Fours</dt>
            <dd>Exactly 4 batter runs from one delivery.</dd>
          </div>
          <div>
            <dt>Sixes</dt>
            <dd>Exactly 6 batter runs from one delivery.</dd>
          </div>
          <div>
            <dt>Boundary Count</dt>
            <dd>Career fours + career sixes from event-backed matches.</dd>
          </div>
          <div>
            <dt>Six Machine</dt>
            <dd>Most career sixes from event-backed finalised matches.</dd>
          </div>
          <div>
            <dt>Boundary Bandit</dt>
            <dd>Most career fours plus sixes from event-backed finalised matches.</dd>
          </div>
          <div>
            <dt>Safe Hands</dt>
            <dd>
              Ranked by career catches. If catches are tied, more career
              run-outs ranks higher. If catches and run-outs are both equal,
              players share the rank.
            </dd>
          </div>
          <div>
            <dt>Duck</dt>
            <dd>Batted, dismissed, and scored zero.</dd>
          </div>
        </dl>
        <div className="formula-score-example">
          <span>31 off 17 = <strong>{strikeRateExample?.toFixed(1)} SR</strong></span>
          <span>15 runs / 11 legal balls = <strong>{economyExample?.toFixed(2)} ECO</strong></span>
          <strong>Wide: 0 BF, 0 legal balls. No-ball: +1 BF, 0 legal balls.</strong>
        </div>
        <p>
          Some historical Gully Legends matches were played before ball-by-ball
          tracking was introduced. Career totals such as runs and wickets still
          include those matches where reliable data exists. Balls faced, strike
          rate, economy, fours and sixes are calculated only from matches with
          reliable ball-by-ball event history. Older values are shown as
          unavailable rather than estimated.
        </p>
      </FormulaCard>

      <div className="formula-grid three">
        <FormulaCard title="Run-Margin Victory" accent="gold">
          <p>First-innings score - chasing score</p>
          <div className="formula-score-example">
            <span>Team A {formatInningsScore(14, 2)}</span>
            <span>Team B {formatInningsScore(12, 3)}</span>
            <strong>{getResultHeadline(defendingResult)}</strong>
          </div>
        </FormulaCard>
        <FormulaCard title="Wickets Remaining" accent="purple">
          <p>Chasing team player count - chasing wickets lost</p>
          <div className="formula-score-example">
            <span>Chasing players 4</span>
            <span>Wickets lost 1</span>
            <strong>{getResultHeadline(chasingResult)}</strong>
          </div>
        </FormulaCard>
        <FormulaCard title="Equal Final Run Totals" accent="cyan">
          <p>Wickets do not break a tie. Equal final innings totals mean the match is tied.</p>
          <strong>{getResultHeadline(tieResult)}</strong>
        </FormulaCard>
      </div>

      <FormulaCard title="Finalisation Rule" accent="purple">
        <div className="formula-final-grid">
          <div>
            <h4>Not Final Yet</h4>
            <p>
              Draft and In-Progress matches may show live scores, but they do
              not announce an official winner and do not update permanent player
              careers.
            </p>
          </div>
          <div>
            <h4>Final Result</h4>
            <ul>
              {MATCH_RULES.finalisationUpdates.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </FormulaCard>
    </section>
  );
}

export function FormulaRoom() {
  const [activeTab, setActiveTab] = useState<FormulaTabId>(getInitialFormulaTab);
  const activeTabLabel = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.label ?? "XP ENGINE",
    [activeTab]
  );

  function changeTab(tabId: FormulaTabId) {
    setActiveTab(tabId);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabId);
    window.history.pushState({}, "", url);
  }

  return (
    <main className="formula-room-page">
      <FormulaRoomHero />
      <FormulaFairnessStrip />
      <FormulaRoomTabs activeTab={activeTab} onTabChange={changeTab} />
      <div className="sr-only" aria-live="polite">
        {activeTabLabel} selected
      </div>
      {activeTab === "xp-engine" ? <XPEnginePanel /> : null}
      {activeTab === "level-ladder" ? <LevelLadderPanel /> : null}
      {activeTab === "player-power" ? <PlayerPowerPanel /> : null}
      {activeTab === "match-maths" ? <MatchMathsPanel /> : null}
    </main>
  );
}
