"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PlayerCard } from "@/components/players/PlayerCard";
import { useCareerPlayers } from "@/components/players/useCareerPlayers";
import {
  DEFAULT_PLAYER_BROWSER_OPTIONS,
  PLAYER_SORT_LABELS,
  PLAY_STYLE_LABELS,
  formatVisibleWarriorCount,
  getVisiblePlayers,
  type PlayerBrowserOptions,
  type PlayerBrowserSort,
  type PlayerBrowserStyle
} from "@/lib/player-browser";
import type { Player } from "@/lib/types/player";

const playStyleOptions = [
  "all",
  "batting",
  "pace",
  "spin",
  "utility"
] as const satisfies PlayerBrowserStyle[];

const sortOptions = [
  "roster",
  "name",
  "level",
  "xp",
  "bladePower",
  "deliveryThreat",
  "fieldReflex"
] as const satisfies PlayerBrowserSort[];

export function PlayerBrowserSection({ players }: { players: Player[] }) {
  const careerPlayers = useCareerPlayers(players);
  const [options, setOptions] = useState<PlayerBrowserOptions>(
    DEFAULT_PLAYER_BROWSER_OPTIONS
  );
  const carouselRef = useRef<HTMLDivElement>(null);
  const visiblePlayers = useMemo(
    () => getVisiblePlayers({ players: careerPlayers, options }),
    [careerPlayers, options]
  );
  const countLabel = formatVisibleWarriorCount({
    count: visiblePlayers.length,
    style: options.style,
    search: options.search
  });

  useEffect(() => {
    carouselRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [options.style, options.search, options.sort]);

  function updateOptions(updates: Partial<PlayerBrowserOptions>) {
    setOptions((current) => ({ ...current, ...updates }));
  }

  function clearFilters() {
    setOptions(DEFAULT_PLAYER_BROWSER_OPTIONS);
  }

  return (
    <section className="dashboard-players space-y-5">
      <div className="players-browser-header">
        <div className="players-browser-title">
          <h2 className="arcade-heading text-[2.25rem] uppercase">
            Our Players
          </h2>
          <p
            className="stat-label mt-2 text-base font-bold uppercase text-neon-cyan"
            aria-live="polite"
          >
            {countLabel}
          </p>
        </div>

        <div className="players-browser-controls" aria-label="Player filters">
          <div className="players-browser-primary-controls">
            <button
              type="button"
              className="players-filter-button"
              data-active={options.style === "all"}
              aria-pressed={options.style === "all"}
              onClick={() => updateOptions({ style: "all" })}
            >
              All
            </button>
            <BrowserMenu
              label="Play Style"
              triggerLabel={
                options.style === "all"
                  ? "Play Style"
                  : PLAY_STYLE_LABELS[options.style]
              }
              isActive={options.style !== "all"}
            >
              {({ closeMenu }) =>
                playStyleOptions.map((style) => (
                  <button
                    key={style}
                    type="button"
                    role="menuitemradio"
                    aria-checked={options.style === style}
                    className="players-menu-option"
                    data-active={options.style === style}
                    onClick={() => {
                      updateOptions({ style });
                      closeMenu();
                    }}
                  >
                    <span>{PLAY_STYLE_LABELS[style]}</span>
                    {options.style === style ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : null}
                  </button>
                ))
              }
            </BrowserMenu>
          </div>

          <div className="players-browser-secondary-controls">
            <label className="players-search-control">
              <span className="sr-only">Search players</span>
              <Search className="h-4 w-4" aria-hidden="true" />
              <input
                type="search"
                value={options.search}
                placeholder="SEARCH PLAYER..."
                aria-label="Search players"
                onChange={(event) => updateOptions({ search: event.target.value })}
              />
              {options.search ? (
                <button
                  type="button"
                  aria-label="Clear player search"
                  onClick={() => updateOptions({ search: "" })}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </label>

            <BrowserMenu
              label="Sort By"
              triggerLabel={PLAYER_SORT_LABELS[options.sort]}
            >
              {({ closeMenu }) =>
                sortOptions.map((sort) => (
                  <button
                    key={sort}
                    type="button"
                    role="menuitemradio"
                    aria-checked={options.sort === sort}
                    className="players-menu-option"
                    data-active={options.sort === sort}
                    onClick={() => {
                      updateOptions({ sort });
                      closeMenu();
                    }}
                  >
                    <span>{PLAYER_SORT_LABELS[sort]}</span>
                    {options.sort === sort ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : null}
                  </button>
                ))
              }
            </BrowserMenu>
          </div>
        </div>
      </div>

      {visiblePlayers.length > 0 ? (
        <div
          ref={carouselRef}
          className="players-carousel"
          aria-label="Player cards carousel"
        >
          {visiblePlayers.map((player, index) => (
            <PlayerCard key={player.id} player={player} priority={index < 4} />
          ))}
        </div>
      ) : (
        <div className="players-empty-state">
          <h3>NO WARRIORS FOUND</h3>
          <p>Try another Play Style or clear the player search.</p>
          <button type="button" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}
    </section>
  );
}

function BrowserMenu({
  label,
  triggerLabel,
  isActive = false,
  children
}: {
  label: string;
  triggerLabel: string;
  isActive?: boolean;
  children: (props: { closeMenu: () => void }) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="players-browser-menu" ref={menuRef}>
      <button
        type="button"
        className="players-filter-button"
        data-active={isActive}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{triggerLabel}</span>
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </button>
      {isOpen ? (
        <div className="players-browser-menu-list" role="menu" aria-label={label}>
          {children({ closeMenu: () => setIsOpen(false) })}
        </div>
      ) : null}
    </div>
  );
}
