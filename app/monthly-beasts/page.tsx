import { MonthlyBeastsPanel } from "@/components/dashboard/MonthlyBeastsPanel";
import { Card } from "@/components/ui/Card";

export default function MonthlyBeastsPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-4 py-8 lg:grid-cols-[1fr_320px] lg:px-6">
      <Card>
        <p className="text-xs font-black uppercase text-neon-cyan">Awards</p>
        <h1 className="font-display text-5xl uppercase comic-title">Monthly Beasts</h1>
        <p className="mt-4 max-w-3xl text-stone-300">
          Monthly awards are intentionally empty in Phase 1. They will be
          calculated only from finalised matches after the database and scoring
          phases are implemented.
        </p>
      </Card>
      <MonthlyBeastsPanel />
    </div>
  );
}
