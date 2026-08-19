import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseApkImportRepository } from "@/lib/supabase/apk-import-repository";
import type { ApkMatchImport } from "@/lib/app-sync/types";

export const dynamic = "force-dynamic";

function getValidationErrors(importRecord: ApkMatchImport): string[] {
  const errors = importRecord.validationResult?.errors;

  return Array.isArray(errors)
    ? errors.filter((error): error is string => typeof error === "string")
    : [];
}

function getRecommendation(importRecord: ApkMatchImport): string | null {
  const recommendation = importRecord.validationResult?.pomRecommendation;

  if (!recommendation || typeof recommendation !== "object") return null;

  const playerId = (recommendation as Record<string, unknown>).recommendedPlayerId;

  return typeof playerId === "string" ? playerId : null;
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

  const match = importRecord.derivedMatch;
  const validationErrors = getValidationErrors(importRecord);
  const recommendedPomId = getRecommendation(importRecord);
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
            <p className="text-xs font-black uppercase text-neon-cyan">APK Pending Review</p>
            <h1 className="font-display text-5xl uppercase comic-title">
              {match?.matchName ?? importRecord.offlineMatchId}
            </h1>
            <p className="mt-2 text-sm text-stone-300">
              Offline ID {importRecord.offlineMatchId} - sync v{importRecord.syncVersion}
            </p>
          </div>
          <span className="rounded-full border border-neon-yellow/40 bg-neon-yellow/15 px-3 py-1 text-xs font-black uppercase text-neon-yellow">
            {importRecord.isDemo ? "DEMO TEST MATCH" : importRecord.reviewStatus.replace("_", " ")}
          </span>
        </div>

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

            <form
              action={`/api/admin/apk-imports/${importRecord.id}/finalize`}
              method="post"
              className="mt-6 rounded-[8px] border border-neon-cyan/30 bg-pitch-950/80 p-4"
            >
              <h2 className="font-display text-2xl uppercase text-white">Finalise From Pending</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-black uppercase text-stone-300">
                  Match Date
                  <input
                    name="matchDate"
                    type="date"
                    defaultValue={match.matchDate}
                    className="rounded-[8px] border border-white/15 bg-black/50 px-3 py-2 text-white"
                  />
                </label>
                <label className="grid gap-2 text-sm font-black uppercase text-stone-300">
                  Player of the Match
                  <select
                    name="playerOfMatchId"
                    defaultValue={recommendedPomId ?? ""}
                    className="rounded-[8px] border border-white/15 bg-black/50 px-3 py-2 text-white"
                  >
                    <option value="">No award / tie</option>
                    {players.map((record) => (
                      <option key={record.playerId} value={record.playerId}>
                        {resolvePlayerName(record.playerId)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-3 text-sm text-stone-300">
                Recommendation: {recommendedPomId ? resolvePlayerName(recommendedPomId) : "No unique winner"}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={
                    importRecord.isDemo ||
                    validationErrors.length > 0 ||
                    importRecord.reviewStatus === "finalised"
                  }
                >
                  FINALIZE MATCH
                </Button>
                {importRecord.isDemo ? (
                  <span className="rounded-[8px] border border-neon-yellow/30 bg-neon-yellow/10 px-3 py-2 text-sm font-black uppercase text-neon-yellow">
                    Demo imports cannot create official matches
                  </span>
                ) : null}
              </div>
            </form>
          </>
        ) : (
          <p className="mt-6 rounded-[8px] border border-red-400/30 bg-red-950/35 p-4 text-red-100">
            This import could not be converted into a website match preview.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {importRecord.reviewStatus !== "finalised" ? (
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
