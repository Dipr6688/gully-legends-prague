import { cn } from "@/lib/utils";

const colorClasses = {
  batting: "bg-neon-green",
  bowling: "bg-neon-cyan",
  fielding: "bg-neon-violet"
};

export function RatingBar({
  label,
  value,
  type
}: {
  label: string;
  value: number;
  type: keyof typeof colorClasses;
}) {
  return (
    <div className="space-y-1">
      <div className="stat-label flex items-center justify-between gap-3 text-sm font-black uppercase">
        <span className="text-stone-200">{label}</span>
        <span className="data-number tabular-nums text-stone-300">{value}/100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/10">
        <div
          className={cn("h-full rounded-full", colorClasses[type])}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
