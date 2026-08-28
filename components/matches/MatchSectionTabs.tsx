import Link from "next/link";
import { cn } from "@/lib/utils";

type MatchSectionTab = "matches" | "diary";

const tabs: Array<{ id: MatchSectionTab; label: string; href: string }> = [
  { id: "matches", label: "MATCHES", href: "/matches" },
  { id: "diary", label: "MATCH DIARY", href: "/match-diary" }
];

export function MatchSectionTabs({ active }: { active: MatchSectionTab }) {
  return (
    <nav className="matches-section-tabs" aria-label="Matches section">
      {tabs.map((tab) => {
        const isActive = tab.id === active;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn("matches-section-tab", isActive && "is-active")}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
