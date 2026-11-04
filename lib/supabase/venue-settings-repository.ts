import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_VENUE_ID, resolveVenueId, type VenueId } from "@/lib/venues";
import { createSupabaseAnonymousReadClient } from "@/lib/supabase/read-repositories";

type SiteSettingsRow = {
  id: string;
  current_venue_id: string;
  updated_at: string;
};

type SupabaseErrorLike = {
  message: string;
};

export class SupabaseVenueSettingsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getCurrentVenueId(): Promise<VenueId> {
    const { data, error } = (await this.client
      .from("site_settings")
      .select("id, current_venue_id, updated_at")
      .eq("id", "global")
      .maybeSingle()) as unknown as {
      data: SiteSettingsRow | null;
      error: SupabaseErrorLike | null;
    };

    if (error) throw new Error(error.message);

    return resolveVenueId(data?.current_venue_id ?? DEFAULT_VENUE_ID);
  }

  async setCurrentVenueId(venueId: VenueId, userId: string): Promise<VenueId> {
    const { data, error } = (await this.client
      .from("site_settings")
      .upsert(
        {
          id: "global",
          current_venue_id: venueId,
          updated_by: userId
        },
        { onConflict: "id" }
      )
      .select("id, current_venue_id, updated_at")
      .single()) as unknown as {
      data: SiteSettingsRow | null;
      error: SupabaseErrorLike | null;
    };

    if (error || !data) throw new Error(error?.message ?? "CURRENT VENUE COULD NOT BE SAVED");

    return resolveVenueId(data.current_venue_id);
  }
}

export async function loadPublicCurrentVenueId(): Promise<VenueId> {
  const repository = new SupabaseVenueSettingsRepository(
    createSupabaseAnonymousReadClient()
  );

  return repository.getCurrentVenueId().catch(() => DEFAULT_VENUE_ID);
}
