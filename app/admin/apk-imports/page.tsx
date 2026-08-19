import Link from "next/link";
import { ArrowRight, DownloadCloud } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin/auth";
import { formatInningsScore } from "@/lib/match-records";
import {
  formatCompletedOvers,
  getOrderedInnings,
  getTeamName
} from "@/lib/match-scorecard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseApkImportRepository } from "@/lib/supabase/apk-import-repository";
import type { ApkMatchImport } from "@/lib/app-sync/types";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Prague"
  }).format(new Date(value));
}

function statusLabel(importRecord: ApkMatchImport) {
  if (importRecord.isDemo) return "DEMO TEST MATCH";
  return importRecord.reviewStatus.replace("_", " ").toUpperCase();
}

function scoreLines(importRecord: ApkMatchImport) {
  if (!importRecord.derivedMatch) return [];

  return getOrderedInnings(importRecord.derivedMatch).map((innings) => ({
    teamName: getTeamName(importRecord.derivedMatch as NonNullable<ApkMatchImport["derivedMatch"]>, innings.battingTeamId),
    score: formatInningsScore(innings.runs, innings.wicketsLost),
    overs: formatCompletedOvers(innings.completedOvers)
  }));
}

function ImportCard({ importRecord }: { importRecord: ApkMatchImport }) {
  const lines = scoreLines(importRecord);
  const validationOk = importRecord.validationResult?.ok === true;

  return (
    <article className="rounded-[8px] border border-white/15 bg-black/55 p-4 shadow-[0_0_24px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-neon-cyan">APK Match</p>
          <h2 className="font-display text-2xl uppercase text-white">
            {importRecord.derivedMatch?.matchName ?? importRecord.offlineMatchId}
          </h2>
          <p className="mt-1 text-sm text-stone-300">
            {importRecord.matchDate ?? "No match date"} - imported {formatDateTime(importRecord.importedAt)}
          </p>
        </div>
        <span className="rounded-full border border-neon-yellow/40 bg-neon-yellow/15 px-3 py-1 text-xs font-black uppercase text-neon-yellow">
          {statusLabel(importRecord)}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-stone-200 sm:grid-cols-2">
        <div>
          <span className="text-stone-400">Sync</span>
          <b className="ml-2 text-white">v{importRecord.syncVersion}</b>
        </div>
        <div>
          <span className="text-stone-400">Started</span>
          <b className="ml-2 text-white">{formatDateTime(importRecord.startedAt)}</b>
        </div>
        <div>
          <span className="text-stone-400">Scheduled overs</span>
          <b className="ml-2 text-white">
            {importRecord.derivedMatch?.scheduledOversPerInnings ?? "-"}
          </b>
        </div>
        <div>
          <span className="text-stone-400">Validation</span>
          <b className={validationOk ? "ml-2 text-neon-lime" : "ml-2 text-red-300"}>
            {validationOk ? "OK" : "Needs review"}
          </b>
        </div>
      </div>

      {lines.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {lines.map((line) => (
            <div
              key={line.teamName}
              className="flex items-center justify-between rounded-[8px] border border-white/10 bg-pitch-950/70 px-3 py-2"
            >
              <span className="font-black uppercase">{line.teamName}</span>
              <span className="font-black text-neon-yellow">
                {line.score} ({line.overs})
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <LinkButton href={`/admin/apk-imports/${importRecord.id}`} variant="secondary">
          REVIEW
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </LinkButton>
        {importRecord.reviewStatus !== "finalised" ? (
          <form action={`/api/admin/apk-imports/${importRecord.id}/reject`} method="post">
            <Button type="submit" variant="ghost">REJECT</Button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

export default async function ApkImportsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const imports = await new SupabaseApkImportRepository(supabase).listForReview();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      <Card>
        <div className="flex items-center gap-3">
          <DownloadCloud className="h-8 w-8 text-neon-cyan" aria-hidden="true" />
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">APK Matches</p>
            <h1 className="font-display text-5xl uppercase comic-title">
              Pending Review
            </h1>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-stone-300">
          APK uploads stop here until an Admin reviews the derived innings, confirms
          Player of the Match and finalises through the normal website engine.
        </p>

        <div className="mt-6 grid gap-4">
          {imports.length > 0 ? (
            imports.map((importRecord) => (
              <ImportCard key={importRecord.id} importRecord={importRecord} />
            ))
          ) : (
            <div className="rounded-[8px] border border-dashed border-white/20 bg-black/35 p-6 text-stone-300">
              No APK imports are waiting for review.
            </div>
          )}
        </div>

        <Link href="/admin" className="mt-6 inline-block text-sm font-black uppercase text-neon-cyan">
          Back to Admin
        </Link>
      </Card>
    </div>
  );
}
