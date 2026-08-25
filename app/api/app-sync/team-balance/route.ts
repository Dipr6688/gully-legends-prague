import { NextResponse } from "next/server";
import { getBearerAdminSession } from "@/lib/app-sync/bearer";
import { balanceExclusiveTeams } from "@/server/team-balancing";

export async function POST(request: Request) {
  const auth = await getBearerAdminSession(request);

  if (!auth) {
    return NextResponse.json(
      { error: "ADMIN BEARER TOKEN REQUIRED" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    playerIds?: unknown;
    sharedPlayerId?: unknown;
  } | null;

  if (!body || !Array.isArray(body.playerIds)) {
    return NextResponse.json(
      { error: "Select players before balancing teams." },
      { status: 400 }
    );
  }

  if (!body.playerIds.every((playerId): playerId is string => typeof playerId === "string")) {
    return NextResponse.json(
      { error: "Selected players must be active roster players." },
      { status: 400 }
    );
  }

  const sharedPlayerId =
    typeof body.sharedPlayerId === "string" && body.sharedPlayerId.length > 0
      ? body.sharedPlayerId
      : null;
  const result = balanceExclusiveTeams(body.playerIds, sharedPlayerId);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    teamAPlayerIds: result.teamAPlayerIds,
    teamBPlayerIds: result.teamBPlayerIds,
    sharedPlayerId: result.sharedPlayerId
  });
}
