import type { CSSProperties, ReactNode } from "react";
import { getVenueDefinition, type VenueId } from "@/lib/venues";

export function VenuePageBackground({
  venueId,
  children
}: {
  venueId: VenueId;
  children: ReactNode;
}) {
  const venue = getVenueDefinition(venueId);

  return (
    <div
      className="venue-page-background"
      data-venue-theme={venue.theme}
      style={
        {
          "--venue-page-background": `url("${venue.backgroundAsset}")`
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
