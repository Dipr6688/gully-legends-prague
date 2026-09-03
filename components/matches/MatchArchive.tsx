"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import {
  formatMatchDisplayDate,
  getMatchScheduledOversLabel,
  getMatchResultHeadline,
  getMatchScoreRowsInInningsOrder
} from "@/lib/match-display";
import {
  ARCHIVE_MONTH_OPTIONS,
  MATCH_ARCHIVE_PAGE_SIZE,
  filterArchivedMatches,
  getAvailableArchiveYears,
  getMatchArchiveDisplayIdentifier,
  getMatchArchiveGameLabel,
  getPaginatedArchiveMatches,
  groupArchiveMatchesByDate,
  normaliseArchiveQuery,
  sortArchivedMatches,
  type MatchArchiveQuery,
  type MatchArchiveResultFilter,
  type MatchArchiveSortOrder
} from "@/lib/match-archive";
import type { MatchRecord } from "@/lib/types/match";

export const MATCH_ARCHIVE_EMPTY_TITLE = "NO MATCHES IN THE ARCHIVE";
export const MATCH_ARCHIVE_EMPTY_COPY =
  "Finalise the first Gully Legends match to begin the match archive.";

const resultFilterOptions: Array<{
  label: string;
  value: MatchArchiveResultFilter;
}> = [
  { label: "All Results", value: "all" },
  { label: "Team A Win", value: "teamA" },
  { label: "Team B Win", value: "teamB" },
  { label: "Tie", value: "tie" }
];

const sortOptions: Array<{ label: string; value: MatchArchiveSortOrder }> = [
  { label: "Newest First", value: "newest" },
  { label: "Oldest First", value: "oldest" }
];

function getVisiblePaginationItems(
  currentPage: number,
  pageCount: number
): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set([1, pageCount, currentPage]);

  if (currentPage > 1) pages.add(currentPage - 1);
  if (currentPage < pageCount) pages.add(currentPage + 1);

  const sortedPages = [...pages].sort((left, right) => left - right);
  const items: Array<number | "ellipsis"> = [];

  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];

    if (previousPage && page - previousPage > 1) {
      items.push("ellipsis");
    }

    items.push(page);
  });

  return items;
}

function MatchArchiveCard({
  match,
  returnTo
}: {
  match: MatchRecord;
  returnTo: string;
}) {
  const scorecardHref = `/matches/${match.id}?returnTo=${encodeURIComponent(returnTo)}`;
  const scoreRows = getMatchScoreRowsInInningsOrder(match);

  return (
    <Link href={scorecardHref} className="match-archive-card">
      <div className="match-archive-card-header">
        <div>
          <span className="match-archive-game-label">{getMatchArchiveGameLabel(match)}</span>
          <h2>{formatMatchDisplayDate(match.matchDate)}</h2>
          <p>{match.matchName}</p>
          <span>{match.venue}</span>
          <small>{getMatchArchiveDisplayIdentifier(match)}</small>
        </div>
        <strong>Finalised</strong>
      </div>

      {match.matchStory?.title ? (
        <div className="match-archive-story-title" aria-label="Match story title">
          {match.matchStory.title}
        </div>
      ) : null}

      <div className="match-archive-length" aria-label="Scheduled match length">
        <span>Match Length</span>
        <strong className="data-number-strong">{getMatchScheduledOversLabel(match)}</strong>
      </div>

      <div className="match-archive-scores" aria-label={`${match.matchName} score`}>
        {scoreRows.map((row) => (
          <div key={row.teamId}>
            <span>{row.teamName}</span>
            <b className="data-number-strong">
              {row.score}
              <small className="data-number">({row.overs})</small>
            </b>
          </div>
        ))}
      </div>

      <p className="match-archive-result">{getMatchResultHeadline(match)}</p>
      <span className="match-archive-action">
        View Scorecard
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

function ArchiveControlBar({
  query,
  availableYears,
  onQueryChange,
  onClearFilters,
  totalMatches,
  filteredMatches
}: {
  query: MatchArchiveQuery;
  availableYears: number[];
  onQueryChange: (
    updates: Partial<MatchArchiveQuery>,
    options?: { resetPage?: boolean }
  ) => void;
  onClearFilters: () => void;
  totalMatches: number;
  filteredMatches: number;
}) {
  const countLabel =
    filteredMatches === totalMatches
      ? `${totalMatches} FINALISED MATCHES`
      : `${filteredMatches} OF ${totalMatches} MATCHES`;

  return (
    <div className="match-archive-shell-header">
      <div className="match-archive-title-row">
        <div>
          <p>Match Archive</p>
          <h2>{countLabel}</h2>
        </div>
        {query.q ||
        query.month !== "all" ||
        query.year !== "all" ||
        query.result !== "all" ||
        query.date ||
        query.sort !== "newest" ? (
          <button type="button" onClick={onClearFilters}>
            Clear Filters
          </button>
        ) : null}
      </div>
      <div className="match-archive-controls">
        <label>
          <span>Search</span>
          <input
            type="search"
            value={query.q}
            placeholder="Search player, team or venue..."
            onChange={(event) => onQueryChange({ q: event.target.value })}
          />
        </label>
        <label>
          <span>Match Date</span>
          <input
            type="date"
            value={query.date}
            onChange={(event) => onQueryChange({ date: event.target.value })}
          />
        </label>
        <label>
          <span>Month</span>
          <select
            value={query.month}
            onChange={(event) =>
              onQueryChange({
                month:
                  event.target.value === "all"
                    ? "all"
                    : Number.parseInt(event.target.value, 10)
              })
            }
          >
            <option value="all">All Months</option>
            {ARCHIVE_MONTH_OPTIONS.map((monthName, index) => (
              <option key={monthName} value={index + 1}>
                {monthName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Year</span>
          <select
            value={query.year}
            onChange={(event) =>
              onQueryChange({
                year:
                  event.target.value === "all"
                    ? "all"
                    : Number.parseInt(event.target.value, 10)
              })
            }
          >
            <option value="all">All Years</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Result</span>
          <select
            value={query.result}
            onChange={(event) =>
              onQueryChange({
                result: event.target.value as MatchArchiveResultFilter
              })
            }
          >
            {resultFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select
            value={query.sort}
            onChange={(event) =>
              onQueryChange({
                sort: event.target.value as MatchArchiveSortOrder
              })
            }
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function ArchivePagination({
  currentPage,
  pageCount,
  startItem,
  endItem,
  totalMatches,
  onPageChange
}: {
  currentPage: number;
  pageCount: number;
  startItem: number;
  endItem: number;
  totalMatches: number;
  onPageChange: (page: number) => void;
}) {
  if (totalMatches === 0) return null;

  return (
    <div className="match-archive-pagination">
      <p>
        Showing {startItem}-{endItem} of {totalMatches} matches
      </p>
      <div className="match-archive-pagination-controls">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </button>
        {getVisiblePaginationItems(currentPage, pageCount).map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} aria-hidden="true">
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={item === currentPage ? "is-active" : undefined}
              aria-current={item === currentPage ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          disabled={currentPage === pageCount}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function MatchArchive({
  finalisedMatches: suppliedFinalisedMatches
}: {
  finalisedMatches?: MatchRecord[];
}) {
  const localRepository = useMatchRepository();
  const finalisedMatches = suppliedFinalisedMatches ?? localRepository.finalisedMatches;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const query = useMemo(
    () => normaliseArchiveQuery(searchParams),
    [searchParams]
  );
  const availableYears = useMemo(
    () => getAvailableArchiveYears(finalisedMatches),
    [finalisedMatches]
  );
  const filteredMatches = useMemo(
    () => filterArchivedMatches(finalisedMatches, query),
    [finalisedMatches, query]
  );
  const sortedMatches = useMemo(
    () => sortArchivedMatches(filteredMatches, query.sort),
    [filteredMatches, query.sort]
  );
  const paginatedArchive = useMemo(
    () =>
      getPaginatedArchiveMatches(
        sortedMatches,
        query.page,
        MATCH_ARCHIVE_PAGE_SIZE
      ),
    [query.page, sortedMatches]
  );
  const groupedMatches = useMemo(
    () =>
      groupArchiveMatchesByDate(
        paginatedArchive.pageMatches,
        sortedMatches
      ),
    [paginatedArchive.pageMatches, sortedMatches]
  );
  const returnTo = `${pathname}${searchParamString ? `?${searchParamString}` : ""}`;

  function updateQuery(
    updates: Partial<MatchArchiveQuery>,
    options: { resetPage?: boolean } = { resetPage: true }
  ) {
    const params = new URLSearchParams(searchParamString);

    Object.entries(updates).forEach(([key, value]) => {
      if (
        value === "" ||
        value === "all" ||
        (key === "sort" && value === "newest")
      ) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    if (options.resetPage ?? true) {
      params.delete("page");
    }

    const nextQueryString = params.toString();

    router.push(nextQueryString ? `${pathname}?${nextQueryString}` : pathname);
  }

  function clearFilters() {
    const params = new URLSearchParams(searchParamString);

    ["q", "date", "month", "year", "result", "sort", "page"].forEach((key) =>
      params.delete(key)
    );

    const nextQueryString = params.toString();

    router.push(nextQueryString ? `${pathname}?${nextQueryString}` : pathname);
  }

  if (finalisedMatches.length === 0) {
    return (
      <section className="match-archive-shell" aria-label="Finalised match archive">
        <EmptyState title={MATCH_ARCHIVE_EMPTY_TITLE}>
          {MATCH_ARCHIVE_EMPTY_COPY}
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="match-archive-shell" aria-label="Finalised match archive">
      <ArchiveControlBar
        query={query}
        availableYears={availableYears}
        totalMatches={finalisedMatches.length}
        filteredMatches={filteredMatches.length}
        onQueryChange={updateQuery}
        onClearFilters={clearFilters}
      />

      {paginatedArchive.totalMatches === 0 ? (
        <div className="match-archive-empty-filter">
          <h2>NO MATCHES FOUND</h2>
          <p>Try another player, date, team or venue.</p>
          <button type="button" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      ) : (
        <>
          <div className="match-archive-group-stack">
            {groupedMatches.map((group) => (
              <div key={group.dateKey} className="match-archive-date-group">
                {group.totalForDate > 1 ? (
                  <div className="match-archive-date-heading">
                    <strong>{group.label}</strong>
                    <span>
                      {group.totalForDate}{" "}
                      {group.totalForDate === 1 ? "MATCH" : "MATCHES"}
                    </span>
                  </div>
                ) : null}
                <div className="match-archive-grid">
                  {group.matches.map((match) => (
                    <MatchArchiveCard
                      key={match.id}
                      match={match}
                      returnTo={returnTo}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <ArchivePagination
            currentPage={paginatedArchive.currentPage}
            pageCount={paginatedArchive.pageCount}
            startItem={paginatedArchive.startItem}
            endItem={paginatedArchive.endItem}
            totalMatches={paginatedArchive.totalMatches}
            onPageChange={(page) => updateQuery({ page }, { resetPage: false })}
          />
        </>
      )}
    </section>
  );
}
