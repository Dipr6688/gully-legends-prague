import { NextResponse } from "next/server";
import { balanceTeams } from "@/server/team-balancing";

export async function POST(request: Request) {
  const body = (await request.json()) as { availablePlayerIds?: unknown };

  if (!Array.isArray(body.availablePlayerIds)) {
    return NextResponse.json(
      { error: "Select available players before balancing teams." },
      { status: 400 }
    );
  }

  const availablePlayerIds = body.availablePlayerIds.filter(
    (playerId): playerId is string => typeof playerId === "string"
  );

  return NextResponse.json(balanceTeams(availablePlayerIds));
}
