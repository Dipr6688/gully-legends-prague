"use client";

import Link from "next/link";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import {
  getDraftMatchSetupState,
  getFixtureLabel,
  getSameDayFixtures
} from "@/lib/next-match";
import type { MatchRecord } from "@/lib/types/match";

function getFixtureStatus(match: MatchRecord): string {
  if (match.status === "finalised") return "FINALISED";
  if (match.status === "in_progress") return "LIVE";
  if (match.status === "draft") {
    return getDraftMatchSetupState(match) === "ready" ? "READY" : "SCHEDULED";
  }

  return match.status.toUpperCase();
}

export function TodayFixtures({
  dateFilter,
  matches: suppliedMatches
}: {
  dateFilter?: string;
  matches?: MatchRecord[];
}) {
  const localRepository = useMatchRepository();
  const matches = suppliedMatches ?? localRepository.matches;
  const selectedDate =
    dateFilter ??
    new Date().toLocaleDateString("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  const fixtures = getSameDayFixtures(matches, selectedDate).filter(
    (match) => match.status !== "abandoned" && match.status !== "cancelled"
  );

  return (
    <section className="today-fixtures">
      <div className="today-fixtures-header">
        <div>
          <p>Today&apos;s Fixtures</p>
          <h2>{selectedDate}</h2>
        </div>
        <Link href="/matches/new">Add Fixture</Link>
      </div>
      {fixtures.length === 0 ? (
        <p className="today-fixtures-empty">No fixtures scheduled for this date.</p>
      ) : (
        <div className="today-fixtures-list">
          {fixtures.map((match) => (
            <Link key={match.id} href={`/matches/${match.id}`} className="today-fixture-row">
              <strong>{getFixtureLabel(match)}</strong>
              <span>{match.matchName}</span>
              <b>{getFixtureStatus(match)}</b>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
