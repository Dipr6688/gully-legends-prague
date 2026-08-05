import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

const rows = [
  ["Most runs", "0"],
  ["Highest score", "0"],
  ["Most wickets", "0"],
  ["Best bowling", "0 wickets"],
  ["Most catches", "0"],
  ["Highest XP", "0"],
  ["Highest level", "0"]
];

export default function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Card>
        <p className="text-xs font-black uppercase text-neon-cyan">All time</p>
        <h1 className="font-display text-5xl uppercase comic-title">Leaderboard</h1>
        <div className="mt-6 overflow-hidden rounded-lg border border-white/12">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/8 text-xs uppercase text-stone-300">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Leader</th>
                <th className="px-4 py-3">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map(([category, value]) => (
                <tr key={category}>
                  <td className="px-4 py-3 font-black uppercase text-stone-100">
                    {category}
                  </td>
                  <td className="px-4 py-3 text-stone-300">Not decided yet</td>
                  <td className="px-4 py-3 font-black text-neon-yellow">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5">
          <EmptyState title="Stats start at zero">
            Only finalised matches will update all-time statistics in future phases.
          </EmptyState>
        </div>
      </Card>
    </div>
  );
}
