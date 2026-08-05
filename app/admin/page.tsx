import { Crown } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Card>
        <div className="flex items-center gap-3">
          <Crown className="h-8 w-8 text-neon-yellow" aria-hidden="true" />
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">Control room</p>
            <h1 className="font-display text-5xl uppercase comic-title">Admin</h1>
          </div>
        </div>
        <div className="mt-6">
          <EmptyState title="Admin tools are mocked for Phase 1">
            Match creation is available as a local mock interface. Authentication,
            roles, audit logs, and shared database writes are intentionally not
            connected yet.
          </EmptyState>
        </div>
        <div className="mt-5">
          <LinkButton href="/matches/new">Open Match Entry</LinkButton>
        </div>
      </Card>
    </div>
  );
}
