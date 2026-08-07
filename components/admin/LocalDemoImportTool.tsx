"use client";

import Link from "next/link";
import { useState } from "react";
import {
  buildLocalDemoImportPlan,
  IMPORT_DEMO_CONFIRMATION_PHRASE,
  type LocalDemoImportAudit,
  type LocalDemoImportPayload,
  type LocalDemoImportPlan,
  type LocalDemoImportPreview,
  type LocalDemoImportStatusMap
} from "@/lib/admin/local-demo-import";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ImportStageKey =
  | "players"
  | "matches"
  | "careerStats"
  | "matchStatApplications"
  | "monthlyBeastCrowns";

type ImportStageStatus =
  | "not_started"
  | "running"
  | "success"
  | "failed"
  | "skipped";

type ImportStage = {
  key: ImportStageKey;
  label: string;
  count: number;
  status: ImportStageStatus;
  error?: string;
};

const stageLabels: Record<ImportStageKey, string> = {
  players: "Players",
  matches: "Demo Matches",
  careerStats: "Career Stats",
  matchStatApplications: "Progression Ledger",
  monthlyBeastCrowns: "Monthly Beast Crowns"
};

function createStages(payload: LocalDemoImportPayload | null): ImportStage[] {
  return (Object.keys(stageLabels) as ImportStageKey[]).map((key) => ({
    key,
    label: stageLabels[key],
    count: payload?.[key].length ?? 0,
    status: "not_started"
  }));
}

function CountTable({
  preview,
  statuses
}: {
  preview: LocalDemoImportPreview;
  statuses: LocalDemoImportStatusMap;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[
        ["Players", preview.players, statuses.players],
        ["Demo Matches", preview.demoMatches, statuses.demoMatches],
        ["Career Stats", preview.careerRecords, statuses.careerRecords],
        [
          "Progression Ledger",
          preview.progressionRecords,
          statuses.progressionRecords
        ],
        [
          "Monthly Beast Crowns",
          preview.monthlyBeastCrowns,
          statuses.monthlyBeastCrowns
        ]
      ].map(([label, value, status]) => (
        <div key={label} className="rounded border border-white/15 bg-black/40 p-3">
          <dt className="font-ui text-[0.65rem] font-black uppercase text-stone-300">
            {label}
          </dt>
          <dd className="font-display text-3xl text-neon-yellow">{value}</dd>
          <dd
            className={
              status === "STALE CROWN EXCLUDED"
                ? "font-ui text-[0.62rem] font-black uppercase text-red-200"
                : "font-ui text-[0.62rem] font-black uppercase text-neon-cyan"
            }
          >
            {status}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AuditPanel({ audit }: { audit: LocalDemoImportAudit }) {
  const hasCareerFindings = audit.careerDifferences.length > 0;
  const hasStaleProgressions = audit.staleProgressionsIgnored > 0;
  const hasCrownMismatches = audit.monthlyCrownMismatches.length > 0;
  const hasExcludedCrowns = audit.staleCrownsExcluded > 0;

  return (
    <div className="rounded border border-neon-cyan/30 bg-black/35 p-4">
      <h2 className="font-display text-2xl uppercase text-neon-yellow">
        Clean Demo Rebuild Audit
      </h2>
      <div className="mt-3 grid gap-3 text-sm text-stone-200 md:grid-cols-2">
        <p>
          <span className="font-ui font-black uppercase text-neon-cyan">
            Exact local career rows:
          </span>{" "}
          {audit.exactCareerMatches}
        </p>
        <p>
          <span className="font-ui font-black uppercase text-neon-cyan">
            Different local totals:
          </span>{" "}
          {audit.differentCareerTotals}
        </p>
        <p>
          <span className="font-ui font-black uppercase text-neon-cyan">
            Missing canonical careers:
          </span>{" "}
          {audit.missingCanonicalCareerPlayerIds.length
            ? audit.missingCanonicalCareerPlayerIds.join(", ")
            : "None"}
        </p>
        <p>
          <span className="font-ui font-black uppercase text-neon-cyan">
            Obsolete local careers:
          </span>{" "}
          {audit.obsoleteCareerPlayerIds.length
            ? audit.obsoleteCareerPlayerIds.join(", ")
            : "None"}
        </p>
      </div>

      <div className="mt-4 rounded border border-white/15 bg-black/30 p-3">
        <p className="font-ui text-xs font-black uppercase text-stone-300">
          Monthly Beast crowns
        </p>
        <div className="mt-2 grid gap-2 text-sm text-stone-200 sm:grid-cols-3">
          <p>
            <span className="font-ui font-black uppercase text-neon-cyan">
              Local found:
            </span>{" "}
            {audit.localMonthlyBeastCrowns}
          </p>
          <p>
            <span className="font-ui font-black uppercase text-neon-cyan">
              Valid for import:
            </span>{" "}
            {audit.validMonthlyBeastCrownsForImport}
          </p>
          <p>
            <span className="font-ui font-black uppercase text-amber-200">
              Excluded:
            </span>{" "}
            {audit.staleCrownsExcluded}
          </p>
        </div>
      </div>

      {hasStaleProgressions ? (
        <div className="mt-4 rounded border border-amber-300/30 bg-amber-950/25 p-3">
          <p className="font-ui text-xs font-black uppercase text-amber-200">
            Ignored stale local progression: {audit.staleProgressionsIgnored} records
          </p>
          <p className="mt-1 text-sm text-stone-200">
            {audit.staleProgressionsWithExistingLocalMatches} reference a match ID
            still present somewhere in local match data.{" "}
            {audit.staleProgressionsAffectLocalTotals
              ? "Current local career totals appear to include stale contributions."
              : "No stale contribution is visible in rebuilt-vs-local career totals."}
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-auto pr-2 text-xs text-amber-100">
            {audit.staleProgressions.map((progression) => (
              <li key={progression.idempotencyKey}>
                {progression.idempotencyKey} - match {progression.matchId} - player{" "}
                {progression.playerId} -{" "}
                {progression.referencedMatchExists
                  ? "match exists locally"
                  : "match not found locally"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasCareerFindings ? (
        <div className="mt-4 rounded border border-white/15 bg-black/30 p-3">
          <p className="font-ui text-xs font-black uppercase text-stone-300">
            Rebuilt career differences
          </p>
          <ul className="mt-2 max-h-52 space-y-2 overflow-auto pr-2 text-xs text-stone-200">
            {audit.careerDifferences.map((difference) => (
              <li key={`${difference.kind}-${difference.playerId}`}>
                <span className="font-black uppercase text-neon-cyan">
                  {difference.playerName}
                </span>{" "}
                ({difference.kind.replaceAll("-", " ")}): local{" "}
                {difference.localSummary}; rebuilt {difference.rebuiltSummary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasCrownMismatches ? (
        <div className="mt-4 rounded border border-amber-300/30 bg-amber-950/25 p-3">
          <p className="font-ui text-xs font-black uppercase text-amber-200">
            Stale demo crown excluded
          </p>
          <p className="mt-1 text-sm text-stone-200">
            Stored crown does not match the Monthly Beast results derived from
            the six current demo matches.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-100">
            {audit.monthlyCrownMismatches.map((mismatch) => (
              <li key={mismatch}>{mismatch}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasExcludedCrowns && audit.staleCrownExclusionReasons.length > 0 ? (
        <div className="mt-4 rounded border border-amber-300/30 bg-black/30 p-3">
          <p className="font-ui text-xs font-black uppercase text-amber-200">
            Crown exclusion reasons
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
            {audit.staleCrownExclusionReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StageList({ stages }: { stages: ImportStage[] }) {
  return (
    <div className="space-y-2">
      {stages.map((stage) => (
        <div
          key={stage.key}
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/15 bg-black/35 px-3 py-2"
        >
          <div>
            <p className="font-ui text-sm font-black uppercase text-stone-100">
              {stage.label}
            </p>
            <p className="text-xs uppercase text-stone-400">{stage.count} records</p>
          </div>
          <p className="font-ui text-xs font-black uppercase text-neon-cyan">
            {stage.status.replace("_", " ")}
          </p>
          {stage.error ? (
            <p className="basis-full text-sm text-red-300">{stage.error}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function stageErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Supabase import failed for this stage.";
}

export function LocalDemoImportTool() {
  const [plan, setPlan] = useState<LocalDemoImportPlan | null>(null);
  const [stages, setStages] = useState<ImportStage[]>(createStages(null));
  const [confirmation, setConfirmation] = useState("");
  const [staleCrownAcknowledged, setStaleCrownAcknowledged] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  function validateLocalData() {
    const nextPlan = buildLocalDemoImportPlan(window.localStorage);

    setPlan(nextPlan);
    setStages(createStages(nextPlan.payload));
    setConfirmation("");
    setStaleCrownAcknowledged(false);
    setIsComplete(false);
    setImportError(null);
  }

  function updateStage(
    key: ImportStageKey,
    status: ImportStageStatus,
    error?: string
  ) {
    setStages((currentStages) =>
      currentStages.map((stage) =>
        stage.key === key ? { ...stage, status, error } : stage
      )
    );
  }

  async function runStage<T extends object>(
    key: ImportStageKey,
    rows: T[],
    onConflict: string
  ) {
    if (rows.length === 0) {
      updateStage(key, "skipped");
      return;
    }

    updateStage(key, "running");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from(tableForStage(key)).upsert(rows, {
      onConflict
    });

    if (error) {
      updateStage(key, "failed", error.message);
      throw error;
    }

    updateStage(key, "success");
  }

  async function importToSupabase() {
    const hasExcludedCrowns = (plan?.audit.staleCrownsExcluded ?? 0) > 0;

    if (
      !plan?.payload ||
      confirmation !== IMPORT_DEMO_CONFIRMATION_PHRASE ||
      (hasExcludedCrowns && !staleCrownAcknowledged)
    ) {
      return;
    }

    setIsImporting(true);
    setIsComplete(false);
    setImportError(null);
    setStages(createStages(plan.payload));

    try {
      await runStage("players", plan.payload.players, "id");
      await runStage("matches", plan.payload.matches, "id");
      await runStage("careerStats", plan.payload.careerStats, "player_id");
      await runStage(
        "matchStatApplications",
        plan.payload.matchStatApplications,
        "idempotency_key"
      );
      await runStage("monthlyBeastCrowns", plan.payload.monthlyBeastCrowns, "id");
      setIsComplete(true);
    } catch (error) {
      setImportError(stageErrorMessage(error));
    } finally {
      setIsImporting(false);
    }
  }

  const canImport =
    Boolean(plan?.payload) &&
    confirmation === IMPORT_DEMO_CONFIRMATION_PHRASE &&
    ((plan?.audit.staleCrownsExcluded ?? 0) === 0 || staleCrownAcknowledged) &&
    !isImporting &&
    !isComplete;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-black uppercase text-neon-cyan">
          Temporary Phase 2B Tool
        </p>
        <h1 className="font-display text-4xl uppercase comic-title">
          Local Data Import
        </h1>
        <p className="max-w-3xl text-sm text-stone-300">
          This admin-only tool copies the current browser&apos;s local demo data
          into Supabase. It does not delete localStorage, touch Gallery
          IndexedDB blobs, or switch the website away from local persistence.
        </p>
      </div>

      <button
        type="button"
        className="neon-button import-action-button"
        onClick={validateLocalData}
        disabled={isImporting}
      >
        VALIDATE DATA
      </button>

      {plan ? (
        <div className="space-y-4">
          <CountTable preview={plan.preview} statuses={plan.statuses} />
          <AuditPanel audit={plan.audit} />

          {plan.errors.length > 0 ? (
            <div className="rounded border border-red-400/40 bg-red-950/30 p-4">
              <h2 className="font-display text-2xl uppercase text-red-200">
                Import Blocked
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-100">
                {plan.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded border border-neon-cyan/35 bg-black/40 p-4">
              <h2 className="font-display text-2xl uppercase text-neon-yellow">
                Ready To Import
              </h2>
              <p className="mt-1 text-sm text-stone-300">
                Type {IMPORT_DEMO_CONFIRMATION_PHRASE} to enable the Supabase
                import.
              </p>
              {plan.warnings.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-200">
                  {plan.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              {plan.audit.staleCrownsExcluded > 0 ? (
                <label className="mt-4 flex max-w-2xl items-start gap-3 rounded border border-amber-300/30 bg-amber-950/20 p-3 text-sm text-amber-100">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-neon-yellow"
                    checked={staleCrownAcknowledged}
                    onChange={(event) =>
                      setStaleCrownAcknowledged(event.target.checked)
                    }
                    disabled={isImporting || isComplete}
                  />
                  <span>
                    I understand that {plan.audit.staleCrownsExcluded} stale Monthly
                    Beast crown
                    {plan.audit.staleCrownsExcluded === 1 ? "" : "s"} will NOT be
                    imported.
                  </span>
                </label>
              ) : null}
              <label className="mt-4 block max-w-sm">
                <span className="font-ui text-xs font-black uppercase text-stone-300">
                  Confirmation phrase
                </span>
                <input
                  className="mt-2 w-full rounded border border-white/20 bg-black/70 px-3 py-2 font-ui text-sm uppercase text-stone-100 outline-none focus:border-neon-cyan"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  disabled={isImporting || isComplete}
                  aria-label="Import confirmation phrase"
                />
              </label>
              <button
                type="button"
                className="neon-button import-action-button mt-4"
                onClick={importToSupabase}
                disabled={!canImport}
              >
                IMPORT TO SUPABASE
              </button>
            </div>
          )}
        </div>
      ) : null}

      <StageList stages={stages} />

      {importError ? (
        <p className="rounded border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">
          {importError}
        </p>
      ) : null}

      {isComplete && plan?.payload ? (
        <div className="rounded border border-neon-green/40 bg-green-950/25 p-4">
          <h2 className="font-display text-3xl uppercase text-neon-yellow">
            Import Complete
          </h2>
          <CountTable preview={plan.preview} statuses={plan.statuses} />
          <p className="mt-4 font-ui text-sm font-black uppercase text-neon-cyan">
            Local data was not deleted
          </p>
          <div className="mt-4 grid gap-2 text-sm text-stone-200 sm:grid-cols-2">
            <p>Players imported: {plan.payload.players.length}</p>
            <p>Demo matches imported: {plan.payload.matches.length}</p>
            <p>Career records imported: {plan.payload.careerStats.length}</p>
            <p>
              Progression records imported:{" "}
              {plan.payload.matchStatApplications.length}
            </p>
            <p>
              Monthly Beast crowns imported:{" "}
              {plan.payload.monthlyBeastCrowns.length}
            </p>
            <p>
              Stale progression records ignored:{" "}
              {plan.audit.staleProgressionsIgnored}
            </p>
            <p>Stale crowns excluded: {plan.audit.staleCrownsExcluded}</p>
          </div>
          <Link href="/admin" className="neon-button import-action-button mt-4 inline-flex">
            RETURN TO CONTROL ROOM
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function tableForStage(stage: ImportStageKey) {
  if (stage === "careerStats") return "player_career_stats";
  if (stage === "matchStatApplications") return "match_stat_applications";
  if (stage === "monthlyBeastCrowns") return "monthly_beast_crowns";

  return stage;
}
