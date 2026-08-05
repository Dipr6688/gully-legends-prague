import { notFound } from "next/navigation";
import { PlayerProfile } from "@/components/players/PlayerProfile";
import { getPlayerById, players } from "@/lib/data/players";

export function generateStaticParams() {
  return players.map((player) => ({
    playerId: player.id
  }));
}

export default async function PlayerProfilePage({
  params
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const player = getPlayerById(playerId);

  if (!player) {
    notFound();
  }

  return <PlayerProfile player={player} />;
}
