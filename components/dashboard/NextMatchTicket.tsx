"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  canDeleteScheduledFixture,
  formatNextMatchDateLine,
  getDraftMatchSetupState,
  getFixtureLabel,
  getMatchPositionLabel,
  getTodaySlate,
  getLiveNextMatchTeamSummaries,
  getNextMatchAction,
  getNextMatchCountdownLabel,
  getNextMatchState,
  getTeamPlayerCount,
  getUniqueAttendanceCount,
  hasAssignedTeams,
  hasDuplicateMatchNumber
} from "@/lib/next-match";
import { localMatchRepository } from "@/lib/match-repository";
import type { MatchRecord, TeamId } from "@/lib/types/match";

function useDialogFocusTrap(onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement;

    initialFocusRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (
        previousActiveElement instanceof HTMLElement &&
        document.contains(previousActiveElement)
      ) {
        previousActiveElement.focus();
      }
    };
  }, [onClose]);

  return { dialogRef, initialFocusRef };
}

function TeamShield({ teamId }: { teamId: TeamId }) {
  const crestClassName =
    teamId === "teamA"
      ? "next-battle-team-crest next-battle-team-crest--a"
      : "next-battle-team-crest next-battle-team-crest--b";

  return (
    <div
      className={crestClassName}
      aria-label={teamId === "teamA" ? "Team A" : "Team B"}
    >
      <span className="next-battle-team-crest-motif" aria-hidden="true" />
      <span className="next-battle-team-crest-letter">
        {teamId === "teamA" ? "A" : "B"}
      </span>
    </div>
  );
}

function TicketShell({
  children,
  status,
  tone,
  positionLabel
}: {
  children: React.ReactNode;
  status: string;
  tone: "scheduled" | "match-day" | "live" | "empty";
  positionLabel?: string | null;
}) {
  return (
    <section className="next-match-ticket" data-tone={tone} aria-label="Next Match">
      <div className="next-match-ticket-topline">
        <span className="next-match-eyebrow">
          {tone === "match-day" ? "MATCH DAY" : tone === "live" ? "LIVE MATCH" : "NEXT BATTLE"}
        </span>
        {tone !== "empty" ? (
          <span className="next-match-ribbon">{status}</span>
        ) : null}
      </div>
      {positionLabel ? (
        <p className="next-match-position-label">{positionLabel}</p>
      ) : null}
      {children}
    </section>
  );
}

function TeamBlock({
  teamId,
  teamName,
  playerCount
}: {
  teamId: TeamId;
  teamName: string;
  playerCount: number;
}) {
  return (
    <div className="next-match-team">
      <TeamShield teamId={teamId} />
      <strong>{teamName}</strong>
      <span>
        {playerCount} {playerCount === 1 ? "PLAYER" : "PLAYERS"}
      </span>
    </div>
  );
}

function TeamVersusLayout({ match }: { match: MatchRecord }) {
  return (
    <div className="next-match-teams">
      <TeamBlock
        teamId="teamA"
        teamName={match.teams.teamA.teamName || "Team A"}
        playerCount={getTeamPlayerCount(match, "teamA")}
      />
      <span className="next-match-vs" aria-label="versus">
        VS
      </span>
      <TeamBlock
        teamId="teamB"
        teamName={match.teams.teamB.teamName || "Team B"}
        playerCount={getTeamPlayerCount(match, "teamB")}
      />
    </div>
  );
}

function TicketAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="next-match-action">
      {label}
    </Link>
  );
}

function TicketActions({
  primaryHref,
  primaryLabel,
  overflowMenu
}: {
  primaryHref: string;
  primaryLabel: string;
  overflowMenu?: React.ReactNode;
}) {
  return (
    <div className="next-match-actions">
      <TicketAction href={primaryHref} label={primaryLabel} />
      {overflowMenu}
    </div>
  );
}

function FixtureOverflowMenu({
  match,
  onReschedule,
  onDelete
}: {
  match: MatchRecord;
  onReschedule: (match: MatchRecord) => void;
  onDelete: (match: MatchRecord) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuLabel = `More actions for ${getFixtureLabel(match)}`;

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div className="next-match-overflow-wrap" ref={menuRef}>
      <button
        type="button"
        className="next-match-overflow-button"
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {"\u22EF"}
      </button>
      {isOpen ? (
        <div className="next-match-overflow-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onReschedule(match);
            }}
          >
            Reschedule Match
          </button>
          <button
            type="button"
            role="menuitem"
            className="next-match-overflow-delete"
            onClick={() => {
              setIsOpen(false);
              onDelete(match);
            }}
          >
            Delete Match
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TodaySlate({
  matches,
  match
}: {
  matches: MatchRecord[];
  match: MatchRecord;
}) {
  const slate = getTodaySlate({ matches, match });

  if (slate.length <= 1) return null;

  return (
    <Link href={`/matches?date=${match.matchDate}`} className="next-match-slate">
      <span>TODAY&apos;S SLATE</span>
      <strong>
        {slate
          .map((item) =>
            `${item.label} ${
              item.status === "done"
                ? "\u2713"
                : item.status === "live"
                  ? "LIVE"
                  : item.status === "next"
                    ? "NEXT"
                    : "LATER"
            }`
          )
          .join("   ")}
      </strong>
    </Link>
  );
}

function RescheduleDialog({
  match,
  matches,
  onClose
}: {
  match: MatchRecord;
  matches: MatchRecord[];
  onClose: () => void;
}) {
  const [matchDate, setMatchDate] = useState(match.matchDate);
  const [matchNumber, setMatchNumber] = useState<number | "">(
    match.matchNumber ?? ""
  );
  const [startTime, setStartTime] = useState(match.startTime ?? "");
  const [error, setError] = useState("");
  const { dialogRef, initialFocusRef } = useDialogFocusTrap(onClose);

  function saveSchedule() {
    const nextMatchNumber =
      matchNumber === "" ? null : Math.max(1, Number(matchNumber));

    if (!matchDate) {
      setError("Match date is required.");
      return;
    }

    if (
      hasDuplicateMatchNumber({
        matches,
        matchDate,
        matchNumber: nextMatchNumber,
        currentMatchId: match.id
      })
    ) {
      setError(
        `Game ${nextMatchNumber} already exists for this date. Choose another game number.`
      );
      return;
    }

    localMatchRepository.saveMatch({
      ...match,
      matchDate,
      matchNumber: nextMatchNumber,
      startTime: startTime || undefined
    });
    onClose();
  }

  return (
    <div className="next-match-dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="next-match-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Reschedule match"
      >
        <h2>RESCHEDULE MATCH</h2>
        <label>
          Match date
          <input
            type="date"
            value={matchDate}
            onChange={(event) => setMatchDate(event.target.value)}
          />
        </label>
        <label>
          Game number
          <input
            min={1}
            step={1}
            type="number"
            value={matchNumber}
            onChange={(event) =>
              setMatchNumber(
                event.target.value === "" ? "" : Math.max(1, Number(event.target.value))
              )
            }
          />
        </label>
        <label>
          Start time
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>
        {error ? <p>{error}</p> : null}
        <div className="next-match-dialog-actions">
          <button type="button" ref={initialFocusRef} onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={saveSchedule}>
            Save Schedule
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteMatchDialog({
  match,
  onClose
}: {
  match: MatchRecord;
  onClose: () => void;
}) {
  const { dialogRef, initialFocusRef } = useDialogFocusTrap(onClose);

  function deleteMatch() {
    localMatchRepository.deleteScheduledMatch(match.id);
    onClose();
    window.setTimeout(() => {
      document.querySelector<HTMLAnchorElement>('a[href="/matches/new"]')?.focus();
    }, 0);
  }

  return (
    <div className="next-match-dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="next-match-dialog next-match-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Delete scheduled match"
      >
        <h2>DELETE SCHEDULED MATCH?</h2>
        <div className="next-match-delete-summary">
          <strong>
            {getFixtureLabel(match)} - {match.matchName || "Gully Premier League"}
          </strong>
          <span>{formatNextMatchDateLine(match, "scheduled")}</span>
        </div>
        <p>
          This fixture will be removed from today&apos;s slate. No player
          statistics or XP will be affected.
        </p>
        <div className="next-match-dialog-actions">
          <button type="button" ref={initialFocusRef} onClick={onClose}>
            Keep Match
          </button>
          <button
            type="button"
            className="next-match-dialog-delete"
            onClick={deleteMatch}
          >
            Delete Match
          </button>
        </div>
      </section>
    </div>
  );
}

function EmptyTicket() {
  const action = getNextMatchAction({ type: "empty", match: null });

  return (
    <TicketShell status="" tone="empty">
      <div className="next-match-empty">
        <h2>NO MATCH SCHEDULED</h2>
        <p>The gully is waiting.</p>
      </div>
      <TicketActions primaryHref={action.href} primaryLabel={action.label} />
    </TicketShell>
  );
}

function ScheduledTicket({
  match,
  tone,
  matches,
  onReschedule,
  onDelete
}: {
  match: MatchRecord;
  tone: "scheduled" | "match-day";
  matches: MatchRecord[];
  onReschedule: (match: MatchRecord) => void;
  onDelete: (match: MatchRecord) => void;
}) {
  const state = {
    type: tone,
    match
  } as const;
  const action = getNextMatchAction(state);
  const countdown = getNextMatchCountdownLabel(match);
  const setupState = getDraftMatchSetupState(match);
  const teamsReady = hasAssignedTeams(match);
  const playerCount = getUniqueAttendanceCount(match);

  return (
    <TicketShell
      status={setupState === "ready" ? "READY" : tone === "match-day" ? "MATCH DAY" : "SCHEDULED"}
      tone={tone}
      positionLabel={getMatchPositionLabel({ matches, match })}
    >
      <div className="next-match-title-row">
        <h2>{tone === "match-day" ? "TODAY" : "SCHEDULED"}</h2>
        {countdown ? <span>{countdown}</span> : null}
      </div>
      <p className="next-match-date">{formatNextMatchDateLine(match, tone)}</p>
      <p className="next-match-name">{match.matchName || "Gully Premier League"}</p>
      {teamsReady ? (
        <>
          <TeamVersusLayout match={match} />
          {tone === "match-day" ? (
            <p className="next-match-ready">
              {playerCount} {playerCount === 1 ? "PLAYER" : "PLAYERS"} READY
            </p>
          ) : setupState === "setup-incomplete" ? (
            <p className="next-match-ready">MATCH SETUP INCOMPLETE</p>
          ) : null}
        </>
      ) : (
        <div className="next-match-lineup-pending">
          <strong>LINE-UP PENDING</strong>
          <span>
            {playerCount} {playerCount === 1 ? "PLAYER" : "PLAYERS"} AVAILABLE
          </span>
        </div>
      )}
      <TodaySlate matches={matches} match={match} />
      <TicketActions
        primaryHref={action.href}
        primaryLabel={action.label}
        overflowMenu={
          canDeleteScheduledFixture(match) ? (
            <FixtureOverflowMenu
              match={match}
              onReschedule={onReschedule}
              onDelete={onDelete}
            />
          ) : null
        }
      />
    </TicketShell>
  );
}

function LiveTicket({
  match,
  matches
}: {
  match: MatchRecord;
  matches: MatchRecord[];
}) {
  const action = getNextMatchAction({ type: "live", match });
  const teamSummaries = getLiveNextMatchTeamSummaries(match);

  return (
    <TicketShell
      status="LIVE"
      tone="live"
      positionLabel={getMatchPositionLabel({ matches, match })}
    >
      <p className="next-match-name">{match.matchName || "Gully Premier League"}</p>
      <div className="next-match-live-scores">
        {teamSummaries.map((team) => (
          <div key={team.teamId} className="next-match-live-team">
            <span>{team.teamName}</span>
            <strong>{team.score}</strong>
            {team.detail ? <small>{team.detail}</small> : null}
          </div>
        ))}
      </div>
      <TodaySlate matches={matches} match={match} />
      <TicketActions primaryHref={action.href} primaryLabel={action.label} />
    </TicketShell>
  );
}

export function NextMatchTicket({ matches }: { matches: MatchRecord[] }) {
  const state = getNextMatchState(matches);
  const [reschedulingMatch, setReschedulingMatch] = useState<MatchRecord | null>(
    null
  );
  const [deletingMatch, setDeletingMatch] = useState<MatchRecord | null>(null);

  return (
    <>
      {state.type === "empty" ? (
        <EmptyTicket />
      ) : state.type === "live" ? (
        <LiveTicket match={state.match} matches={matches} />
      ) : (
        <ScheduledTicket
          match={state.match}
          tone={state.type}
          matches={matches}
          onReschedule={setReschedulingMatch}
          onDelete={setDeletingMatch}
        />
      )}

      {reschedulingMatch ? (
        <RescheduleDialog
          match={reschedulingMatch}
          matches={matches}
          onClose={() => setReschedulingMatch(null)}
        />
      ) : null}
      {deletingMatch ? (
        <DeleteMatchDialog
          match={deletingMatch}
          onClose={() => setDeletingMatch(null)}
        />
      ) : null}
    </>
  );
}
