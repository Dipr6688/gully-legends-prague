import { NextResponse } from "next/server";
import { validateMatchOnServer } from "@/server/match-validation";
import type { MatchValidationInput } from "@/lib/match-records";

export async function POST(request: Request) {
  const body = (await request.json()) as MatchValidationInput;
  const result = validateMatchOnServer(body);

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
