import { DatabaseZap, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin/auth";
import {
  verifySupabaseDataSnapshot,
  type SupabaseDataCheckResult
} from "@/lib/admin/supabase-data-check";
import {
  createSupabaseAnonymousReadClient,
  runPublicRlsReadChecks,
  SupabaseCareerStatsRepository,
  SupabaseGalleryPhotoRepository,
  SupabaseMatchRepository,
  SupabaseMonthlyBeastCrownRepository,
  SupabasePlayerRepository,
  SupabaseProgressionLedgerRepository
} from "@/lib/supabase/read-repositories";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function loadSupabaseDataCheck(): Promise<SupabaseDataCheckResult> {
  const supabase = await createSupabaseServerClient();
  const anonymousClient = createSupabaseAnonymousReadClient();
  const playerRepository = new SupabasePlayerRepository(supabase);
  const matchRepository = new SupabaseMatchRepository(supabase);
  const careerRepository = new SupabaseCareerStatsRepository(supabase);
  const progressionRepository = new SupabaseProgressionLedgerRepository(supabase);
  const crownRepository = new SupabaseMonthlyBeastCrownRepository(supabase);
  const galleryRepository = new SupabaseGalleryPhotoRepository(supabase);

  const [
    players,
    matches,
    careerStats,
    matchStatApplications,
    monthlyBeastCrowns,
    galleryPhotos,
    publicRls
  ] = await Promise.all([
    playerRepository.getPlayers(),
    matchRepository.getMatches(),
    careerRepository.getCareerStats(),
    progressionRepository.getApplications(),
    crownRepository.getCrowns(),
    galleryRepository.getPhotos(),
    runPublicRlsReadChecks(anonymousClient)
  ]);

  return verifySupabaseDataSnapshot({
    snapshot: {
      players,
      matches,
      careerStats,
      matchStatApplications,
      monthlyBeastCrowns,
      galleryPhotos
    },
    publicRls
  });
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        ok
          ? "rounded bg-green-500/20 px-2 py-1 font-ui text-[0.65rem] font-black uppercase text-neon-green"
          : "rounded bg-red-500/20 px-2 py-1 font-ui text-[0.65rem] font-black uppercase text-red-200"
      }
    >
      {ok ? "PASS" : "FAILED"}
    </span>
  );
}

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;

  return (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-100">
      {issues.map((issue) => (
        <li key={issue}>{issue}</li>
      ))}
    </ul>
  );
}

export default async function SupabaseDataCheckPage() {
  await requireAdmin();

  let result: SupabaseDataCheckResult | null = null;
  let loadError: string | null = null;

  try {
    result = await loadSupabaseDataCheck();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Supabase data check failed.";
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <DatabaseZap className="h-8 w-8 text-neon-yellow" aria-hidden="true" />
            <div>
              <p className="text-xs font-black uppercase text-neon-cyan">
                Phase 2C1 read-only verification
              </p>
              <h1 className="font-display text-5xl uppercase comic-title">
                Supabase Data Check
              </h1>
            </div>
          </div>
          {result ? <StatusPill ok={result.ok} /> : null}
        </div>

        <p className="mt-4 max-w-3xl text-sm text-stone-300">
          This admin-only page verifies the imported Supabase demo data with
          SELECT-only reads. The public website still uses the existing local
          persistence.
        </p>

        {loadError ? (
          <div className="mt-6 rounded border border-red-400/40 bg-red-950/30 p-4">
            <h2 className="font-display text-2xl uppercase text-red-200">
              Check Failed To Load
            </h2>
            <p className="mt-2 text-sm text-red-100">{loadError}</p>
          </div>
        ) : null}

        {result ? (
          <div className="mt-6 space-y-6">
            <section className="rounded border border-white/15 bg-black/35 p-4">
              <h2 className="font-display text-2xl uppercase text-neon-yellow">
                Database Counts
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {result.counts.map((check) => (
                  <div
                    key={check.label}
                    className="rounded border border-white/15 bg-black/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-ui text-xs font-black uppercase text-stone-300">
                        {check.label}
                      </p>
                      <StatusPill ok={check.ok} />
                    </div>
                    <p className="mt-2 text-sm text-stone-300">
                      Expected: {check.expected}
                    </p>
                    <p className="font-display text-3xl text-neon-yellow">
                      Found: {check.found}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded border border-white/15 bg-black/35 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl uppercase text-neon-yellow">
                  Match Payload Check
                </h2>
                <StatusPill ok={result.matchPayload.ok} />
              </div>
              <p className="mt-2 text-sm text-stone-200">
                {result.matchPayload.valid} / {result.matchPayload.total} valid
              </p>
              <IssueList issues={result.matchPayload.issues} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded border border-white/15 bg-black/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-2xl uppercase text-neon-yellow">
                    Demo Match Check
                  </h2>
                  <StatusPill ok={result.demoFlags.ok} />
                </div>
                <p className="mt-2 text-sm text-stone-200">
                  {result.demoFlags.demo} / {result.demoFlags.total} demo
                </p>
                <IssueList issues={result.demoFlags.issues} />
              </div>

              <div className="rounded border border-white/15 bg-black/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-2xl uppercase text-neon-yellow">
                    Progression Ledger
                  </h2>
                  <StatusPill ok={result.progressionLedger.ok} />
                </div>
                <div className="mt-2 grid gap-2 text-sm text-stone-200 sm:grid-cols-2">
                  <p>{result.progressionLedger.records} records</p>
                  <p>{result.progressionLedger.orphaned} orphaned</p>
                  <p>
                    {result.progressionLedger.duplicateIdempotencyKeys} duplicate
                    idempotency keys
                  </p>
                  <p>
                    {result.progressionLedger.duplicateLogicalApplications} duplicate
                    logical applications
                  </p>
                </div>
                <IssueList issues={result.progressionLedger.issues} />
              </div>
            </section>

            <section className="rounded border border-white/15 bg-black/35 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl uppercase text-neon-yellow">
                  Career Stats
                </h2>
                <StatusPill ok={result.careerStats.ok} />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm text-stone-200">
                  <thead className="font-ui text-xs uppercase text-neon-cyan">
                    <tr>
                      <th className="py-2 pr-4">Player</th>
                      <th className="py-2 pr-4">Matches</th>
                      <th className="py-2 pr-4">Runs</th>
                      <th className="py-2 pr-4">Wickets</th>
                      <th className="py-2 pr-4">Catches</th>
                      <th className="py-2 pr-4">XP</th>
                      <th className="py-2 pr-4">Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.careerStats.sampleRows.map((row) => (
                      <tr key={row.playerId} className="border-t border-white/10">
                        <td className="py-2 pr-4 font-black text-stone-100">
                          {row.playerName}
                        </td>
                        <td className="py-2 pr-4">{row.matches}</td>
                        <td className="py-2 pr-4">{row.runs}</td>
                        <td className="py-2 pr-4">{row.wickets}</td>
                        <td className="py-2 pr-4">{row.catches}</td>
                        <td className="py-2 pr-4">{row.xp}</td>
                        <td className="py-2 pr-4">{row.level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <IssueList issues={result.careerStats.issues} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded border border-white/15 bg-black/35 p-4">
                <h2 className="font-display text-2xl uppercase text-neon-yellow">
                  Supabase Monthly Beast Race
                </h2>
                <p className="text-xs uppercase text-stone-400">
                  Month: {result.monthlyBeast.monthKey}
                </p>
                <div className="mt-3 space-y-2 text-sm text-stone-200">
                  {result.monthlyBeast.summaries.map((summary) => (
                    <p key={summary.category}>
                      <span className="font-ui font-black uppercase text-neon-cyan">
                        {summary.category} leaders:
                      </span>{" "}
                      {summary.leaders} ({summary.xp} XP)
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded border border-white/15 bg-black/35 p-4">
                <h2 className="font-display text-2xl uppercase text-neon-yellow">
                  Hall Of Legends Diagnostic
                </h2>
                <div className="mt-3 space-y-2 text-sm text-stone-200">
                  {result.hallOfLegends.summaries.map((summary) => (
                    <p key={summary.category}>
                      <span className="font-ui font-black uppercase text-neon-cyan">
                        {summary.category}:
                      </span>{" "}
                      {summary.leaders} ({summary.value})
                    </p>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded border border-white/15 bg-black/35 p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-neon-cyan" aria-hidden="true" />
                <h2 className="font-display text-2xl uppercase text-neon-yellow">
                  Public RLS Read Check
                </h2>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {result.publicRls.map((check) => (
                  <div
                    key={check.key}
                    className="rounded border border-white/15 bg-black/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-ui text-xs font-black uppercase text-stone-300">
                        {check.label}
                      </p>
                      <StatusPill ok={check.ok} />
                    </div>
                    <p className="mt-2 text-sm text-stone-300">
                      Count: {check.count ?? "unavailable"}
                    </p>
                    {check.error ? (
                      <p className="mt-2 text-sm text-red-200">{check.error}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
