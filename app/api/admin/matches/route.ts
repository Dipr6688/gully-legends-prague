import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { validateMatchOnServer } from "@/server/match-validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SupabaseAdminMatchWriteRepository,
  SupabaseMatchWriteError
} from "@/lib/supabase/match-write-repository";
import type { MatchRecord } from "@/lib/types/match";
import type { MatchValidationInput, MatchValidationStage } from "@/lib/match-records";

type SaveMatchRequest = {
  operation: "save";
  match: MatchRecord;
  expectedUpdatedAt?: string | null;
};

type DeleteMatchRequest = {
  operation: "delete";
  matchId: string;
  expectedUpdatedAt?: string | null;
};

type MatchWriteRequest = SaveMatchRequest | DeleteMatchRequest;

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
    typeof value.status === "string" &&
    isRecord(value.teams) &&
    isRecord(value.innings) &&
    isRecord(value.result)
  );
}

function isMatchWriteRequest(value: unknown): value is MatchWriteRequest {
  if (!isRecord(value) || typeof value.operation !== "string") return false;

  if (value.operation === "save") {
    return isMatchRecord(value.match);
  }

  return value.operation === "delete" && typeof value.matchId === "string";
}

function revalidateMatchPages(matchId: string) {
  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);
}

function getValidationStage(match: MatchRecord): MatchValidationStage {
  if (match.status === "in_progress") return "start";
  if (match.status === "finalised") return "finalise";
  if (match.status === "abandoned" || match.status === "cancelled") return "schedule";

  return "draft";
}

function getAvailablePlayerIds(match: MatchRecord): string[] {
  return Array.from(
    new Set([
      ...match.teams.teamA.playerIds,
      ...match.teams.teamB.playerIds,
      match.sharedPlayerId ?? "",
      ...(match.fieldingHelperIds ?? [])
    ].filter(Boolean))
  );
}

function validationInputFromMatch(match: MatchRecord): MatchValidationInput {
  return {
    matchDate: match.matchDate,
    matchNumber: match.matchNumber ?? null,
    startTime: match.startTime,
    matchName: match.matchName,
    teamAName: match.teams.teamA.teamName,
    teamBName: match.teams.teamB.teamName,
    status: match.status,
    stage: getValidationStage(match),
    scheduledOversPerInnings: match.scheduledOversPerInnings,
    battingMode: match.battingMode ?? match.quickScoring?.battingMode ?? "two_batter",
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
    fieldingHelperIds: match.fieldingHelperIds ?? [],
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

function writeErrorResponse(error: unknown) {
  if (error instanceof SupabaseMatchWriteError) {
    const status =
      error.code === "live_match_conflict" || error.code === "stale_record"
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
        code: error.code,
        conflictMatchId: error.conflictMatchId ?? null
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message: "COULD NOT SAVE MATCH",
      code: "write_failed"
    },
    { status: 500 }
  );
}

async function getAdminWriteRepository() {
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
    repository: new SupabaseAdminMatchWriteRepository(supabase, data.user.id)
  };
}

export async function POST(request: Request) {
  const auth = await getAdminWriteRepository();

  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as unknown;

  if (!isMatchWriteRequest(body)) {
    return NextResponse.json(
      {
        ok: false,
        message: "COULD NOT SAVE MATCH",
        code: "invalid_request"
      },
      { status: 400 }
    );
  }

  try {
    if (body.operation === "save") {
      const validation = validateMatchOnServer(validationInputFromMatch(body.match));

      if (!validation.ok) {
        return NextResponse.json(
          {
            ok: false,
            message: validation.errors[0] ?? "COULD NOT SAVE MATCH",
            code: "validation_failed"
          },
          { status: 400 }
        );
      }
    }

    const result =
      body.operation === "save"
        ? await auth.repository.saveMatch({
            match: body.match,
            expectedUpdatedAt: body.expectedUpdatedAt
          })
        : await auth.repository.softDeleteScheduledMatch({
            matchId: body.matchId,
            expectedUpdatedAt: body.expectedUpdatedAt
          });

    revalidateMatchPages(result.matchId);

    return NextResponse.json({
      ok: true,
      matchId: result.matchId,
      updatedAt: result.updatedAt
    });
  } catch (error) {
    return writeErrorResponse(error);
  }
}
