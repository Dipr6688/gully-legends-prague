import { Card } from "@/components/ui/Card";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Card>
        <p className="text-xs font-black uppercase text-neon-cyan">Gully data incoming</p>
        <h1 className="font-display text-5xl uppercase comic-title">Warming Up The Scoreboard</h1>
        <p className="mt-3 text-stone-300">
          Shared match records, player powers and beast races are being loaded.
        </p>
      </Card>
    </div>
  );
}
