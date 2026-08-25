import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Edit3, Lock } from "lucide-react";
import { ApkOfficialFinaliseConfirmation } from "@/components/admin/ApkOfficialFinaliseConfirmation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin/auth";
import { getPlayerById } from "@/lib/data/players";
import { getMatchResultHeadline } from "@/lib/match-display";
import {
  buildScorecardInnings,
  getOrderedInnings,
  type ScorecardInnings
} from "@/lib/match-scorecard";
import {
  getApkReviewDerivedMatch,
  getApkReviewPayload,
  getApkReviewValidationResult,
  groupApkReviewEventsByOver,
  isApkReviewWorkingCopyStale
} from "@/lib/app-sync/review-working-copy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseApkImportRepository } from "@/lib/supabase/apk-import-repository";
import type { ApkMatchImport, AppSyncMatchPayload } from "@/lib/app-sync/types";
import type { QuickScoringEvent } from "@/lib/types/match";

export const dynamic = "force-dynamic";

function getValidationErrors(importRecord: ApkMatchImport): string[] {
  const errors = getApkReviewValidationResult(importRecord)?.errors;

  return Array.isArray(errors)
    ? errors.filter((error): error is string => typeof error === "string")
    : [];
}

function getRecommendation(importRecord: ApkMatchImport): string | null {
  const recommendation = getApkReviewValidationResult(importRecord)?.pomRecommendation;

  if (!recommendation || typeof recommendation !== "object") return null;

  const playerId = (recommendation as Record<string, unknown>).recommendedPlayerId;

  return typeof playerId === "string" ? playerId : null;
}

function getApkPomRecommendation(
  importRecord: ApkMatchImport,
  payload: AppSyncMatchPayload
): {
  status: "valid" | "ignored" | "none" | "unverified";
  playerId: string | null;
  suppliedPlayerId: string | null;
  message: string | null;
} {
  const recommendation =
    getApkReviewValidationResult(importRecord)?.apkPomRecommendation;

  if (recommendation && typeof recommendation === "object") {
    const record = recommendation as Record<string, unknown>;
    const status = record.status;

    if (status === "valid" || status === "ignored" || status === "none") {
      return {
        status,
        playerId: typeof record.playerId === "string" ? record.playerId : null,
        suppliedPlayerId:
          typeof record.suppliedPlayerId === "string"
            ? record.suppliedPlayerId
            : null,
        message: typeof record.message === "string" ? record.message : null
      };
    }
  }

  const suppliedPlayerId = payload.pomRecommendationPlayerId?.trim() || null;

  return suppliedPlayerId
    ? {
        status: "unverified",
        playerId: null,
        suppliedPlayerId,
        message: "APK recommendation was supplied before website validation metadata was refreshed."
      }
    : {
        status: "none",
        playerId: null,
        suppliedPlayerId: null,
        message: null
      };
}

function playerOptions(playerIds: string[], selected?: string | null) {
  return (
    <>
      <option value="">-</option>
      {playerIds.map((playerId) => (
        <option key={playerId} value={playerId}>
          {getPlayerById(playerId)?.name ?? playerId}
        </option>
      ))}
      {selected && !playerIds.includes(selected) ? (
        <option value={selected}>{getPlayerById(selected)?.name ?? selected}</option>
      ) : null}
    </>
  );
}

function EventEditor({
  importId,
  payload,
  inningsKey,
  event,
  overNumber,
  legalBallInOver,
  canEdit,
  expectedReviewVersion
}: {
  importId: string;
  payload: AppSyncMatchPayload;
  inningsKey: "inningsAEvents" | "inningsBEvents";
  event: QuickScoringEvent;
  overNumber: number;
  legalBallInOver: number | null;
  canEdit: boolean;
  expectedReviewVersion: number;
}) {
  const battingPlayerIds =
    event.battingTeamId === "teamA"
      ? payload.teamAPlayerIds
      : payload.teamBPlayerIds;
  const bowlingPlayerIds =
    event.bowlingTeamId === "teamA"
      ? payload.teamAPlayerIds
      : payload.teamBPlayerIds;
  const fieldingPlayerIds = Array.from(
    new Set([...bowlingPlayerIds, ...(payload.fieldingHelperIds ?? [])])
  );
  const eventType = event.wicket
    ? "wicket"
    : event.extraType === "wide"
      ? "wide"
      : event.extraType === "no_ball"
        ? "no_ball"
        : "runs";

  return (
    <form
      action={`/api/admin/apk-imports/${importId}/working-copy`}
      method="post"
      className="grid gap-3 rounded-[8px] border border-white/10 bg-black/45 p-3 lg:grid-cols-[0.8fr_1fr_1fr_1fr_1fr_1fr_auto]"
    >
      <input type="hidden" name="inningsKey" value={inningsKey} />
      <input type="hidden" name="eventId" value={event.id} />
      <input type="hidden" name="expectedReviewVersion" value={expectedReviewVersion} />
      <div>
        <p className="text-[0.65rem] font-black uppercase text-stone-500">Ball</p>
        <b className="text-white">
          {overNumber}.{legalBallInOver ?? "x"}
        </b>
      </div>
      <label className="grid gap-1 text-[0.65rem] font-black uppercase text-stone-400">
        Type
        <select
          name="eventType"
          defaultValue={eventType}
          disabled={!canEdit}
          className="rounded-[8px] border border-white/15 bg-black/60 px-2 py-2 text-sm text-white"
        >
          <option value="runs">Runs</option>
          <option value="wide">Wide</option>
          <option value="no_ball">No Ball</option>
          <option value="wicket">Wicket</option>
        </select>
      </label>
      <label className="grid gap-1 text-[0.65rem] font-black uppercase text-stone-400">
        Batter Runs
        <select
          name="batterRuns"
          defaultValue={event.batterRuns}
          disabled={!canEdit}
          className="rounded-[8px] border border-white/15 bg-black/60 px-2 py-2 text-sm text-white"
        >
          {[0, 1, 2, 3, 4, 6].map((run) => (
            <option key={run} value={run}>{run}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[0.65rem] font-black uppercase text-stone-400">
        NB Runs
        <select
          name="noBallRuns"
          defaultValue={event.extraType === "no_ball" ? event.batterRuns : 0}
          disabled={!canEdit}
          className="rounded-[8px] border border-white/15 bg-black/60 px-2 py-2 text-sm text-white"
        >
          {[0, 1, 2, 3, 4, 6].map((run) => (
            <option key={run} value={run}>{run}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[0.65rem] font-black uppercase text-stone-400">
        Bowler
        <select
          name="bowlerId"
          defaultValue={event.bowlerId}
          disabled={!canEdit}
          className="rounded-[8px] border border-white/15 bg-black/60 px-2 py-2 text-sm text-white"
        >
          {playerOptions(bowlingPlayerIds, event.bowlerId)}
        </select>
      </label>
      <details className="rounded-[8px] border border-white/10 bg-pitch-950/60 p-2 text-xs text-stone-300">
        <summary className="cursor-pointer font-black uppercase text-neon-cyan">
          Wicket Details
        </summary>
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1">
            Dismissal
            <select
              name="wicketType"
              defaultValue={event.wicket?.type ?? "bowled"}
              disabled={!canEdit}
              className="rounded-[8px] border border-white/15 bg-black/60 px-2 py-2 text-white"
            >
              <option value="bowled">Bowled</option>
              <option value="caught">Caught</option>
              <option value="run_out">Run Out</option>
              <option value="stumped">Stumped</option>
              <option value="other_bowler_wicket">Other Bowler Wicket</option>
            </select>
          </label>
          <label className="grid gap-1">
            Dismissed Batter
            <select
              name="dismissedPlayerId"
              defaultValue={event.wicket?.dismissedPlayerId ?? event.strikerId}
              disabled={!canEdit}
              className="rounded-[8px] border border-white/15 bg-black/60 px-2 py-2 text-white"
            >
              {playerOptions(battingPlayerIds, event.wicket?.dismissedPlayerId)}
            </select>
          </label>
          <label className="grid gap-1">
            Fielder / Stumper
            <select
              name="fielderId"
              defaultValue={event.wicket?.fielderId ?? ""}
              disabled={!canEdit}
              className="rounded-[8px] border border-white/15 bg-black/60 px-2 py-2 text-white"
            >
              {playerOptions(fieldingPlayerIds, event.wicket?.fielderId)}
            </select>
          </label>
          <label className="grid gap-1">
            New Batter
            <select
              name="newBatterId"
              defaultValue={event.wicket?.newBatterId ?? ""}
              disabled={!canEdit}
              className="rounded-[8px] border border-white/15 bg-black/60 px-2 py-2 text-white"
            >
              {playerOptions(battingPlayerIds, event.wicket?.newBatterId)}
            </select>
          </label>
        </div>
      </details>
      <div className="flex flex-wrap items-end gap-2">
        <Button type="submit" name="action" value="update_event" disabled={!canEdit}>SAVE</Button>
        <Button
          type="submit"
          name="action"
          value="insert_after"
          variant="secondary"
          disabled={!canEdit}
        >
          INSERT
        </Button>
        <Button
          type="submit"
          name="action"
          value="delete_event"
          variant="ghost"
          disabled={!canEdit}
        >
          DELETE
        </Button>
      </div>
    </form>
  );
}

function EditMatchData({
  importRecord,
  payload,
  canEdit,
  stale
}: {
  importRecord: ApkMatchImport;
  payload: AppSyncMatchPayload;
  canEdit: boolean;
  stale: boolean;
}) {
  const expectedReviewVersion = importRecord.reviewVersion ?? 0;
  const innings = [
    { key: "inningsAEvents" as const, title: "Team A Batting", events: payload.inningsAEvents },
    { key: "inningsBEvents" as const, title: "Team B Batting", events: payload.inningsBEvents }
  ];

  return (
    <section className="mt-6 rounded-[8px] border border-neon-cyan/30 bg-pitch-950/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Edit3 className="h-5 w-5 text-neon-cyan" aria-hidden="true" />
          <h2 className="font-display text-2xl uppercase text-white">Edit Match Data</h2>
        </div>
        <form action={`/api/admin/apk-imports/${importRecord.id}/working-copy`} method="post">
          <input type="hidden" name="action" value="reset_to_raw" />
          <input type="hidden" name="expectedReviewVersion" value={expectedReviewVersion} />
          <Button type="submit" variant="secondary" disabled={importRecord.reviewStatus !== "pending_review"}>
            RESET TO RAW APK DATA
          </Button>
        </form>
      </div>
      <p className="mt-2 text-sm text-stone-300">
        Raw APK data is preserved below. These controls edit the Admin working copy
        that is re-derived and revalidated before finalisation.
      </p>
      {stale ? (
        <div className="mt-4 rounded-[8px] border border-neon-yellow/40 bg-neon-yellow/10 p-3 text-sm font-bold text-neon-yellow">
          A newer APK sync version arrived after this working copy was edited. Reset
          to raw APK data before making more corrections.
        </div>
      ) : null}
      {!canEdit ? (
        <div className="mt-4 flex items-center gap-2 rounded-[8px] border border-white/15 bg-black/45 p-3 text-sm font-bold text-stone-300">
          <Lock className="h-4 w-4" aria-hidden="true" />
          Match data editing is available only for pending review imports.
        </div>
      ) : null}

      <div className="mt-5 grid gap-5">
        {innings.map((inningsBlock) => {
          const rows = groupApkReviewEventsByOver(inningsBlock.key, inningsBlock.events);
          const overNumbers = Array.from(new Set(rows.map((row) => row.overNumber)));
          const bowlingPlayerIds =
            inningsBlock.key === "inningsAEvents"
              ? payload.teamBPlayerIds
              : payload.teamAPlayerIds;

          return (
            <div key={inningsBlock.key} className="rounded-[8px] border border-white/10 bg-black/35 p-3">
              <h3 className="font-display text-xl uppercase text-white">{inningsBlock.title}</h3>
              <div className="mt-3 grid gap-3">
                {overNumbers.map((overNumber) => {
                  const firstEvent = rows.find((row) => row.overNumber === overNumber)?.event;

                  return (
                    <form
                      key={overNumber}
                      action={`/api/admin/apk-imports/${importRecord.id}/working-copy`}
                      method="post"
                      className="flex flex-wrap items-end gap-2 rounded-[8px] border border-white/10 bg-pitch-950/50 p-3"
                    >
                      <input type="hidden" name="action" value="update_over_bowler" />
                      <input type="hidden" name="inningsKey" value={inningsBlock.key} />
                      <input type="hidden" name="overNumber" value={overNumber} />
                      <input type="hidden" name="expectedReviewVersion" value={expectedReviewVersion} />
                      <label className="grid gap-1 text-[0.65rem] font-black uppercase text-stone-400">
                        Over {overNumber} Bowler
                        <select
                          name="bowlerId"
                          defaultValue={firstEvent?.bowlerId ?? ""}
                          disabled={!canEdit}
                          className="rounded-[8px] border border-white/15 bg-black/60 px-2 py-2 text-sm text-white"
                        >
                          {playerOptions(bowlingPlayerIds, firstEvent?.bowlerId)}
                        </select>
                      </label>
                      <Button type="submit" variant="secondary" disabled={!canEdit}>
                        UPDATE OVER BOWLER
                      </Button>
                    </form>
                  );
                })}
                {rows.map((row) => (
                  <EventEditor
                    key={row.event.id}
                    importId={importRecord.id}
                    payload={payload}
                    inningsKey={inningsBlock.key}
                    event={row.event}
                    overNumber={row.overNumber}
                    legalBallInOver={row.legalBallInOver}
                    canEdit={canEdit}
                    expectedReviewVersion={expectedReviewVersion}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <details className="mt-5 rounded-[8px] border border-white/10 bg-black/45 p-3">
        <summary className="cursor-pointer font-black uppercase text-neon-yellow">
          Raw APK Data
        </summary>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-stone-300">
          {JSON.stringify(importRecord.rawPayload, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function ScorecardPreview({ innings }: { innings: ScorecardInnings }) {
  return (
    <section className="rounded-[8px] border border-white/15 bg-pitch-950/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-neon-cyan">
            {innings.teamName} Innings
          </p>
          <h3 className="font-display text-3xl uppercase text-white">{innings.score}</h3>
        </div>
        <span className="font-black text-neon-yellow">{innings.overs}</span>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left uppercase text-stone-400">
            <tr>
              <th className="py-2">Batter</th>
              <th className="py-2">Dismissal</th>
              <th className="py-2 text-right">R</th>
              <th className="py-2 text-right">B</th>
              <th className="py-2 text-right">4s</th>
              <th className="py-2 text-right">6s</th>
            </tr>
          </thead>
          <tbody>
            {innings.battingRows.map((row) => (
              <tr key={row.key} className="border-t border-white/10">
                <td className="py-2 font-bold text-white">{row.batter}</td>
                <td className="py-2 text-stone-300">{row.dismissal}</td>
                <td className="py-2 text-right font-black">{row.runs}</td>
                <td className="py-2 text-right">{row.balls}</td>
                <td className="py-2 text-right">{row.fours}</td>
                <td className="py-2 text-right">{row.sixes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {innings.bowlingFigures.map((figure) => (
          <div
            key={figure.playerId}
            className="rounded-[8px] border border-white/10 bg-black/40 px-3 py-2 text-sm"
          >
            <b className="text-white">{figure.bowler}</b>
            <span className="ml-2 text-stone-300">
              {figure.overs} - {figure.runsConceded}/{figure.wickets}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function ApkImportReviewPage({
  params,
  searchParams
}: {
  params: Promise<{ importId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireAdmin();
  const { importId } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const importRecord = await new SupabaseApkImportRepository(supabase).getById(importId);

  if (!importRecord) notFound();

  const match = getApkReviewDerivedMatch(importRecord);
  const payload = getApkReviewPayload(importRecord);
  const validationErrors = getValidationErrors(importRecord);
  const recommendedPomId = getRecommendation(importRecord);
  const apkPomRecommendation = getApkPomRecommendation(importRecord, payload);
  const reviewIsStale = isApkReviewWorkingCopyStale(importRecord);
  const canEditReviewData =
    importRecord.reviewStatus === "pending_review" && !reviewIsStale;
  const canFinalize =
    importRecord.reviewStatus === "pending_review" &&
    !reviewIsStale &&
    !importRecord.isDemo &&
    validationErrors.length === 0;
  const isReadOnly =
    importRecord.reviewStatus === "rejected" ||
    importRecord.reviewStatus === "finalised" ||
    importRecord.reviewStatus === "correction_pending";
  const resolvePlayerName = (playerId: string) => getPlayerById(playerId)?.name ?? playerId;
  const scorecardInnings = match
    ? getOrderedInnings(match).map((innings) =>
        buildScorecardInnings(match, innings, resolvePlayerName)
      )
    : [];
  const players = match?.finalisedPlayerRecords ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">APK Match Review</p>
            <h1 className="font-display text-5xl uppercase comic-title">
              {match?.matchName ?? importRecord.offlineMatchId}
            </h1>
            <p className="mt-2 text-sm text-stone-300">
              Offline ID {importRecord.offlineMatchId} - sync v{importRecord.syncVersion}
            </p>
          </div>
          <span className="rounded-full border border-neon-yellow/40 bg-neon-yellow/15 px-3 py-1 text-xs font-black uppercase text-neon-yellow">
            {importRecord.isDemo ? "DEMO TEST MATCH" : importRecord.reviewStatus.replace("_", " ").toUpperCase()}
          </span>
        </div>

        {isReadOnly ? (
          <div className="mt-5 rounded-[8px] border border-white/15 bg-black/45 p-4 text-sm font-bold uppercase text-stone-200">
            {importRecord.reviewStatus === "rejected"
              ? "REJECTED - audit record preserved. No review actions are available."
              : importRecord.reviewStatus === "correction_pending"
                ? "CORRECTION PENDING - a newer APK revision exists for an already-finalised import. This path is read-only for now."
                : "FINALISED - this import has already become an official match."}
          </div>
        ) : null}

        {query.error ? (
          <div className="mt-5 rounded-[8px] border border-red-400/40 bg-red-950/40 p-4 text-sm font-bold text-red-100">
            {decodeURIComponent(query.error)}
          </div>
        ) : null}
        {query.ok ? (
          <div className="mt-5 rounded-[8px] border border-neon-lime/40 bg-green-950/40 p-4 text-sm font-bold text-neon-lime">
            {decodeURIComponent(query.ok)}
          </div>
        ) : null}

        <section className="mt-6 rounded-[8px] border border-white/15 bg-black/45 p-4">
          <div className="flex items-center gap-2">
            {validationErrors.length === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-neon-lime" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-neon-yellow" aria-hidden="true" />
            )}
            <h2 className="font-display text-2xl uppercase text-white">Validation</h2>
          </div>
          {validationErrors.length === 0 ? (
            <p className="mt-2 text-sm text-stone-300">Website-side derivation passed.</p>
          ) : (
            <ul className="mt-2 list-disc pl-5 text-sm text-red-100">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-[8px] border border-neon-yellow/25 bg-neon-yellow/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-neon-yellow">
            APK POM Recommendation
          </p>
          <div className="mt-2 text-2xl font-black uppercase text-white">
            {apkPomRecommendation.status === "valid" && apkPomRecommendation.playerId
              ? resolvePlayerName(apkPomRecommendation.playerId)
              : apkPomRecommendation.status === "ignored" &&
                  apkPomRecommendation.suppliedPlayerId
                ? `${resolvePlayerName(apkPomRecommendation.suppliedPlayerId)} ignored`
                : apkPomRecommendation.status === "unverified" &&
                    apkPomRecommendation.suppliedPlayerId
                  ? `${resolvePlayerName(apkPomRecommendation.suppliedPlayerId)} supplied`
                  : "No unique recommendation"}
          </div>
          <p className="mt-1 text-sm text-stone-300">
            {apkPomRecommendation.message ??
              "Informational only. Website Admin still chooses the official Player of the Match."}
          </p>
        </section>

        {match ? (
          <>
            <section className="mt-6 grid gap-4 rounded-[8px] border border-white/15 bg-black/45 p-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-black uppercase text-stone-400">Match Date</p>
                <b className="text-white">{match.matchDate}</b>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-stone-400">Overs</p>
                <b className="text-white">{match.scheduledOversPerInnings}</b>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-stone-400">Batting Mode</p>
                <b className="text-white">{match.battingMode?.replace("_", " ")}</b>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-stone-400">Shared Player</p>
                <b className="text-white">
                  {match.sharedPlayerId ? resolvePlayerName(match.sharedPlayerId) : "None"}
                </b>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-stone-400">Fielding Helpers</p>
                <b className="text-white">
                  {(match.fieldingHelperIds ?? []).map(resolvePlayerName).join(", ") || "None"}
                </b>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-stone-400">Result Preview</p>
                <b className="text-neon-yellow">{getMatchResultHeadline(match)}</b>
              </div>
            </section>

            {importRecord.reviewStatus === "pending_review" ? (
              <EditMatchData
                importRecord={importRecord}
                payload={payload}
                canEdit={canEditReviewData}
                stale={reviewIsStale}
              />
            ) : (
              <details className="mt-6 rounded-[8px] border border-white/10 bg-black/45 p-3">
                <summary className="cursor-pointer font-black uppercase text-neon-yellow">
                  Raw APK Data
                </summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-stone-300">
                  {JSON.stringify(importRecord.rawPayload, null, 2)}
                </pre>
              </details>
            )}

            <div className="mt-6 grid gap-4">
              {scorecardInnings.map((innings) => (
                <ScorecardPreview key={innings.innings.battingTeamId} innings={innings} />
              ))}
            </div>

            <section className="mt-6 rounded-[8px] border border-white/15 bg-black/45 p-4">
              <h2 className="font-display text-2xl uppercase text-white">XP Preview</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {players.map((record) => (
                  <div key={record.playerId} className="rounded-[8px] bg-pitch-950/70 px-3 py-2">
                    <b className="text-white">{resolvePlayerName(record.playerId)}</b>
                    <span className="ml-2 font-black text-neon-yellow">
                      {record.xpBreakdown.awardedXP} XP
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {importRecord.reviewStatus === "pending_review" ? (
              <ApkOfficialFinaliseConfirmation
                action={`/api/admin/apk-imports/${importRecord.id}/finalize`}
                expectedReviewVersion={importRecord.reviewVersion ?? 0}
                matchDate={match.matchDate}
                recommendedPomId={recommendedPomId}
                recommendedPomLabel={
                  recommendedPomId ? resolvePlayerName(recommendedPomId) : "No unique winner"
                }
                pomOptions={players.map((record) => ({
                  playerId: record.playerId,
                  playerName: resolvePlayerName(record.playerId)
                }))}
                canFinalize={canFinalize}
                isDemo={importRecord.isDemo}
              />
            ) : null}
          </>
        ) : (
          <p className="mt-6 rounded-[8px] border border-red-400/30 bg-red-950/35 p-4 text-red-100">
            This import could not be converted into a website match preview.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {importRecord.reviewStatus === "pending_review" ? (
            <form action={`/api/admin/apk-imports/${importRecord.id}/reject`} method="post">
              <Button type="submit" variant="ghost">REJECT IMPORT</Button>
            </form>
          ) : null}
          <Link href="/admin/apk-imports" className="inline-flex items-center text-sm font-black uppercase text-neon-cyan">
            Back to APK imports
          </Link>
        </div>
      </Card>
    </div>
  );
}
