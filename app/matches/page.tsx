import { Plus } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function MatchesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Card>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">Archive</p>
            <h1 className="font-display text-5xl uppercase comic-title">Matches</h1>
          </div>
          <LinkButton href="/matches/new">
            <Plus className="h-5 w-5" aria-hidden="true" />
            Create Match
          </LinkButton>
        </div>
        <div className="mt-6">
          <EmptyState title="No finalised matches">
            Match history will appear here after the database and finalisation
            workflow arrive in later phases.
          </EmptyState>
        </div>
      </Card>
    </div>
  );
}
