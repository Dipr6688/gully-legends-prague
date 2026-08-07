import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { isValidMonthKey } from "@/lib/monthly-beasts";
import {
  SupabaseMonthlyBeastWriteError,
  SupabaseMonthlyBeastWriteRepository
} from "@/lib/supabase/monthly-beast-write-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ReopenRequest = {
  monthKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isReopenRequest(value: unknown): value is ReopenRequest {
  return isRecord(value) && typeof value.monthKey === "string";
}

function errorResponse(error: unknown) {
  if (error instanceof SupabaseMonthlyBeastWriteError) {
    const status = error.code === "no_active_crown" ? 404 : 500;

    return NextResponse.json(
      {
        ok: false,
        message:
          error.code === "no_active_crown"
            ? "NO ACTIVE CROWN FOUND"
            : "COULD NOT REOPEN MONTH",
        code: error.code
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message: "COULD NOT REOPEN MONTH",
      code: "reopen_failed"
    },
    { status: 500 }
  );
}

async function getAdminRepository() {
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

  return {
    repository: new SupabaseMonthlyBeastWriteRepository(supabase)
  };
}

export async function POST(request: Request) {
  const auth = await getAdminRepository();

  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as unknown;

  if (!isReopenRequest(body) || !isValidMonthKey(body.monthKey)) {
    return NextResponse.json(
      {
        ok: false,
        message: "COULD NOT REOPEN MONTH",
        code: "invalid_request"
      },
      { status: 400 }
    );
  }

  try {
    const result = await auth.repository.reopenMonth(body.monthKey);

    revalidatePath("/");
    revalidatePath("/monthly-beasts");
    revalidatePath("/admin");

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
