"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { resetSupabaseDemoData } from "@/lib/admin-monthly-beasts-client";

const RESET_DEMO_CONFIRMATION_PHRASE = "RESET DEMO";

export function DemoDataResetControl({ demoMatchCount }: { demoMatchCount: number }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canReset = confirmation === RESET_DEMO_CONFIRMATION_PHRASE && !isResetting;

  async function confirmResetDemoData() {
    if (!canReset) return;

    setIsResetting(true);
    setMessage(null);

    const result = await resetSupabaseDemoData(confirmation);

    setIsResetting(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setIsDialogOpen(false);
    setConfirmation("");
    setMessage(
      `Demo reset complete: ${result.demoMatchesRemoved ?? 0} matches removed, ${result.careerRowsRebuilt ?? 0} career rows rebuilt.`
    );
  }

  return (
    <section className="admin-control-card">
      <div>
        <h2>DEMO DATA</h2>
      </div>
      <p className="font-ui text-xs font-black uppercase text-neon-cyan">
        {demoMatchCount} sample matches active
      </p>
      {message ? <p className="text-sm text-stone-200">{message}</p> : null}
      <div className="admin-control-links">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setMessage(null);
            setIsDialogOpen(true);
          }}
          disabled={demoMatchCount === 0}
        >
          Reset Demo Data
        </Button>
      </div>

      {isDialogOpen ? (
        <div className="monthly-beasts-dialog-backdrop">
          <section
            className="monthly-beasts-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-demo-data-title"
          >
            <p className="formula-eyebrow">Demo data</p>
            <h2 id="reset-demo-data-title">Reset Demo Data?</h2>
            <div className="monthly-beasts-dialog-summary text-left">
              <p>This will permanently remove:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>demo matches and scorecards;</li>
                <li>demo progression records;</li>
                <li>demo Monthly Beast crown history;</li>
                <li>demo-derived career contributions.</li>
              </ul>
              <p className="mt-4">This will NOT remove:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>players, player artwork or player profiles;</li>
                <li>real Gallery photographs;</li>
                <li>the Admin account or website configuration;</li>
                <li>real matches.</li>
              </ul>
            </div>
            <label className="monthly-beasts-confirm-check">
              <span>Type RESET DEMO</span>
              <input
                type="text"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="match-input"
                autoComplete="off"
              />
            </label>
            <div className="monthly-beasts-dialog-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setConfirmation("");
                  setIsDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={confirmResetDemoData}
                disabled={!canReset}
              >
                Reset Demo Data
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
