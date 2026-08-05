import type { ReactNode } from "react";

export function StatPill({
  label,
  value,
  icon
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/12 bg-black/55 px-4 py-3 shadow-xl">
      <div className="flex items-center gap-2 text-[0.68rem] font-bold uppercase text-stone-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-black text-stone-50">{value}</div>
    </div>
  );
}
