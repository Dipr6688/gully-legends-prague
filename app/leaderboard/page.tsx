import { Suspense } from "react";
import { CareerLeaderboard } from "@/components/leaderboard/CareerLeaderboard";

export default function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-[1480px] px-4 py-8 lg:px-6">
      <Suspense fallback={null}>
        <CareerLeaderboard />
      </Suspense>
    </div>
  );
}
