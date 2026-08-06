import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterGalleryPhotos,
  formatGalleryFileSize,
  getFeaturedGalleryPhoto,
  getGalleryPhotoAlt,
  sortGalleryPhotos,
  validateGalleryFile,
  type GalleryPhoto
} from "../lib/gallery";

const galleryPageSource = () => readFileSync("app/gallery/page.tsx", "utf8");
const galleryFeatureSource = () =>
  readFileSync("components/gallery/GalleryFeature.tsx", "utf8");
const galleryRepositorySource = () =>
  readFileSync("lib/gallery-repository.ts", "utf8");
const galleryImageSource = () => readFileSync("lib/gallery-image.ts", "utf8");
const galleryTypesSource = () => readFileSync("lib/gallery.ts", "utf8");
const cssSource = () => readFileSync("app/globals.css", "utf8");
const packageSource = () => readFileSync("package.json", "utf8");

function photo(overrides: Partial<GalleryPhoto>): GalleryPhoto {
  return {
    id: "photo",
    caption: "",
    category: "group",
    uploadedAt: "2026-08-06T10:00:00.000Z",
    mimeType: "image/jpeg",
    isFeatured: false,
    imageSource: {
      kind: "object-url",
      blobId: "blob",
      url: "blob:test"
    },
    ...overrides
  };
}

test("Gallery page replaces the placeholder with the complete Gallery feature", () => {
  const page = galleryPageSource();
  const feature = galleryFeatureSource();

  assert.match(page, /<GalleryFeature \/>/);
  assert.match(feature, /OUR GULLY MOMENTS/);
  assert.match(feature, /Cricket, friendship and unforgettable Prague days\./);
  assert.match(feature, /NO MEMORIES ADDED YET/);
  assert.match(feature, /The first Gully moment is waiting to be shared\./);
  assert.match(feature, /GallerySkeletons/);
  assert.doesNotMatch(page + feature, /GALLERY COMING LATER|Gallery coming later|Photos and shareable result cards will be added/);
});

test("Gallery repository boundary is local IndexedDB now and Supabase-ready later", () => {
  const types = galleryTypesSource();
  const repository = galleryRepositorySource();

  assert.match(types, /type GalleryCategory/);
  assert.match(types, /type GalleryPhoto/);
  assert.match(types, /type GalleryRepository/);
  assert.match(types, /uploadPhotos\(input: GalleryUploadInput\[\]\): Promise<GalleryPhoto\[\]>/);
  assert.match(repository, /GALLERY_DATABASE_NAME = "gully-legends-gallery"/);
  assert.match(repository, /GALLERY_PHOTO_STORE = "galleryPhotos"/);
  assert.match(repository, /GALLERY_BLOB_STORE = "galleryPhotoBlobs"/);
  assert.match(repository, /indexedDB\.open\(GALLERY_DATABASE_NAME,\s*1\)/);
  assert.match(repository, /class LocalGalleryRepository implements GalleryRepository/);
  assert.match(repository, /listPhotos\(\): Promise<GalleryPhoto\[\]>/);
  assert.match(repository, /deletePhoto\(id: GalleryPhotoId\): Promise<void>/);
  assert.match(repository, /setFeaturedPhoto\(id: GalleryPhotoId\)/);
  assert.match(repository, /NEXT_PUBLIC_GALLERY_STORAGE_MODE/);
  assert.match(repository, /SupabaseGalleryRepository/);
  assert.match(repository, /gallery_photos/);
  assert.doesNotMatch(repository, /localStorage\.setItem/);
  assert.doesNotMatch(repository, /base64/);
  assert.doesNotMatch(repository, /public\/gallery|public\/uploads|public\/images/);
});

test("Gallery file validation filtering sorting and featured fallback work", () => {
  const newest = photo({
    id: "newest",
    category: "match-day",
    takenOn: "2026-08-08",
    uploadedAt: "2026-08-06T10:00:00.000Z"
  });
  const older = photo({
    id: "older",
    category: "celebration",
    takenOn: "2026-08-01",
    uploadedAt: "2026-08-07T10:00:00.000Z"
  });
  const featured = photo({
    id: "featured",
    category: "group",
    takenOn: "2026-08-03",
    isFeatured: true
  });

  assert.deepEqual(validateGalleryFile({ name: "photo.jpg", size: 1200, type: "image/jpeg" }), { ok: true });
  assert.deepEqual(validateGalleryFile({ name: "photo.webp", size: 1200, type: "image/webp" }), { ok: true });
  assert.equal(
    validateGalleryFile({ name: "holiday-video.mp4", size: 1200, type: "video/mp4" }).ok,
    false
  );
  assert.equal(
    validateGalleryFile({ name: "huge.png", size: 21 * 1024 * 1024, type: "image/png" }).ok,
    false
  );
  assert.equal(formatGalleryFileSize(1024), "1 KB");
  assert.deepEqual(sortGalleryPhotos([older, newest]).map((item) => item.id), ["newest", "older"]);
  assert.deepEqual(filterGalleryPhotos([older, newest], "match-day").map((item) => item.id), ["newest"]);
  assert.deepEqual(filterGalleryPhotos([older, newest], "all").map((item) => item.id), ["older", "newest"]);
  assert.equal(getFeaturedGalleryPhoto([older, newest])?.id, "newest");
  assert.equal(getFeaturedGalleryPhoto([older, featured, newest])?.id, "featured");
  assert.equal(getGalleryPhotoAlt(photo({ caption: "Team at CZU" })), "Team at CZU");
});

test("Gallery upload workflow uses real file input review optimisation and progress states", () => {
  const feature = galleryFeatureSource();
  const image = galleryImageSource();

  assert.match(feature, /type="file"/);
  assert.match(feature, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(feature, /multiple/);
  assert.match(feature, /Drag photos here/);
  assert.match(feature, /Browse Device/);
  assert.match(feature, /validateGalleryFile\(file\)/);
  assert.match(feature, /removeDraft/);
  assert.match(feature, /Upload \{uploadableCount\}/);
  assert.match(feature, /"READY" \| "OPTIMISING" \| "UPLOADING" \| "COMPLETE" \| "FAILED"/);
  assert.match(feature, /galleryRepository\.uploadPhotos/);
  assert.match(feature, /URL\.createObjectURL\(file\)/);
  assert.match(feature, /URL\.revokeObjectURL/);
  assert.match(feature, /role="alert"/);
  assert.match(image, /GALLERY_IMAGE_LONG_EDGE/);
  assert.match(image, /GALLERY_IMAGE_QUALITY/);
  assert.match(image, /canvas\.toBlob/);
  assert.match(image, /buildGalleryUploadInput/);
});

test("Gallery featured grid lightbox edit and delete flows are wired", () => {
  const feature = galleryFeatureSource();
  const css = cssSource();

  assert.match(feature, /FeaturedMemory/);
  assert.match(feature, /getFeaturedGalleryPhoto/);
  assert.match(feature, /setFeaturedPhoto\(photo\.id\)/);
  assert.match(feature, /GalleryFilters/);
  assert.match(feature, /filterGalleryPhotos/);
  assert.match(feature, /View Memory/);
  assert.match(feature, /GalleryLightbox/);
  assert.match(feature, /ArrowLeft|ArrowRight/);
  assert.match(feature, /event\.key === "ArrowLeft"/);
  assert.match(feature, /event\.key === "ArrowRight"/);
  assert.match(feature, /event\.key === "Escape"/);
  assert.match(feature, /document\.body\.style\.overflow = "hidden"/);
  assert.match(feature, /returnFocusRef/);
  assert.match(feature, /EditDialog/);
  assert.match(feature, /galleryRepository\.updatePhoto/);
  assert.match(feature, /DELETE THIS MEMORY\?/);
  assert.match(feature, /galleryRepository\.deletePhoto\(photo\.id\)/);
  assert.match(feature, /View Match Scorecard/);
  assert.match(css, /\.gallery-grid\s*{[\s\S]*?repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*?\.gallery-grid\s*{[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*520px\)[\s\S]*?\.gallery-grid,[\s\S]*?grid-template-columns:\s*1fr/);
});

test("Gallery admin controls are hidden until local admin mode is active", () => {
  const feature = galleryFeatureSource();

  assert.match(feature, /useGalleryAdminMode/);
  assert.match(feature, /gully-legends-admin-mode/);
  assert.match(feature, /requestedAdminMode === "1"/);
  assert.match(feature, /\{isAdmin \? \(/);
  assert.match(feature, /Add Photos/);
  assert.match(feature, /Edit Details/);
  assert.match(feature, /Set As Featured/);
  assert.match(feature, /Delete Photo/);
});

test("Gallery validation is included in the project test command", () => {
  assert.match(packageSource(), /gallery\.test\.js/);
});
