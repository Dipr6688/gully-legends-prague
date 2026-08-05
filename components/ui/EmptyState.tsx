import type { ReactNode } from "react";

export function EmptyState({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-white/18 bg-black/20 p-5 text-sm text-stone-300">
      <p className="font-black uppercase text-stone-100">{title}</p>
      <div className="mt-2 leading-6">{children}</div>
    </div>
  );
}
