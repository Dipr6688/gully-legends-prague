export type AdminMonthlyBeastsResult =
  | {
      ok: true;
      id?: string;
      monthKey?: string;
      version?: number;
      isDemo?: boolean;
      demoMatchesRemoved?: number;
      demoProgressionsRemoved?: number;
      demoCrownsRemoved?: number;
      demoGalleryRecordsRemoved?: number;
      careerRowsRebuilt?: number;
      realMatchesPreserved?: number;
    }
  | {
      ok: false;
      message: string;
      code: string;
    };

async function postAdminMonthlyBeastsAction(
  url: string,
  body: Record<string, unknown>
): Promise<AdminMonthlyBeastsResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = (await response.json().catch(() => null)) as AdminMonthlyBeastsResult | null;

  if (result && "ok" in result) return result;

  return {
    ok: false,
    message: "ACTION FAILED",
    code: response.ok ? "invalid_response" : "request_failed"
  };
}

export function crownSupabaseMonthlyBeasts(monthKey: string) {
  return postAdminMonthlyBeastsAction("/api/admin/monthly-beasts/crown", {
    monthKey
  });
}

export function reopenSupabaseMonthlyBeasts(monthKey: string) {
  return postAdminMonthlyBeastsAction("/api/admin/monthly-beasts/reopen", {
    monthKey
  });
}

export function resetSupabaseDemoData(confirmation: string) {
  return postAdminMonthlyBeastsAction("/api/admin/demo-data/reset", {
    confirmation
  });
}
