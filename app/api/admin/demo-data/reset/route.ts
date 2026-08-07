import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { buildResetDemoPlan } from "@/lib/supabase/monthly-beast-write-plans";
import {
  SupabaseMonthlyBeastWriteError,
  SupabaseMonthlyBeastWriteRepository
} from "@/lib/supabase/monthly-beast-write-repository";
import {
  SupabaseCareerStatsRepository,
  SupabaseMatchRepository,
  SupabasePlayerRepository
} from "@/lib/supabase/read-repositories";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const RESET_DEMO_CONFIRMATION_PHRASE = "RESET DEMO";

type ResetRequest = {
  confirmation: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isResetRequest(value: unknown): value is ResetRequest {
  return isRecord(value) && typeof value.confirmation === "string";
}

function errorResponse(error: unknown) {
  if (error instanceof SupabaseMonthlyBeastWriteError) {
    const status = error.code === "stale_reset" ? 409 : 500;

    return NextResponse.json(
      {
        ok: false,
        message:
          error.code === "stale_reset"
            ? "DEMO DATA CHANGED. REFRESH AND TRY AGAIN."
            : "COULD NOT RESET DEMO DATA",
        code: error.code
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message: "COULD NOT RESET DEMO DATA",
      code: "reset_failed"
    },
    { status: 500 }
  );
}

async function getAdminClient() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return {
      response: NextResponse.json(
        {
          ok: false,
          message: "ADMIN LOGIN REQUIRED",
          code: "not_authenticated"
        },
        { status: 401 }
      )
    };
  }

  const isAdmin = await isAdminWithClient(supabase);

  if (!isAdmin) {
    return {
      response: NextResponse.json(
        {
          ok: false,
          message: "ADMIN ACCESS REQUIRED",
          code: "not_admin"
        },
        { status: 403 }
      )
    };
  }

  return { supabase };
}

function revalidateResetPages(playerSlugs: string[]) {
  revalidatePath("/");
  revalidatePath("/players");
  revalidatePath("/matches");
  revalidatePath("/leaderboard");
  revalidatePath("/monthly-beasts");
  revalidatePath("/admin");
  revalidatePath("/admin/supabase-data-check");

  for (const slug of playerSlugs) {
    revalidatePath(`/players/${slug}`);
  }
}

export async function POST(request: Request) {
  const auth = await getAdminClient();

  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as unknown;

  if (!isResetRequest(body) || body.confirmation !== RESET_DEMO_CONFIRMATION_PHRASE) {
    return NextResponse.json(
      {
        ok: false,
        message: "TYPE RESET DEMO TO CONFIRM",
        code: "invalid_confirmation"
      },
      { status: 400 }
    );
  }

  try {
    const matchRepository = new SupabaseMatchRepository(auth.supabase);
    const careerRepository = new SupabaseCareerStatsRepository(auth.supabase);
    const playerRepository = new SupabasePlayerRepository(auth.supabase);
    const writeRepository = new SupabaseMonthlyBeastWriteRepository(auth.supabase);
    const [matchRows, careerRows, playerRows] = await Promise.all([
      matchRepository.getMatches(),
      careerRepository.getCareerStats(),
      playerRepository.getPlayers()
    ]);
    const plan = buildResetDemoPlan({ matchRows, careerRows, playerRows });
    const result = await writeRepository.resetDemoData(plan);

    revalidateResetPages(
      playerRows
        .filter((player) => player.is_active)
        .map((player) => player.slug)
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
