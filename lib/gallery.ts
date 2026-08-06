export type GalleryPhotoId = string;

export type GalleryCategory =
  | "match-day"
  | "celebration"
  | "group"
  | "off-field"
  | "other";

export type GalleryImageSource =
  | {
      kind: "object-url";
      url: string;
      blobId: string;
    }
  | {
      kind: "remote";
      url: string;
      storagePath?: string;
    };

export type GalleryPhoto = {
  id: GalleryPhotoId;
  title?: string;
  caption?: string;
  category: GalleryCategory;
  takenOn?: string;
  relatedMatchId?: string | null;
  albumTitle?: string;
  uploadedAt: string;
  uploadedBy?: string | null;
  mimeType: string;
  width?: number;
  height?: number;
  fileSize?: number;
  originalFileName?: string;
  isFeatured: boolean;
  sortOrder?: number;
  imageSource: GalleryImageSource;
};

export type GalleryUploadInput = {
  fileName: string;
  blob: Blob;
  title?: string;
  caption?: string;
  category: GalleryCategory;
  takenOn?: string;
  relatedMatchId?: string | null;
  albumTitle?: string;
  uploadedBy?: string | null;
  mimeType: string;
  width?: number;
  height?: number;
  fileSize?: number;
};

export type GalleryPhotoUpdate = Partial<
  Pick<
    GalleryPhoto,
    | "title"
    | "caption"
    | "category"
    | "takenOn"
    | "relatedMatchId"
    | "albumTitle"
    | "isFeatured"
  >
>;

export type GalleryRepository = {
  listPhotos(): Promise<GalleryPhoto[]>;
  uploadPhotos(input: GalleryUploadInput[]): Promise<GalleryPhoto[]>;
  updatePhoto(
    id: GalleryPhotoId,
    changes: GalleryPhotoUpdate
  ): Promise<GalleryPhoto>;
  deletePhoto(id: GalleryPhotoId): Promise<void>;
  setFeaturedPhoto(id: GalleryPhotoId): Promise<void>;
};

export const GALLERY_CATEGORIES: Array<{
  value: GalleryCategory;
  label: string;
  shortLabel: string;
}> = [
  { value: "match-day", label: "Match Days", shortLabel: "Match Day" },
  { value: "celebration", label: "Celebrations", shortLabel: "Celebration" },
  { value: "group", label: "Group", shortLabel: "Group" },
  { value: "off-field", label: "Off The Field", shortLabel: "Off Field" },
  { value: "other", label: "Other", shortLabel: "Other" }
];

export const GALLERY_ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export const GALLERY_MAX_ORIGINAL_FILE_SIZE = 20 * 1024 * 1024;
export const GALLERY_IMAGE_LONG_EDGE = 2048;
export const GALLERY_IMAGE_QUALITY = 0.85;

export type GalleryFilter = GalleryCategory | "all";

export function getGalleryCategoryLabel(category: GalleryCategory): string {
  return (
    GALLERY_CATEGORIES.find((item) => item.value === category)?.shortLabel ??
    "Other"
  );
}

export function isSupportedGalleryMimeType(mimeType: string): boolean {
  return GALLERY_ACCEPTED_MIME_TYPES.includes(
    mimeType as (typeof GALLERY_ACCEPTED_MIME_TYPES)[number]
  );
}

export function validateGalleryFile(file: Pick<File, "name" | "size" | "type">):
  | { ok: true }
  | { ok: false; message: string } {
  if (!isSupportedGalleryMimeType(file.type)) {
    return {
      ok: false,
      message: `${file.name} is not a supported image.`
    };
  }

  if (file.size > GALLERY_MAX_ORIGINAL_FILE_SIZE) {
    return {
      ok: false,
      message: `${file.name} is larger than the 20 MB safety limit.`
    };
  }

  return { ok: true };
}

export function formatGalleryFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sortGalleryPhotos(photos: GalleryPhoto[]): GalleryPhoto[] {
  return [...photos].sort((left, right) => {
    const leftDate = Date.parse(left.takenOn || left.uploadedAt);
    const rightDate = Date.parse(right.takenOn || right.uploadedAt);

    if (leftDate !== rightDate) return rightDate - leftDate;

    return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  });
}

export function filterGalleryPhotos(
  photos: GalleryPhoto[],
  filter: GalleryFilter
): GalleryPhoto[] {
  if (filter === "all") return photos;

  return photos.filter((photo) => photo.category === filter);
}

export function getFeaturedGalleryPhoto(
  photos: GalleryPhoto[]
): GalleryPhoto | null {
  if (photos.length === 0) return null;

  return photos.find((photo) => photo.isFeatured) ?? sortGalleryPhotos(photos)[0];
}

export function getGalleryPhotoAlt(photo: GalleryPhoto): string {
  return (
    photo.caption?.trim() ||
    photo.title?.trim() ||
    `${getGalleryCategoryLabel(photo.category)} memory from Gully Legends Prague`
  );
}

export function createGalleryPhotoId(): GalleryPhotoId {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `gallery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
