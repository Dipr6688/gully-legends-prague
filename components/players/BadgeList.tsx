export function BadgeList({ titles }: { titles: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {titles.map((title) => (
        <span
          key={title}
          className="rounded-full border border-neon-yellow/35 bg-neon-yellow/10 px-2.5 py-1 text-xs font-bold text-yellow-100"
        >
          {title}
        </span>
      ))}
    </div>
  );
}
