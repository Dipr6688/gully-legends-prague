import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { isValidMonthKey } from "@/lib/monthly-beasts";
import {
  buildCrownMonthlyBeastsPlan
} from "@/lib/supabase/monthly-beast-write-plans";
import {
  SupabaseMonthlyBeastWriteError,
  SupabaseMonthlyBeastWriteRepository
} from "@/lib/supabase/monthly-beast-write-repository";
import {
  SupabaseMatchRepository,
  SupabaseMonthlyBeastCrownRepository
} from "@/lib/supabase/read-repositories";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CrownRequest = {
  monthKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCrownRequest(value: unknown): value is CrownRequest {
  return isRecord(value) && typeof value.monthKey === "string";
}

function errorResponse(error: unknown) {
  if (error instanceof SupabaseMonthlyBeastWriteError) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error.code === "active_crown"
            ? "THIS MONTH HAS ALREADY BEEN CROWNED"
            : "COULD NOT CROWN MONTHLY BEASTS",
        code: error.code
      },
      { status: error.code === "active_crown" ? 409 : 500 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message: "COULD NOT CROWN MONTHLY BEASTS",
      code: "crown_failed"
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

export async function POST(request: Request) {
  const auth = await getAdminClient();

  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as unknown;

  if (!isCrownRequest(body) || !isValidMonthKey(body.monthKey)) {
    return NextResponse.json(
      {
        ok: false,
        message: "COULD NOT CROWN MONTHLY BEASTS",
        code: "invalid_request"
      },
      { status: 400 }
    );
  }

  try {
    const matchRepository = new SupabaseMatchRepository(auth.supabase);
    const crownReadRepository = new SupabaseMonthlyBeastCrownRepository(auth.supabase);
    const crownWriteRepository = new SupabaseMonthlyBeastWriteRepository(auth.supabase);
    const [matchRows, crownRows] = await Promise.all([
      matchRepository.getMatches(),
      crownReadRepository.getCrowns()
    ]);
    const plan = buildCrownMonthlyBeastsPlan({
      monthKey: body.monthKey,
      matchRows,
      existingCrowns: crownRows
    });
    const result = await crownWriteRepository.crownMonth(plan);

    revalidatePath("/");
    revalidatePath("/monthly-beasts");
    revalidatePath("/admin");

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
