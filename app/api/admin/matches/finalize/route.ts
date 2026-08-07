import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { getPlayerById } from "@/lib/data/players";
import { getMatchMonthKey } from "@/lib/monthly-beasts";
import { isDemoTestMatchPayload } from "@/lib/demo-test-match";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildFinalisationPlan } from "@/lib/supabase/match-finalisation-plan";
import {
  SupabaseMatchFinalisationError,
  SupabaseMatchFinalisationRepository
} from "@/lib/supabase/match-finalisation-repository";
import { validateSupabaseMatchPayload } from "@/lib/admin/supabase-data-check";
import { validateMatchOnServer } from "@/server/match-validation";
import type { MatchRecord } from "@/lib/types/match";
import type { MatchValidationInput } from "@/lib/match-records";

type FinalizeMatchRequest = {
  match: MatchRecord;
  expectedUpdatedAt?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isMatchRecord(value: unknown): value is MatchRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.matchDate === "string" &&
    typeof value.matchName === "string" &&
    typeof value.venue === "string" &&
    value.status === "finalised" &&
    isRecord(value.teams) &&
    isRecord(value.innings) &&
    isRecord(value.result)
  );
}

function isFinalizeMatchRequest(value: unknown): value is FinalizeMatchRequest {
  return isRecord(value) && isMatchRecord(value.match);
}

function getAvailablePlayerIds(match: MatchRecord): string[] {
  return Array.from(
    new Set([
      ...match.teams.teamA.playerIds,
      ...match.teams.teamB.playerIds,
      match.sharedPlayerId ?? ""
    ].filter(Boolean))
  );
}

function validationInputFromFinalMatch(match: MatchRecord): MatchValidationInput {
  return {
    matchDate: match.matchDate,
    matchNumber: match.matchNumber ?? null,
    startTime: match.startTime,
    matchName: match.matchName,
    teamAName: match.teams.teamA.teamName,
    teamBName: match.teams.teamB.teamName,
    status: "finalised",
    stage: "finalise",
    scheduledOversPerInnings: match.scheduledOversPerInnings,
    battingFirstTeamId: match.battingFirstTeamId,
    inningsExtras: {
      teamA: match.innings.first.battingTeamId === "teamA"
        ? match.innings.first.extras
        : match.innings.second.extras,
      teamB: match.innings.first.battingTeamId === "teamB"
        ? match.innings.first.extras
        : match.innings.second.extras
    },
    availablePlayerIds: getAvailablePlayerIds(match),
    teamAPlayerIds: match.teams.teamA.playerIds,
    teamBPlayerIds: match.teams.teamB.playerIds,
    sharedPlayerId: match.sharedPlayerId,
    performances: [
      ...match.teams.teamA.playerPerformances,
      ...match.teams.teamB.playerPerformances
    ],
    bowlingOvers: {
      teamA: match.teams.teamA.bowlingOvers,
      teamB: match.teams.teamB.bowlingOvers
    }
  };
}

function getPlayedPlayerIds(match: MatchRecord): string[] {
  return Array.from(
    new Set(
      (match.finalisedPlayerRecords ?? [])
        .filter((performance) => performance.played)
        .map((performance) => performance.playerId)
    )
  ).sort();
}

function revalidateFinalisationPages(matchId: string, playerIds: string[]) {
  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/leaderboard");
  revalidatePath("/monthly-beasts");

  for (const playerId of playerIds) {
    const player = getPlayerById(playerId);
    revalidatePath(`/players/${player?.slug ?? playerId}`);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof SupabaseMatchFinalisationError) {
    const status =
      error.code === "stale_match" ||
      error.code === "stale_career" ||
      error.code === "active_crown"
        ? 409
        : error.code === "not_allowed"
          ? 403
          : error.code === "not_found"
            ? 404
            : 500;

    return NextResponse.json(
      {
        ok: false,
        message: error.message,
        code: error.code
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message: "COULD NOT FINALISE MATCH",
      code: "finalisation_failed"
    },
    { status: 500 }
  );
}

async function getAdminFinalisationRepository() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return {
      response: NextResponse.json(
        {
          ok: false,
          message: "ADMIN LOGIN REQUIRED",
          code: "not_authenticated"
        },
        { status: 401 }
      )
    };
  }

  const isAdmin = await isAdminWithClient(supabase);

  if (!isAdmin) {
    return {
      response: NextResponse.json(
        {
          ok: false,
          message: "ADMIN ACCESS REQUIRED",
          code: "not_admin"
        },
        { status: 403 }
      )
    };
  }

  return {
    repository: new SupabaseMatchFinalisationRepository(supabase)
  };
}

export async function POST(request: Request) {
  const auth = await getAdminFinalisationRepository();

  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as unknown;

  if (!isFinalizeMatchRequest(body)) {
    return NextResponse.json(
      {
        ok: false,
        message: "COULD NOT FINALISE MATCH",
        code: "invalid_request"
      },
      { status: 400 }
    );
  }

  try {
    const currentRow = await auth.repository.getMatch(body.match.id);

    if (!currentRow || currentRow.deleted_at) {
      throw new SupabaseMatchFinalisationError("COULD NOT FINALISE MATCH", "not_found");
    }

    const currentPayload = validateSupabaseMatchPayload(currentRow);

    if (!currentPayload.match || currentPayload.match.id !== body.match.id) {
      throw new SupabaseMatchFinalisationError("COULD NOT FINALISE MATCH", "validation_failed");
    }

    if (
      currentRow.is_demo &&
      currentRow.status !== "finalised" &&
      !isDemoTestMatchPayload(currentPayload.match)
    ) {
      throw new SupabaseMatchFinalisationError("COULD NOT FINALISE MATCH", "not_allowed");
    }

    const validation = validateMatchOnServer(validationInputFromFinalMatch(body.match));

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: validation.errors[0] ?? "COULD NOT FINALISE MATCH",
          code: "validation_failed"
        },
        { status: 400 }
      );
    }

    const monthKey = getMatchMonthKey(body.match.matchDate);

    if (
      monthKey &&
      currentRow.status !== "finalised" &&
      await auth.repository.hasActiveCrown(monthKey)
    ) {
      throw new SupabaseMatchFinalisationError(
        `${monthKey} HAS ALREADY BEEN CROWNED`,
        "active_crown"
      );
    }

    const playerIds = getPlayedPlayerIds(body.match);
    const [careerRows, existingApplications] = await Promise.all([
      auth.repository.getCareerRows(playerIds),
      auth.repository.getMatchApplications(body.match.id)
    ]);
    const plan = buildFinalisationPlan({
      finalMatch: body.match,
      expectedMatchUpdatedAt: body.expectedUpdatedAt ?? body.match.supabaseUpdatedAt ?? null,
      careerRows,
      existingApplications
    });
    const result = await auth.repository.finalizeAtomically(plan);

    revalidateFinalisationPages(body.match.id, playerIds);

    return NextResponse.json({
      ok: true,
      matchId: result.matchId,
      alreadyApplied: result.alreadyApplied,
      finalisedAt: result.finalisedAt,
      statsAppliedAt: result.statsAppliedAt
    });
  } catch (error) {
    return errorResponse(error);
  }
}
