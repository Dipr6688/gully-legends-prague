import type { MatchRecord } from "@/lib/types/match";

export type AdminMatchWriteResult =
  | {
      ok: true;
      matchId: string;
      updatedAt: string;
    }
  | {
      ok: false;
      message: string;
      code: string;
      conflictMatchId?: string | null;
    };

async function postMatchWrite(body: unknown): Promise<AdminMatchWriteResult> {
  const response = await fetch("/api/admin/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = (await response.json().catch(() => null)) as AdminMatchWriteResult | null;

  if (result && "ok" in result) return result;

  return {
    ok: false,
    message: "COULD NOT SAVE MATCH",
    code: response.ok ? "invalid_response" : "write_failed"
  };
}

export function saveSupabaseAdminMatch({
  match,
  expectedUpdatedAt
}: {
  match: MatchRecord;
  expectedUpdatedAt?: string | null;
}) {
  return postMatchWrite({
    operation: "save",
    match,
    expectedUpdatedAt
  });
}

export function deleteSupabaseAdminDraftMatch({
  matchId,
  expectedUpdatedAt
}: {
  matchId: string;
  expectedUpdatedAt?: string | null;
}) {
  return postMatchWrite({
    operation: "delete",
    matchId,
    expectedUpdatedAt
  });
}
