import { GalleryFeature } from "@/components/gallery/GalleryFeature";
import { isCurrentUserAdmin } from "@/lib/admin/auth";

export default async function GalleryPage() {
  const isAdmin = await isCurrentUserAdmin();

  return <GalleryFeature isAdmin={isAdmin} />;
}
