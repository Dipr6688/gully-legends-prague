import { NextResponse } from "next/server";
import { activePlayers } from "@/lib/data/players";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { loadPublicSupabaseReadData } from "@/lib/supabase/public-read-data";

function rosterFromPlayers(players: typeof activePlayers) {
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    slug: player.slug,
    cardTitle: player.cardTitle,
    role: player.role,
    cardImage: player.cardImage,
    isActive: player.isActive
  }));
}

export async function GET() {
  if (!getSupabasePublicEnv()) {
    return NextResponse.json({
      ok: true,
      source: "local_static_no_supabase",
      players: rosterFromPlayers(activePlayers)
    });
  }

  try {
    const data = await loadPublicSupabaseReadData();

    return NextResponse.json({
      ok: true,
      source: "supabase",
      players: rosterFromPlayers(data.players)
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "roster_unavailable",
        message: "OFFICIAL SUPABASE ROSTER IS UNAVAILABLE"
      },
      { status: 503 }
    );
  }
}
