"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { VENUE_IDS, VENUES, type VenueId } from "@/lib/venues";

export function CurrentVenueControl({ currentVenueId }: { currentVenueId: VenueId }) {
  const router = useRouter();
  const [selectedVenueId, setSelectedVenueId] = useState<VenueId>(currentVenueId);
  const [appliedVenueId, setAppliedVenueId] = useState<VenueId>(currentVenueId);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveCurrentVenue() {
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/current-venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: selectedVenueId })
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message ?? "CURRENT VENUE COULD NOT BE SAVED");
      }

      setAppliedVenueId(selectedVenueId);
      setMessage("Current venue updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CURRENT VENUE COULD NOT BE SAVED");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="admin-control-card admin-venue-control">
      <div>
        <MapPin aria-hidden="true" />
        <h2>CURRENT VENUE</h2>
      </div>
      <div className="admin-venue-options" role="radiogroup" aria-label="Current venue">
        {VENUE_IDS.map((venueId) => {
          const venue = VENUES[venueId];
          const selected = selectedVenueId === venueId;

          return (
            <button
              key={venueId}
              type="button"
              role="radio"
              aria-checked={selected}
              className={selected ? "admin-venue-option is-selected" : "admin-venue-option"}
              onClick={() => setSelectedVenueId(venueId)}
            >
              <strong>{venue.name}</strong>
              <span>{venue.locationHeading}</span>
              <small>{venue.subtitle}</small>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="neon-button admin-venue-save"
        onClick={saveCurrentVenue}
        disabled={isSaving || selectedVenueId === appliedVenueId}
      >
        {isSaving ? "SAVING..." : "APPLY CURRENT VENUE"}
      </button>
      {message ? <p className="admin-venue-message" role="status">{message}</p> : null}
    </section>
  );
}
