import { MatchScorecard } from "@/components/matches/MatchScorecard";

export default async function MatchScorecardPage({
  params
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  return <MatchScorecard matchId={matchId} />;
}
