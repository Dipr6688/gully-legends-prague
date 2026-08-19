import { NextResponse } from "next/server";
import { balanceTeams } from "@/server/team-balancing";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    availablePlayerIds?: unknown;
    sharedPlayerId?: unknown;
  };

  if (!Array.isArray(body.availablePlayerIds)) {
    return NextResponse.json(
      { error: "Select available players before balancing teams." },
      { status: 400 }
    );
  }

  const availablePlayerIds = body.availablePlayerIds.filter(
    (playerId): playerId is string => typeof playerId === "string"
  );

  const sharedPlayerId =
    typeof body.sharedPlayerId === "string" && body.sharedPlayerId.length > 0
      ? body.sharedPlayerId
      : null;

  const result = balanceTeams(availablePlayerIds, sharedPlayerId);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
