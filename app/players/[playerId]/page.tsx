import { notFound } from "next/navigation";
import { CareerPlayerProfile } from "@/components/players/CareerPlayerProfile";
import { activePlayers, getPlayerBySlug } from "@/lib/data/players";

export function generateStaticParams() {
  return activePlayers.map((player) => ({
    playerId: player.slug
  }));
}

export default async function PlayerProfilePage({
  params
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId: playerSlug } = await params;
  const player = getPlayerBySlug(playerSlug);

  if (!player) {
    notFound();
  }

  return <CareerPlayerProfile player={player} players={activePlayers} />;
}
