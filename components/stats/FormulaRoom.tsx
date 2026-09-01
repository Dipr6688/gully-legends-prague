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
  cumulativeXPForLevel,
  LEVEL_RULES,
  PLAYER_POWER_RULES,
  RATING_STATUS_RULES,
  XP_V2_EFFECTIVE_DATE_LABEL,
  XP_V2_OVER_QUALITY_RULES,
  XP_V2_RULES
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
  id?: string;
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
  id,
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
    <article id={id} className={`formula-card formula-card-${accent}`}>
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
      <div className="formula-version-banner">
        <span>Current rules</span>
        <div>
          <strong>XP v2</strong>
          <p>Applies to matches dated {XP_V2_EFFECTIVE_DATE_LABEL} onward.</p>
        </div>
      </div>

      <div className="formula-section-intro">
        <h2>XP Engine v2</h2>
        <p>
          Play, perform and build your Legend career. Only official, finalised,
          non-demo matches award career XP. The match date decides which rules apply.
        </p>
      </div>

      <FormulaCard
        eyebrow="General XP"
        title="Show Up. Win. Rule the Match."
        accent="cyan"
      >
        <p>
          These match rewards sit alongside your batting, bowling and fielding XP.
          Player of the Match is the official selection recorded when the match is finalised.
        </p>
        <div className="formula-grid three">
          <RewardCard
            title="Played"
            value={formatSignedXP(XP_V2_RULES.participation)}
            text="Awarded once when you play in the official match."
            accent="purple"
          />
          <RewardCard
            title="Win"
            value={formatSignedXP(XP_V2_RULES.winBonus)}
            text="Added for a participating player on the winning team."
            accent="gold"
          />
          <RewardCard
            title="Official POM"
            value={formatSignedXP(XP_V2_RULES.playerOfMatch)}
            text="Added only to the officially selected Player of the Match."
            accent="cyan"
          />
        </div>
        <p className="formula-note">
          A Shared Player still receives one career match and one XP award, with no
          normal win bonus.
        </p>
      </FormulaCard>

      <div className="formula-grid three">
        <FormulaCard
          eyebrow="Batting XP v2"
          title="Runs Build in Two Gears"
          accent="orange"
          icon={icons.batting}
          iconArtworkScale={FORMULA_ICON_SCALE.batting}
          iconSize="hero"
        >
          <div className="formula-equation formula-equation-stacked">
            <span>Completed pairs in the first 60 runs</span>
            <span>+ completed groups of 4 after 60</span>
          </div>
          <dl className="formula-rule-list">
            <div><dt>50+ milestone</dt><dd>{formatSignedXP(XP_V2_RULES.fiftyBonus)}</dd></div>
            <div><dt>100+ milestone</dt><dd>Another {formatSignedXP(XP_V2_RULES.hundredAdditionalBonus)}</dd></div>
            <div><dt>Dismissed for zero</dt><dd>{formatSignedXP(XP_V2_RULES.duckPenalty)}</dd></div>
            <div><dt>Career regular-run safeguard</dt><dd>{XP_V2_RULES.regularBattingCareerCap} XP</dd></div>
          </dl>
          <p>
            A century earns both milestone bonuses: +15 for passing 50 and another
            +25 for passing 100. The duck penalty applies only when you batted,
            scored zero and were dismissed. A not-out zero and Did Not Bat are not ducks.
          </p>
          <div className="formula-mini-examples">
            <div><strong>20 runs</strong><span>10 regular points</span></div>
            <div><strong>80 runs</strong><span>35 regular + 15 milestone = 50</span></div>
            <div><strong>100 runs</strong><span>40 regular + 40 milestones = 80</span></div>
          </div>
          <p className="formula-note">
            For Monthly Beast, regular run points keep growing beyond the career
            safeguard. Example: 160 runs gives 95 raw Batting Beast points, but 90
            career batting XP.
          </p>
        </FormulaCard>

        <FormulaCard
          eyebrow="Fielding XP v2"
          title="Every Clean Chance Counts"
          accent="green"
          icon={icons.fielding}
          iconArtworkScale={FORMULA_ICON_SCALE.fielding}
          iconSize="hero"
        >
          <dl className="formula-rule-list">
            <div><dt>Catch</dt><dd>{formatSignedXP(XP_V2_RULES.catch)}</dd></div>
            <div><dt>Run-out</dt><dd>{formatSignedXP(XP_V2_RULES.runOut)}</dd></div>
            <div><dt>Stumping</dt><dd>{formatSignedXP(XP_V2_RULES.stumping)}</dd></div>
            <div><dt>Career fielding safeguard</dt><dd>{XP_V2_RULES.fieldingCareerCap} XP</dd></div>
          </dl>
          <p>
            Career fielding XP is capped at 40 in one match. Raw Fielding Beast
            points are not capped, so every catch, run-out and stumping still counts
            in the monthly race.
          </p>
          <p>
            On the scorecard, a catch records +1 catch for the fielder and a
            stumping records +1 stumping for the keeper. Both also credit the bowler&apos;s wicket.
          </p>
          <div className="formula-score-example">
            <span>4 catches = 24 points</span>
            <span>2 run-outs = 16 points</span>
            <strong>40 career XP and 40 raw Fielding Beast points</strong>
          </div>
        </FormulaCard>

        <FormulaCard
          eyebrow="Career match XP"
          title="Your Final Match Award"
          accent="purple"
        >
          <div className="formula-equation formula-equation-stacked">
            <span>Played + Win + Official POM</span>
            <span>+ Career Batting + Bowling + Fielding XP</span>
          </div>
          <p>
            Category safeguards are applied first, then the complete career award
            is kept inside the match range.
          </p>
          <div className="formula-range-compact">
            <strong>{XP_V2_RULES.minimumMatchXP}</strong>
            <span>to</span>
            <strong>+{XP_V2_RULES.maximumMatchXP}</strong>
          </div>
          <p>
            Negative over quality and a dismissed duck can pull a tough match down,
            but no career match awards less than -15 XP. A monster performance can
            award no more than +160 career XP.
          </p>
        </FormulaCard>
      </div>

      <FormulaCard
        eyebrow="Bowling XP v2"
        title="Every Completed Over Has a Quality Score"
        accent="purple"
        icon={icons.bowling}
        iconArtworkScale={FORMULA_ICON_SCALE.bowling}
        iconSize="hero"
      >
        <div className="formula-grid two">
          <div>
            <dl className="formula-rule-list">
              <div><dt>Bowler-credited wicket</dt><dd>{formatSignedXP(XP_V2_RULES.wicket)}</dd></div>
              <div><dt>Hat-trick</dt><dd>Additional {formatSignedXP(XP_V2_RULES.hatTrick)}</dd></div>
              <div><dt>Run-out</dt><dd>No wicket XP for the bowler</dd></div>
              <div><dt>Positive over-quality career cap</dt><dd>+{XP_V2_RULES.positiveOverQualityCareerCap}</dd></div>
              <div><dt>Negative over-quality career floor</dt><dd>{XP_V2_RULES.negativeOverQualityCareerFloor}</dd></div>
            </dl>
            <p>
              Wickets and hat-tricks stack with over quality. Only a completed
              six-legal-ball over earns a quality score. An incomplete over earns none.
            </p>
            <p className="formula-note">
              A 0-run over is the maiden reward: +10 once. There is no separate
              maiden bonus in v2. Existing wide and no-ball scoring stays unchanged.
            </p>
          </div>
          <div className="formula-over-table" role="table" aria-label="Bowling over quality points">
            <div className="formula-over-table-heading" role="row">
              <strong role="columnheader">Runs in completed over</strong>
              <strong role="columnheader">Quality points</strong>
            </div>
            {XP_V2_OVER_QUALITY_RULES.map(({ label, points }) => (
              <div key={label} role="row">
                <span role="cell">{label}</span>
                <strong role="cell" className={points < 0 ? "negative" : ""}>
                  {points > 0 ? `+${points}` : points}
                </strong>
              </div>
            ))}
          </div>
        </div>
        <p>
          Career bowling XP uses wickets + hat-tricks + capped positive quality
          points + protected negative quality points. Raw Bowling Beast points use
          the same ingredients with no +30 or -20 over-quality limits.
        </p>
      </FormulaCard>

      <div className="formula-grid two">
        <FormulaCard
          id="monthly-beasts"
          eyebrow="Monthly Beast raw category points"
          title="The Monthly Race Has No Career Caps"
          accent="gold"
        >
          <dl className="formula-rule-list">
            <div><dt>Batting Beast</dt><dd>Raw batting points</dd></div>
            <div><dt>Bowling Beast</dt><dd>Raw bowling points</dd></div>
            <div><dt>Fielding Beast</dt><dd>Raw fielding points</dd></div>
          </dl>
          <p>
            Each category adds the player&apos;s raw performance points from eligible
            finalised matches in that calendar month. Career category safeguards
            and the overall +160 match cap do not reduce Beast points.
          </p>
          <p>
            Participation, win bonus and Player of the Match XP do not count toward
            Beast crowns. Total career XP does not count either. Equal category
            totals create joint winners.
          </p>
        </FormulaCard>

        <FormulaCard
          eyebrow="Career XP vs Beast Points"
          title="Two Scores, Two Jobs"
          accent="cyan"
        >
          <div className="formula-compare-grid">
            <div>
              <strong>Career XP</strong>
              <p>Builds your Level and uses category safeguards plus the -15 to +160 match range.</p>
            </div>
            <div>
              <strong>Beast Points</strong>
              <p>Ranks one monthly category and keeps that category&apos;s raw performance uncapped.</p>
            </div>
          </div>
          <p className="formula-note">
            Example: 7 catches are worth 42 raw Fielding Beast points. The same
            performance contributes 40 fielding XP to the career match calculation.
          </p>
        </FormulaCard>
      </div>

      <div className="formula-grid two">
        <XPReceipt
          id="solidAllRound"
          title="Solid All-Round v2 Match"
          rows={[
            ["Played", 20],
            ["Team won", 5],
            ["18 runs", 9],
            ["1 wicket", 10],
            ["1-3 run completed over", 6],
            ["1 catch", 6]
          ]}
          total={56}
          isOpen={openExamples.solidAllRound}
          onToggle={toggleExample}
        />
        <XPReceipt
          id="strongMatch"
          title="Strong v2 Match"
          rows={[
            ["Played", 20],
            ["Team won", 5],
            ["Official Player of the Match", 15],
            ["52 run points", 26],
            ["50+ milestone", 15],
            ["2 wickets", 20],
            ["0-run over", 10],
            ["4-6 run over", 3],
            ["1 catch", 6]
          ]}
          total={120}
          isOpen={openExamples.strongMatch}
          onToggle={toggleExample}
        />
      </div>

      <FormulaCard
        eyebrow="Historical transparency"
        title="Earlier Matches Keep Their Original Rules"
        accent="orange"
      >
        <p>
          Matches dated before {XP_V2_EFFECTIVE_DATE_LABEL} remain on the original XP
          rules. They are not recalculated. Matches dated {XP_V2_EFFECTIVE_DATE_LABEL} or
          later use XP v2, even if an older match is corrected or finalised later.
        </p>
      </FormulaCard>
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
            <dt>Best Batting Average</dt>
            <dd>
              Runs scored / Times dismissed. Minimum 5 batting innings and at
              least 1 dismissal.
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
