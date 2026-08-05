import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
      <Card>
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-neon-yellow" aria-hidden="true" />
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">Admin access</p>
            <h1 className="font-display text-5xl uppercase comic-title">Login</h1>
          </div>
        </div>
        <div className="mt-6">
          <EmptyState title="No authentication in Phase 1">
            Supabase Auth and invitation-only administrator access are planned
            for a later phase.
          </EmptyState>
        </div>
      </Card>
    </div>
  );
}
