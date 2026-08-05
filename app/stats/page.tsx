import { Card } from "@/components/ui/Card";

export default function StatsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Card>
        <p className="text-xs font-black uppercase text-neon-cyan">Formula room</p>
        <h1 className="font-display text-5xl uppercase comic-title">Stats</h1>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {["Batting", "Bowling", "Fielding"].map((label) => (
            <div
              key={label}
              className="rounded-lg border border-white/12 bg-black/25 p-4"
            >
              <p className="text-lg font-black uppercase text-neon-yellow">{label}</p>
              <p className="mt-2 text-sm leading-6 text-stone-300">
                Rating starts at 0/100. Calculation logic will be added when
                finalised match data exists.
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
