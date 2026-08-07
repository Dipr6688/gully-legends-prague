import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SupabaseAdminMatchWriteRepository,
  SupabaseMatchWriteError
} from "@/lib/supabase/match-write-repository";

function errorResponse(error: unknown) {
  if (error instanceof SupabaseMatchWriteError) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message,
        code: error.code
      },
      { status: error.code === "not_allowed" ? 403 : 500 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message: "COULD NOT CREATE DEMO TEST MATCH",
      code: "write_failed"
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
    repository: new SupabaseAdminMatchWriteRepository(supabase, data.user.id)
  };
}

export async function POST() {
  const auth = await getAdminRepository();

  if ("response" in auth) return auth.response;

  try {
    const result = await auth.repository.createDemoTestMatch();

    revalidatePath("/");
    revalidatePath("/matches");
    revalidatePath(`/matches/${result.matchId}`);
    revalidatePath("/admin");

    return NextResponse.json({
      ok: true,
      matchId: result.matchId,
      updatedAt: result.updatedAt
    });
  } catch (error) {
    return errorResponse(error);
  }
}
