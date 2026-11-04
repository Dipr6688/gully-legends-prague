export const DEFAULT_VENUE_ID = "open-field" as const;

export const VENUE_IDS = [DEFAULT_VENUE_ID, "indoor-dome"] as const;

export type VenueId = (typeof VENUE_IDS)[number];
export type VenueTheme = "outdoor" | "indoor";

export type VenueDefinition = {
  id: VenueId;
  name: string;
  locationHeading: string;
  subtitle: string;
  backgroundAsset: string;
  theme: VenueTheme;
};

export const VENUES: Record<VenueId, VenueDefinition> = {
  "open-field": {
    id: "open-field",
    name: "Open Field",
    locationHeading: "ČZU Gully Arena",
    subtitle: "Open Field, Prague",
    backgroundAsset: "/backgrounds/prague-gully-arena.png",
    theme: "outdoor"
  },
  "indoor-dome": {
    id: "indoor-dome",
    name: "The Dome",
    locationHeading: "The Dome",
    subtitle: "Indoor Court, Prague",
    backgroundAsset: "/venue-backgrounds/the-dome.jpg",
    theme: "indoor"
  }
};

export function isVenueId(value: unknown): value is VenueId {
  return typeof value === "string" && VENUE_IDS.includes(value as VenueId);
}

export function resolveVenueId(value: unknown): VenueId {
  return isVenueId(value) ? value : DEFAULT_VENUE_ID;
}

export function getVenueDefinition(value: unknown): VenueDefinition {
  return VENUES[resolveVenueId(value)];
}

export function getMatchVenueId(match: { venueId?: unknown } | null | undefined): VenueId {
  return resolveVenueId(match?.venueId);
}

export function getMatchVenueDefinition(
  match: { venueId?: unknown } | null | undefined
): VenueDefinition {
  return getVenueDefinition(getMatchVenueId(match));
}
