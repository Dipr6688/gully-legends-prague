"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Save, Send, Shuffle, Trash2, Users } from "lucide-react";
import { players } from "@/lib/data/players";
import {
  calculateTeamTotals,
  getCrossTeamPlayerIds,
  sanitizeRuns,
  setPlayerAvailability,
  toggleTeamSelection
} from "@/lib/match-records";
import { calculateMatchXP } from "@/lib/progression";
import type {
  BowlingOver,
  MatchStatus,
  MockMatchFormValues,
  PlayerMatchPerformance,
  TeamId
} from "@/lib/types/match";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type TeamKey = "A" | "B";

type BowlingEntry = BowlingOver & {
  id: string;
  bowlerId: string;
};

type ValidationResponse = {
  ok: boolean;
  errors: string[];
  totals: {
    teamATotal: number;
    teamBTotal: number;
  };
};

const initialValues: MockMatchFormValues = {
  matchDate: "",
  matchName: "Gully Premier League",
  teamAName: "Team A",
  teamBName: "Team B",
  teamATotal: 0,
  teamBTotal: 0,
  winner: "",
  notes: ""
};

const allPlayerIds = players.map((player) => player.id);

function createPerformance(
  playerId: string,
  teamId: TeamId
): PlayerMatchPerformance {
  return {
    playerId,
    teamId,
    played: true,
    teamWon: false,
    playerOfMatch: false,
    didBat: false,
    runs: 0,
    wasOut: false,
    wickets: 0,
    overs: [],
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0
  };
}

function createBowlingEntry(activePlayerIds: string[]): BowlingEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    bowlerId: activePlayerIds[0] ?? "",
    runsConceded: 0,
    wickets: 0,
    maiden: false
  };
}

export function MockMatchEntryForm() {
  const [values, setValues] = useState(initialValues);
  const [availablePlayerIds, setAvailablePlayerIds] = useState<string[]>([]);
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [performances, setPerformances] = useState<Record<string, PlayerMatchPerformance>>({});
  const [bowlingOvers, setBowlingOvers] = useState<BowlingEntry[]>([]);
  const [status, setStatus] = useState<MatchStatus>("draft");
  const [isBalancing, setIsBalancing] = useState(false);
  const [message, setMessage] = useState(
    "This mock form is local only. No Supabase connection yet."
  );

  const activePlayerIds = useMemo(() => [...teamA, ...teamB], [teamA, teamB]);
  const activePlayerIdSet = useMemo(() => new Set(activePlayerIds), [activePlayerIds]);
  const activePlayers = useMemo(
    () => players.filter((player) => activePlayerIdSet.has(player.id)),
    [activePlayerIdSet]
  );
  const duplicatePlayers = useMemo(
    () => getCrossTeamPlayerIds({ teamAPlayerIds: teamA, teamBPlayerIds: teamB }),
    [teamA, teamB]
  );

  const performanceList = useMemo(
    () =>
      activePlayers.map((player) => {
        const teamId: TeamId = teamA.includes(player.id) ? "teamA" : "teamB";
        const base = performances[player.id] ?? createPerformance(player.id, teamId);
        const playerOvers = bowlingOvers
          .filter((over) => over.bowlerId === player.id)
          .map(({ runsConceded, wickets, maiden }) => ({
            runsConceded,
            wickets,
            maiden
          }));

        return {
          ...base,
          teamId,
          teamWon: didTeamWin(player.id, values.winner, teamA, teamB),
          runs: sanitizeRuns(base.runs),
          wickets: playerOvers.reduce((sum, over) => sum + over.wickets, 0),
          overs: playerOvers
        };
      }),
    [activePlayers, bowlingOvers, performances, teamA, teamB, values.winner]
  );

  const teamTotals = useMemo(
    () =>
      calculateTeamTotals(performanceList, {
        teamAPlayerIds: teamA,
        teamBPlayerIds: teamB
      }),
    [performanceList, teamA, teamB]
  );

  function applyRosters(nextAvailable: string[], nextTeamA: string[], nextTeamB: string[]) {
    const selectedIds = new Set([...nextTeamA, ...nextTeamB]);
    setAvailablePlayerIds(nextAvailable);
    setTeamA(nextTeamA);
    setTeamB(nextTeamB);
    setBowlingOvers((current) =>
      current.map((over) =>
        selectedIds.has(over.bowlerId) ? over : { ...over, bowlerId: "" }
      )
    );
  }

  function selectAllAvailable() {
    applyRosters(allPlayerIds, teamA, teamB);
    setMessage("All players marked available for this match.");
  }

  function clearAvailability() {
    applyRosters([], [], []);
    setMessage("Availability cleared. Team selections were also cleared.");
  }

  function clearTeams() {
    applyRosters(availablePlayerIds, [], []);
    setMessage("Teams cleared. Available players are unchanged.");
  }

  function toggleAvailability(playerId: string, isAvailable: boolean) {
    const next = setPlayerAvailability(
      {
        availablePlayerIds,
        teamAPlayerIds: teamA,
        teamBPlayerIds: teamB
      },
      playerId,
      isAvailable
    );
    applyRosters(next.availablePlayerIds, next.teamAPlayerIds, next.teamBPlayerIds);
  }

  function togglePlayer(team: TeamKey, playerId: string) {
    const teamId = team === "A" ? "teamA" : "teamB";
    const next = toggleTeamSelection(
      {
        availablePlayerIds,
        teamAPlayerIds: teamA,
        teamBPlayerIds: teamB
      },
      teamId,
      playerId
    );
    applyRosters(next.availablePlayerIds, next.teamAPlayerIds, next.teamBPlayerIds);

    if (
      next.teamAPlayerIds.includes(playerId) ||
      next.teamBPlayerIds.includes(playerId)
    ) {
      updatePerformance(playerId, { teamId });
    }
  }

  async function autoBalanceTeams() {
    if (availablePlayerIds.length < 2) {
      setMessage("Select at least two available players before balancing teams.");
      return;
    }

    setIsBalancing(true);

    try {
      const response = await fetch("/api/team-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availablePlayerIds })
      });
      const result = (await response.json()) as {
        teamAPlayerIds?: string[];
        teamBPlayerIds?: string[];
        error?: string;
      };

      if (!response.ok || !result.teamAPlayerIds || !result.teamBPlayerIds) {
        setMessage(result.error ?? "Could not balance teams. Please try again.");
        return;
      }

      applyRosters(availablePlayerIds, result.teamAPlayerIds, result.teamBPlayerIds);
      setPerformances((current) => {
        const next = { ...current };

        for (const playerId of result.teamAPlayerIds ?? []) {
          next[playerId] = {
            ...(next[playerId] ?? createPerformance(playerId, "teamA")),
            teamId: "teamA"
          };
        }

        for (const playerId of result.teamBPlayerIds ?? []) {
          next[playerId] = {
            ...(next[playerId] ?? createPerformance(playerId, "teamB")),
            teamId: "teamB"
          };
        }

        return next;
      });
      setMessage("Teams generated. You can still adjust them manually.");
    } finally {
      setIsBalancing(false);
    }
  }

  function updatePerformance(
    playerId: string,
    updates: Partial<PlayerMatchPerformance>
  ) {
    const teamId: TeamId = teamA.includes(playerId) ? "teamA" : "teamB";
    setPerformances((current) => ({
      ...current,
      [playerId]: {
        ...(current[playerId] ?? createPerformance(playerId, teamId)),
        ...updates
      }
    }));
  }

  function updateBowlingOver(id: string, updates: Partial<BowlingEntry>) {
    setBowlingOvers((current) =>
      current.map((over) => (over.id === id ? { ...over, ...updates } : over))
    );
  }

  function addBowlingOver() {
    setBowlingOvers((current) => [...current, createBowlingEntry(activePlayerIds)]);
  }

  function removeBowlingOver(id: string) {
    setBowlingOvers((current) => current.filter((over) => over.id !== id));
  }

  async function validateAndSetStatus(nextStatus: MatchStatus) {
    try {
      const response = await fetch("/api/matches/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchDate: values.matchDate,
          availablePlayerIds,
          teamAPlayerIds: teamA,
          teamBPlayerIds: teamB,
          performances: performanceList
        })
      });
      const result = (await response.json()) as ValidationResponse;

      setValues((current) => ({ ...current, ...result.totals }));

      if (!response.ok || !result.ok) {
        setMessage(result.errors[0] ?? "Please check the match record.");
        return;
      }

      setStatus(nextStatus);
      setMessage(
        nextStatus === "draft"
          ? "Draft checked locally. Totals were recalculated from player runs."
          : "Submitted for review in mock mode. Totals were recalculated from player runs."
      );
    } catch {
      setMessage("Could not validate this mock match right now.");
    }
  }

  function resetForm() {
    setValues(initialValues);
    setAvailablePlayerIds([]);
    setTeamA([]);
    setTeamB([]);
    setPerformances({});
    setBowlingOvers([]);
    setStatus("draft");
    setMessage("Mock form reset.");
  }

  return (
    <Card className="border-neon-cyan/45">
      <div className="flex flex-col justify-between gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-black uppercase text-neon-cyan">
            Fixed venue: CZU Gully Arena - Open Field, Prague
          </p>
          <h1 className="mt-1 text-3xl font-black uppercase">Mock Match Entry</h1>
        </div>
        <span className="rounded-md border border-neon-yellow/40 bg-neon-yellow/10 px-3 py-2 text-xs font-black uppercase text-neon-yellow">
          Status: {status}
        </span>
      </div>

      <form className="mt-5 grid gap-5" onSubmit={(event) => event.preventDefault()}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Match date
            <input
              type="date"
              value={values.matchDate}
              onChange={(event) =>
                setValues((current) => ({ ...current, matchDate: event.target.value }))
              }
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Match name
            <input
              value={values.matchName}
              onChange={(event) =>
                setValues((current) => ({ ...current, matchName: event.target.value }))
              }
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Team A name
            <input
              value={values.teamAName}
              onChange={(event) =>
                setValues((current) => ({ ...current, teamAName: event.target.value }))
              }
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Team B name
            <input
              value={values.teamBName}
              onChange={(event) =>
                setValues((current) => ({ ...current, teamBName: event.target.value }))
              }
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Team A total
            <output className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-2xl font-black text-neon-yellow">
              {teamTotals.teamATotal}
            </output>
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Team B total
            <output className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-2xl font-black text-neon-yellow">
              {teamTotals.teamBTotal}
            </output>
          </label>
        </div>

        <section className="rounded-lg border border-neon-green/30 bg-black/25 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black uppercase text-stone-50">
                <Users className="h-5 w-5 text-neon-green" aria-hidden="true" />
                Available Today
              </h2>
              <p className="text-sm text-stone-400">
                Select the players available today, then generate two balanced teams or choose them manually.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={selectAllAvailable}>
                Select All
              </Button>
              <Button type="button" variant="ghost" onClick={clearAvailability}>
                Clear All
              </Button>
              <Button
                type="button"
                onClick={autoBalanceTeams}
                disabled={isBalancing || availablePlayerIds.length < 2}
              >
                <Shuffle className="h-4 w-4" aria-hidden="true" />
                Auto-Balance Teams
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={autoBalanceTeams}
                disabled={isBalancing || availablePlayerIds.length < 2}
              >
                Shuffle Again
              </Button>
              <Button type="button" variant="ghost" onClick={clearTeams}>
                Clear Teams
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {players.map((player) => {
              const isAvailable = availablePlayerIds.includes(player.id);

              return (
                <label
                  key={`available-${player.id}`}
                  className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-stone-100 hover:bg-white/10"
                >
                  <span>{player.name}</span>
                  <input
                    type="checkbox"
                    checked={isAvailable}
                    onChange={(event) =>
                      toggleAvailability(player.id, event.target.checked)
                    }
                    className="h-5 w-5 accent-neon-yellow"
                  />
                </label>
              );
            })}
          </div>

          {availablePlayerIds.length % 2 === 1 && availablePlayerIds.length > 1 ? (
            <p className="mt-3 rounded-md border border-neon-yellow/30 bg-neon-yellow/10 p-3 text-sm font-bold text-yellow-100">
              An odd number of players is available, so one team has one extra player.
            </p>
          ) : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {(["A", "B"] as const).map((team) => {
            const source = team === "A" ? teamA : teamB;
            const other = team === "A" ? teamB : teamA;

            return (
              <fieldset
                key={team}
                className="rounded-lg border border-white/12 bg-black/20 p-4"
              >
                <legend className="px-1 text-sm font-black uppercase text-neon-yellow">
                  Team {team} players
                </legend>
                <div className="mt-3 grid gap-2">
                  {players.map((player) => {
                    const selected = source.includes(player.id);
                    const isAvailable = availablePlayerIds.includes(player.id);
                    const disabled = !isAvailable || other.includes(player.id);

                    return (
                      <label
                        key={`${team}-${player.id}`}
                        className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-stone-100 hover:bg-white/10 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45"
                      >
                        <span>{player.name}</span>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={() => togglePlayer(team, player.id)}
                          className="h-5 w-5 accent-neon-yellow"
                        />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <label className="grid gap-2 text-sm font-bold text-stone-200">
          Result
          <select
            value={values.winner}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                winner: event.target.value as MockMatchFormValues["winner"]
              }))
            }
            className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
          >
            <option value="">Not selected</option>
            <option value="A">Team A won</option>
            <option value="B">Team B won</option>
            <option value="tie">Tie / no result</option>
          </select>
        </label>

        <section className="rounded-lg border border-neon-cyan/30 bg-black/25 p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-black uppercase text-stone-50">
                Completed Bowling Overs
              </h2>
              <p className="text-sm text-stone-400">
                One row per completed over. No ball-by-ball scoring required.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={addBowlingOver}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Over
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            {bowlingOvers.length === 0 ? (
              <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm font-bold text-stone-300">
                No bowling overs entered yet.
              </p>
            ) : null}

            {bowlingOvers.map((over, index) => (
              <div
                key={over.id}
                className="grid gap-3 rounded-md border border-white/10 bg-white/5 p-3 md:grid-cols-[1.3fr_0.7fr_0.7fr_auto_auto]"
              >
                <label className="grid gap-1 text-xs font-black uppercase text-stone-300">
                  Bowler
                  <select
                    value={over.bowlerId}
                    onChange={(event) =>
                      updateBowlingOver(over.id, { bowlerId: event.target.value })
                    }
                    className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
                  >
                    <option value="">Select bowler</option>
                    {activePlayers.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-black uppercase text-stone-300">
                  Runs
                  <input
                    min={0}
                    type="number"
                    value={over.runsConceded}
                    onChange={(event) =>
                      updateBowlingOver(over.id, {
                        runsConceded: sanitizeRuns(event.target.value)
                      })
                    }
                    className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
                  />
                </label>
                <label className="grid gap-1 text-xs font-black uppercase text-stone-300">
                  Wickets
                  <input
                    min={0}
                    type="number"
                    value={over.wickets}
                    onChange={(event) =>
                      updateBowlingOver(over.id, {
                        wickets: sanitizeRuns(event.target.value)
                      })
                    }
                    className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
                  />
                </label>
                <label className="flex items-center gap-2 self-end rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs font-black uppercase text-stone-200">
                  <input
                    type="checkbox"
                    checked={over.maiden}
                    onChange={(event) =>
                      updateBowlingOver(over.id, { maiden: event.target.checked })
                    }
                    className="h-4 w-4 accent-neon-yellow"
                  />
                  Maiden
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  className="self-end px-3"
                  aria-label={`Remove over ${index + 1}`}
                  onClick={() => removeBowlingOver(over.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-neon-yellow/30 bg-black/25 p-4">
          <h2 className="text-xl font-black uppercase text-stone-50">
            Player Match Records
          </h2>
          <p className="text-sm text-stone-400">
            Fast live entry: innings totals plus manually selected special events.
          </p>

          <div className="mt-4 grid gap-4">
            {performanceList.length === 0 ? (
              <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm font-bold text-stone-300">
                Select team players to enter their scorecard records.
              </p>
            ) : null}

            {performanceList.map((performance) => {
              const player = players.find((candidate) => candidate.id === performance.playerId);

              if (!player) return null;

              return (
                <div
                  key={performance.playerId}
                  className="grid gap-4 rounded-lg border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="text-lg font-black uppercase text-stone-50">
                        {player.name}
                      </h3>
                      <p className="text-xs font-bold uppercase text-stone-400">
                        {performance.teamId === "teamA" ? values.teamAName : values.teamBName} - Projected match XP: {calculateMatchXP(performance)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-sm font-bold text-stone-200">
                        <input
                          type="checkbox"
                          checked={performance.played}
                          onChange={(event) =>
                            updatePerformance(performance.playerId, {
                              played: event.target.checked
                            })
                          }
                          className="h-4 w-4 accent-neon-yellow"
                        />
                        Played
                      </label>
                      <label className="flex items-center gap-2 text-sm font-bold text-stone-200">
                        <input
                          type="checkbox"
                          checked={performance.playerOfMatch}
                          onChange={(event) =>
                            updatePerformance(performance.playerId, {
                              playerOfMatch: event.target.checked
                            })
                          }
                          className="h-4 w-4 accent-neon-yellow"
                        />
                        Player of the Match
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-stone-200">
                      <input
                        type="checkbox"
                        checked={performance.didBat}
                        onChange={(event) =>
                          updatePerformance(performance.playerId, {
                            didBat: event.target.checked
                          })
                        }
                        className="h-4 w-4 accent-neon-yellow"
                      />
                      Did bat
                    </label>
                    <label className="grid gap-1 text-xs font-black uppercase text-stone-300">
                      Runs
                      <input
                        min={0}
                        type="number"
                        value={performance.runs}
                        onChange={(event) =>
                          updatePerformance(performance.playerId, {
                            runs: sanitizeRuns(event.target.value)
                          })
                        }
                        className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
                      />
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-stone-200">
                      <input
                        type="checkbox"
                        checked={performance.wasOut}
                        onChange={(event) =>
                          updatePerformance(performance.playerId, {
                            wasOut: event.target.checked
                          })
                        }
                        className="h-4 w-4 accent-neon-yellow"
                      />
                      Out
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="grid gap-1 text-xs font-black uppercase text-stone-300">
                      Hat-tricks
                      <input
                        min={0}
                        type="number"
                        value={performance.hatTricks}
                        onChange={(event) =>
                          updatePerformance(performance.playerId, {
                            hatTricks: sanitizeRuns(event.target.value)
                          })
                        }
                        className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-black uppercase text-stone-300">
                      Catches
                      <input
                        min={0}
                        type="number"
                        value={performance.catches}
                        onChange={(event) =>
                          updatePerformance(performance.playerId, {
                            catches: sanitizeRuns(event.target.value)
                          })
                        }
                        className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-black uppercase text-stone-300">
                      Run-outs
                      <input
                        min={0}
                        type="number"
                        value={performance.runOuts}
                        onChange={(event) =>
                          updatePerformance(performance.playerId, {
                            runOuts: sanitizeRuns(event.target.value)
                          })
                        }
                        className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <label className="grid gap-2 text-sm font-bold text-stone-200">
          Notes
          <textarea
            rows={4}
            value={values.notes}
            onChange={(event) =>
              setValues((current) => ({ ...current, notes: event.target.value }))
            }
            className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan"
          />
        </label>

        {duplicatePlayers.length > 0 ? (
          <div className="rounded-md border border-neon-red/50 bg-neon-red/10 p-3 text-sm font-bold text-red-100">
            A player cannot be selected for both teams.
          </div>
        ) : null}

        <div className="rounded-md border border-white/12 bg-white/5 p-3 text-sm text-stone-300">
          {message}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => validateAndSetStatus("draft")}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Save Draft
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => validateAndSetStatus("submitted")}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Submit for Review
          </Button>
          <Button type="button" variant="ghost" onClick={resetForm}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
        </div>
      </form>
    </Card>
  );
}

function didTeamWin(
  playerId: string,
  winner: MockMatchFormValues["winner"],
  teamA: string[],
  teamB: string[]
) {
  if (winner === "A") return teamA.includes(playerId);
  if (winner === "B") return teamB.includes(playerId);
  return false;
}
