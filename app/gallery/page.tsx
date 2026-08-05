import { Camera } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Card>
        <div className="flex items-center gap-3">
          <Camera className="h-7 w-7 text-neon-yellow" aria-hidden="true" />
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">Memories</p>
            <h1 className="font-display text-5xl uppercase comic-title">Gallery</h1>
          </div>
        </div>
        <div className="mt-6">
          <EmptyState title="Gallery coming later">
            Photos and shareable result cards will be added after the core match
            workflow is ready.
          </EmptyState>
        </div>
      </Card>
    </div>
  );
}
