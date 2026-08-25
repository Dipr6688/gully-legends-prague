"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

type PomOption = {
  playerId: string;
  playerName: string;
};

type ApkOfficialFinaliseConfirmationProps = {
  action: string;
  expectedReviewVersion: number;
  matchDate: string;
  recommendedPomId: string | null;
  recommendedPomLabel: string;
  pomOptions: PomOption[];
  canFinalize: boolean;
  isDemo: boolean;
};

export function ApkOfficialFinaliseConfirmation({
  action,
  expectedReviewVersion,
  matchDate,
  recommendedPomId,
  recommendedPomLabel,
  pomOptions,
  canFinalize,
  isDemo
}: ApkOfficialFinaliseConfirmationProps) {
  const [confirming, setConfirming] = useState(false);

  if (isDemo) {
    return (
      <section className="mt-6 rounded-[8px] border border-neon-yellow/35 bg-neon-yellow/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-neon-yellow" aria-hidden="true" />
          <div>
            <h2 className="font-display text-2xl uppercase text-neon-yellow">
              DEMO MATCH - CANNOT BE FINALISED AS OFFICIAL
            </h2>
            <p className="mt-2 text-sm font-bold text-stone-200">
              Demo APK imports can be reviewed and corrected, but they cannot be added to
              official history.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form
      action={action}
      method="post"
      className="mt-6 rounded-[8px] border border-neon-cyan/30 bg-pitch-950/80 p-4"
    >
      <input
        type="hidden"
        name="expectedReviewVersion"
        value={expectedReviewVersion}
      />
      <h2 className="font-display text-2xl uppercase text-white">Finalise From Pending</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-black uppercase text-stone-300">
          Match Date
          <input
            name="matchDate"
            type="date"
            defaultValue={matchDate}
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
            {pomOptions.map((record) => (
              <option key={record.playerId} value={record.playerId}>
                {record.playerName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm text-stone-300">
        Website recommendation: {recommendedPomLabel}
      </p>

      {!confirming ? (
        <div className="mt-4">
          <Button
            type="button"
            disabled={!canFinalize}
            className="border-red-950 bg-red-500 text-white shadow-[0_0_22px_rgba(248,113,113,0.35)] hover:bg-red-400"
            onClick={() => setConfirming(true)}
          >
            FINALISE OFFICIAL MATCH
          </Button>
        </div>
      ) : (
        <section className="mt-5 rounded-[8px] border border-red-400/50 bg-red-950/45 p-4 shadow-[0_0_28px_rgba(248,113,113,0.22)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 h-6 w-6 flex-shrink-0 text-red-200" aria-hidden="true" />
            <div>
              <h3 className="font-display text-3xl uppercase text-red-100">
                FINALISE OFFICIAL MATCH?
              </h3>
              <p className="mt-2 text-sm font-bold text-red-50">
                This will permanently add this match to official history and update:
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-bold text-red-50">
                <li>career statistics</li>
                <li>XP / levels</li>
                <li>Player of the Match</li>
                <li>Game Number</li>
                <li>Archive / rankings / derived features</li>
              </ul>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              CANCEL
            </Button>
            <Button
              type="submit"
              disabled={!canFinalize}
              className="border-red-950 bg-red-500 text-white shadow-[0_0_24px_rgba(248,113,113,0.4)] hover:bg-red-400"
            >
              FINALISE OFFICIAL MATCH
            </Button>
          </div>
        </section>
      )}
    </form>
  );
}
