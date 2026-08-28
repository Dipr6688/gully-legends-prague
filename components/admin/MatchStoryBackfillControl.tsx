"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { MatchStoryBackfillSummary } from "@/lib/supabase/match-story-backfill";

type BackfillResponse =
  | ({ ok: true } & MatchStoryBackfillSummary)
  | { ok: false; message: string; code?: string };

function formatSummary(result: MatchStoryBackfillSummary): string {
  return `Eligible: ${result.eligible} · Generated: ${result.generated} · Skipped: ${result.skipped} · Failed: ${result.failed}`;
}

export function MatchStoryBackfillControl() {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<BackfillResponse | null>(null);

  async function generateHistoricalStories() {
    if (isGenerating) return;

    setIsGenerating(true);
    setResult(null);

    const response = await fetch("/api/admin/match-stories/backfill", {
      method: "POST"
    });
    const body = (await response.json().catch(() => null)) as BackfillResponse | null;

    setIsGenerating(false);

    if (!body) {
      setResult({
        ok: false,
        message: "COULD NOT GENERATE HISTORICAL MATCH STORIES"
      });
      return;
    }

    setResult(body);

    if (body.ok) {
      setIsConfirming(false);
    }
  }

  return (
    <section className="admin-control-card match-story-admin-card">
      <div>
        <BookOpen aria-hidden="true" />
        <h2>MATCH STORIES</h2>
      </div>
      <p className="font-ui text-xs font-black uppercase text-neon-cyan">
        Historical Match Stories can be generated automatically from existing official matches.
      </p>
      <p className="text-xs font-bold uppercase text-stone-300">
        Existing stories are skipped and never overwritten.
      </p>

      {result ? (
        <div
          className={result.ok ? "match-story-admin-result" : "match-story-admin-error"}
          role={result.ok ? "status" : "alert"}
        >
          <strong>{result.ok ? formatSummary(result) : result.message}</strong>
          {result.ok && result.failures.length > 0 ? (
            <ul>
              {result.failures.map((failure) => (
                <li key={failure.matchId}>
                  {failure.matchName}: {failure.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="admin-control-links">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setResult(null);
            setIsConfirming(true);
          }}
          disabled={isGenerating}
        >
          Generate Historical Stories
        </Button>
      </div>

      {isConfirming ? (
        <div className="match-story-admin-confirmation">
          <h3>GENERATE HISTORICAL STORIES?</h3>
          <p>
            This will create automatic Match Stories for eligible official matches
            that do not already have one.
          </p>
          <p>Existing stories will not be changed.</p>
          <div className="match-story-admin-confirmation-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsConfirming(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={generateHistoricalStories}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating Stories" : "Generate Stories"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
