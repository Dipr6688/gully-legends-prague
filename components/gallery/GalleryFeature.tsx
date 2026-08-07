/* eslint-disable @next/next/no-img-element */
"use client";

import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  MoreVertical,
  Star,
  Trash2,
  X
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent
} from "react";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import {
  galleryRepository,
  GALLERY_UPDATED_EVENT
} from "@/lib/gallery-repository";
import {
  buildGalleryUploadInput,
  optimiseGalleryImage
} from "@/lib/gallery-image";
import {
  filterGalleryPhotos,
  formatGalleryFileSize,
  GALLERY_CATEGORIES,
  getFeaturedGalleryPhoto,
  getGalleryCategoryLabel,
  getGalleryPhotoAlt,
  sortGalleryPhotos,
  validateGalleryFile,
  type GalleryCategory,
  type GalleryFilter,
  type GalleryPhoto
} from "@/lib/gallery";

type UploadStatus = "READY" | "OPTIMISING" | "UPLOADING" | "COMPLETE" | "FAILED";

type UploadDraft = {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  status: UploadStatus;
  error?: string;
};

type EditDraft = {
  title: string;
  caption: string;
  category: GalleryCategory;
  takenOn: string;
  relatedMatchId: string;
  albumTitle: string;
  isFeatured: boolean;
};

function useGalleryPhotos() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const photosRef = useRef<GalleryPhoto[]>([]);

  const revokePhotoUrls = useCallback((photoList: GalleryPhoto[]) => {
    photoList.forEach((photo) => {
      if (photo.imageSource.kind === "object-url") {
        URL.revokeObjectURL(photo.imageSource.url);
      }
    });
  }, []);

  const refreshPhotos = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextPhotos = await galleryRepository.listPhotos();
      setPhotos((previousPhotos) => {
        revokePhotoUrls(previousPhotos);
        photosRef.current = nextPhotos;

        return nextPhotos;
      });
    } finally {
      setIsLoading(false);
    }
  }, [revokePhotoUrls]);

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(() => {
      if (isMounted) {
        refreshPhotos();
      }
    });

    window.addEventListener(GALLERY_UPDATED_EVENT, refreshPhotos);

    return () => {
      isMounted = false;
      window.removeEventListener(GALLERY_UPDATED_EVENT, refreshPhotos);
      revokePhotoUrls(photosRef.current);
      photosRef.current = [];
    };
  }, [refreshPhotos, revokePhotoUrls]);

  return { photos, isLoading, refreshPhotos };
}

function GalleryImage({
  photo,
  className
}: {
  photo: GalleryPhoto;
  className: string;
}) {
  const [hasError, setHasError] = useState(!photo.imageSource.url);

  if (hasError) {
    return (
      <div className={`${className} gallery-image-error`} role="img" aria-label={getGalleryPhotoAlt(photo)}>
        <Camera aria-hidden="true" />
        <span>Image unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={photo.imageSource.url}
      alt={getGalleryPhotoAlt(photo)}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

function useDialogKeyboard(onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    firstButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
        previousFocus.focus();
      }
    };
  }, [onClose]);

  return { dialogRef, firstButtonRef };
}

function GalleryHeader({
  photoCount,
  isAdmin,
  onAddPhotos
}: {
  photoCount: number;
  isAdmin: boolean;
  onAddPhotos: () => void;
}) {
  return (
    <section className="gallery-hero">
      <div>
        <p className="gallery-eyebrow">Memories</p>
        <h1 className="comic-title">OUR GULLY MOMENTS</h1>
        <p>Cricket, friendship and unforgettable Prague days.</p>
      </div>
      <div className="gallery-hero-actions">
        <span>{photoCount} {photoCount === 1 ? "MEMORY" : "MEMORIES"}</span>
        {isAdmin ? (
          <button type="button" className="gallery-primary-action" onClick={onAddPhotos}>
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
            Add Photos
          </button>
        ) : null}
      </div>
    </section>
  );
}

function UploadDialog({
  onClose,
  onUploaded
}: {
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { finalisedMatches } = useMatchRepository();
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [takenOn, setTakenOn] = useState("");
  const [category, setCategory] = useState<GalleryCategory>("match-day");
  const [relatedMatchId, setRelatedMatchId] = useState("");
  const [albumTitle, setAlbumTitle] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const draftsRef = useRef<UploadDraft[]>([]);
  const { dialogRef, firstButtonRef } = useDialogKeyboard(onClose);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(
    () => () => {
      draftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
    },
    []
  );

  function addFiles(files: FileList | File[]) {
    const nextErrors: string[] = [];
    const nextDrafts = Array.from(files).flatMap((file) => {
      const validation = validateGalleryFile(file);

      if (!validation.ok) {
        nextErrors.push(validation.message);
        return [];
      }

      return [
        {
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          caption: "",
          status: "READY" as UploadStatus
        }
      ];
    });

    setErrors(nextErrors);
    setDrafts((currentDrafts) => [...currentDrafts, ...nextDrafts]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  function removeDraft(id: string) {
    setDrafts((currentDrafts) => {
      const removed = currentDrafts.find((draft) => draft.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);

      return currentDrafts.filter((draft) => draft.id !== id);
    });
  }

  function updateDraft(id: string, changes: Partial<UploadDraft>) {
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft) =>
        draft.id === id ? { ...draft, ...changes } : draft
      )
    );
  }

  async function uploadDrafts() {
    for (const draft of drafts) {
      if (draft.status === "COMPLETE") continue;

      try {
        updateDraft(draft.id, { status: "OPTIMISING", error: undefined });
        const optimised = await optimiseGalleryImage(draft.file);
        updateDraft(draft.id, { status: "UPLOADING" });
        await galleryRepository.uploadPhotos([
          buildGalleryUploadInput({
            file: draft.file,
            optimised,
            caption: draft.caption,
            category,
            takenOn,
            relatedMatchId: relatedMatchId || null,
            albumTitle
          })
        ]);
        updateDraft(draft.id, { status: "COMPLETE" });
      } catch (error) {
        updateDraft(draft.id, {
          status: "FAILED",
          error: error instanceof Error ? error.message : "Upload failed."
        });
      }
    }

    onUploaded();
  }

  const uploadableCount = drafts.filter((draft) => draft.status !== "COMPLETE").length;

  return (
    <div className="gallery-dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="gallery-dialog gallery-upload-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add gully memories"
      >
        <div className="gallery-dialog-header">
          <div>
            <p className="gallery-eyebrow">Upload</p>
            <h2>ADD GULLY MEMORIES</h2>
          </div>
          <button ref={firstButtonRef} type="button" onClick={onClose} aria-label="Close upload dialog">
            <X aria-hidden="true" />
          </button>
        </div>

        <input
          ref={inputRef}
          className="sr-only"
          id="gallery-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          aria-label="Choose gallery photographs"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {drafts.length === 0 ? (
          <div
            className="gallery-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <ImagePlus aria-hidden="true" />
            <strong>Drag photos here</strong>
            <span>or</span>
            <button type="button" onClick={() => inputRef.current?.click()}>
              Browse Device
            </button>
            <p>JPG, PNG or WebP. Multiple photographs supported.</p>
          </div>
        ) : (
          <div className="gallery-upload-review">
            <div className="gallery-upload-fields">
              <label>
                Memory date
                <input type="date" value={takenOn} onChange={(event) => setTakenOn(event.target.value)} />
              </label>
              <label>
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value as GalleryCategory)}>
                  {GALLERY_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Related match
                <select value={relatedMatchId} onChange={(event) => setRelatedMatchId(event.target.value)}>
                  <option value="">Optional</option>
                  {finalisedMatches.map((match) => (
                    <option key={match.id} value={match.id}>{match.matchName} - {match.matchDate}</option>
                  ))}
                </select>
              </label>
              <label>
                Album title
                <input value={albumTitle} onChange={(event) => setAlbumTitle(event.target.value)} placeholder="Optional" />
              </label>
            </div>
            <div className="gallery-upload-list">
              {drafts.map((draft) => (
                <div key={draft.id} className="gallery-upload-item">
                  <img src={draft.previewUrl} alt={`Preview of ${draft.file.name}`} />
                  <div>
                    <strong>{draft.file.name}</strong>
                    <span>{formatGalleryFileSize(draft.file.size)} - {draft.status}</span>
                    {draft.error ? <p>{draft.error}</p> : null}
                    <input
                      value={draft.caption}
                      placeholder="Optional caption"
                      onChange={(event) => updateDraft(draft.id, { caption: event.target.value })}
                    />
                  </div>
                  <button type="button" onClick={() => removeDraft(draft.id)} aria-label={`Remove ${draft.file.name}`}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="gallery-secondary-action" onClick={() => inputRef.current?.click()}>
              Add More Photos
            </button>
          </div>
        )}

        {errors.length > 0 ? (
          <div className="gallery-upload-errors" role="alert">
            {errors.map((error) => <p key={error}>{error}</p>)}
          </div>
        ) : null}

        <div className="gallery-dialog-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={uploadableCount === 0} onClick={uploadDrafts}>
            Upload {uploadableCount} {uploadableCount === 1 ? "Photo" : "Photos"}
          </button>
        </div>
      </section>
    </div>
  );
}

function FeaturedMemory({
  photo,
  isAdmin,
  onFeature
}: {
  photo: GalleryPhoto | null;
  isAdmin: boolean;
  onFeature: (photo: GalleryPhoto) => void;
}) {
  if (!photo) return null;

  return (
    <section className="gallery-featured-memory">
      <GalleryImage photo={photo} className="gallery-featured-image" />
      <div className="gallery-featured-overlay">
        <span>Featured Memory</span>
        <h2>{photo.caption || photo.title || photo.originalFileName || "Gully memory"}</h2>
        <p>{getGalleryCategoryLabel(photo.category)} {photo.takenOn ? `- ${photo.takenOn}` : ""}</p>
        {isAdmin ? (
          <button type="button" onClick={() => onFeature(photo)}>
            <Star aria-hidden="true" />
            Set As Featured
          </button>
        ) : null}
      </div>
    </section>
  );
}

function GalleryFilters({
  activeFilter,
  onFilterChange
}: {
  activeFilter: GalleryFilter;
  onFilterChange: (filter: GalleryFilter) => void;
}) {
  return (
    <div className="gallery-filter-bar" aria-label="Gallery filters">
      <button type="button" data-active={activeFilter === "all"} onClick={() => onFilterChange("all")}>
        All
      </button>
      {GALLERY_CATEGORIES.filter((category) => category.value !== "other").map((category) => (
        <button
          key={category.value}
          type="button"
          data-active={activeFilter === category.value}
          aria-pressed={activeFilter === category.value}
          onClick={() => onFilterChange(category.value)}
        >
          {category.label}
        </button>
      ))}
    </div>
  );
}

function PhotoCard({
  photo,
  index,
  isAdmin,
  onOpen,
  onEdit,
  onDelete,
  onFeature
}: {
  photo: GalleryPhoto;
  index: number;
  isAdmin: boolean;
  onOpen: (index: number, element: HTMLButtonElement) => void;
  onEdit: (photo: GalleryPhoto) => void;
  onDelete: (photo: GalleryPhoto) => void;
  onFeature: (photo: GalleryPhoto) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <article className={`gallery-photo-card gallery-category-${photo.category}`}>
      <button
        type="button"
        className="gallery-photo-button"
        onClick={(event) => onOpen(index, event.currentTarget)}
      >
        <GalleryImage photo={photo} className="gallery-photo-image" />
        <span className="gallery-view-memory">View Memory</span>
      </button>
      <div className="gallery-photo-meta">
        <div>
          <span>{getGalleryCategoryLabel(photo.category)}</span>
          {photo.isFeatured ? <b>Featured</b> : null}
        </div>
        <p>{photo.caption || photo.title || photo.originalFileName || "Gully memory"}</p>
        <small>{photo.takenOn || "Date not set"}</small>
        {photo.relatedMatchId ? (
          <Link href={`/matches/${photo.relatedMatchId}`}>View Match Scorecard -&gt;</Link>
        ) : null}
      </div>
      {isAdmin ? (
        <div className="gallery-card-admin">
          <button type="button" aria-label="Photo actions" onClick={() => setMenuOpen((current) => !current)}>
            <MoreVertical aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div className="gallery-card-admin-menu">
              <button type="button" onClick={() => onEdit(photo)}>Edit Details</button>
              <button type="button" onClick={() => onFeature(photo)}>Set As Featured</button>
              <button type="button" onClick={() => onDelete(photo)}>Delete Photo</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function GalleryLightbox({
  photos,
  activeIndex,
  onClose,
  onMove
}: {
  photos: GalleryPhoto[];
  activeIndex: number;
  onClose: () => void;
  onMove: (index: number) => void;
}) {
  const photo = photos[activeIndex];
  const { dialogRef, firstButtonRef } = useDialogKeyboard(onClose);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") onMove((activeIndex - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight") onMove((activeIndex + 1) % photos.length);
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, onMove, photos.length]);

  return (
    <div className="gallery-lightbox-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="gallery-lightbox" role="dialog" aria-modal="true" aria-label="Gallery memory viewer">
        <button ref={firstButtonRef} type="button" className="gallery-lightbox-close" onClick={onClose} aria-label="Close memory">
          <X aria-hidden="true" />
        </button>
        <button type="button" className="gallery-lightbox-prev" onClick={() => onMove((activeIndex - 1 + photos.length) % photos.length)} aria-label="Previous memory">
          <ChevronLeft aria-hidden="true" />
        </button>
        <GalleryImage photo={photo} className="gallery-lightbox-image" />
        <button type="button" className="gallery-lightbox-next" onClick={() => onMove((activeIndex + 1) % photos.length)} aria-label="Next memory">
          <ChevronRight aria-hidden="true" />
        </button>
        <div className="gallery-lightbox-caption">
          <strong>{activeIndex + 1} / {photos.length}</strong>
          <p>{photo.caption || photo.title || photo.originalFileName || "Gully memory"}</p>
          <span>{getGalleryCategoryLabel(photo.category)} {photo.takenOn ? `- ${photo.takenOn}` : ""}</span>
        </div>
      </section>
    </div>
  );
}

function EditDialog({
  photo,
  onClose,
  onSaved
}: {
  photo: GalleryPhoto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { finalisedMatches } = useMatchRepository();
  const [draft, setDraft] = useState<EditDraft>({
    title: photo.title ?? "",
    caption: photo.caption ?? "",
    category: photo.category,
    takenOn: photo.takenOn ?? "",
    relatedMatchId: photo.relatedMatchId ?? "",
    albumTitle: photo.albumTitle ?? "",
    isFeatured: photo.isFeatured
  });
  const { dialogRef, firstButtonRef } = useDialogKeyboard(onClose);

  async function saveDetails() {
    await galleryRepository.updatePhoto(photo.id, {
      ...draft,
      relatedMatchId: draft.relatedMatchId || null
    });
    onSaved();
    onClose();
  }

  return (
    <div className="gallery-dialog-backdrop" role="presentation">
      <section ref={dialogRef} className="gallery-dialog" role="dialog" aria-modal="true" aria-label="Edit photo details">
        <div className="gallery-dialog-header">
          <h2>EDIT MEMORY</h2>
          <button ref={firstButtonRef} type="button" onClick={onClose} aria-label="Close edit dialog"><X aria-hidden="true" /></button>
        </div>
        <div className="gallery-edit-fields">
          <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label>Caption<textarea value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} /></label>
          <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as GalleryCategory })}>{GALLERY_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Memory date<input type="date" value={draft.takenOn} onChange={(event) => setDraft({ ...draft, takenOn: event.target.value })} /></label>
          <label>Related match<select value={draft.relatedMatchId} onChange={(event) => setDraft({ ...draft, relatedMatchId: event.target.value })}><option value="">Optional</option>{finalisedMatches.map((match) => <option key={match.id} value={match.id}>{match.matchName} - {match.matchDate}</option>)}</select></label>
          <label className="gallery-checkbox"><input type="checkbox" checked={draft.isFeatured} onChange={(event) => setDraft({ ...draft, isFeatured: event.target.checked })} /> Featured memory</label>
        </div>
        <div className="gallery-dialog-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={saveDetails}>Save Details</button>
        </div>
      </section>
    </div>
  );
}

function DeleteDialog({
  photo,
  onClose,
  onDeleted
}: {
  photo: GalleryPhoto;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { dialogRef, firstButtonRef } = useDialogKeyboard(onClose);

  async function deletePhoto() {
    await galleryRepository.deletePhoto(photo.id);
    onDeleted();
    onClose();
  }

  return (
    <div className="gallery-dialog-backdrop" role="presentation">
      <section ref={dialogRef} className="gallery-dialog" role="dialog" aria-modal="true" aria-label="Delete memory">
        <h2>DELETE THIS MEMORY?</h2>
        <p>The photograph and its Gallery information will be removed.</p>
        <div className="gallery-dialog-actions">
          <button ref={firstButtonRef} type="button" onClick={onClose}>KEEP PHOTO</button>
          <button type="button" className="gallery-delete-action" onClick={deletePhoto}>DELETE PHOTO</button>
        </div>
      </section>
    </div>
  );
}

function GallerySkeletons() {
  return (
    <div className="gallery-grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="gallery-skeleton-card" />
      ))}
    </div>
  );
}

export function GalleryFeature({ isAdmin }: { isAdmin: boolean }) {
  const { photos, isLoading, refreshPhotos } = useGalleryPhotos();
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editPhoto, setEditPhoto] = useState<GalleryPhoto | null>(null);
  const [deletePhoto, setDeletePhoto] = useState<GalleryPhoto | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const sortedPhotos = useMemo(() => sortGalleryPhotos(photos), [photos]);
  const visiblePhotos = useMemo(
    () => filterGalleryPhotos(sortedPhotos, filter),
    [filter, sortedPhotos]
  );
  const featuredPhoto = useMemo(
    () => getFeaturedGalleryPhoto(sortedPhotos),
    [sortedPhotos]
  );

  function openLightbox(index: number, element: HTMLButtonElement) {
    returnFocusRef.current = element;
    setLightboxIndex(index);
  }

  function closeLightbox() {
    setLightboxIndex(null);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }

  async function setFeatured(photo: GalleryPhoto) {
    await galleryRepository.setFeaturedPhoto(photo.id);
    refreshPhotos();
  }

  return (
    <main className="gallery-page">
      <GalleryHeader
        photoCount={photos.length}
        isAdmin={isAdmin}
        onAddPhotos={() => setUploadOpen(true)}
      />

      {isLoading ? (
        <GallerySkeletons />
      ) : photos.length === 0 ? (
        <section className="gallery-empty-state">
          <Camera aria-hidden="true" />
          <h2>NO MEMORIES ADDED YET</h2>
          <p>The first Gully moment is waiting to be shared.</p>
          {isAdmin ? (
            <button type="button" className="gallery-primary-action" onClick={() => setUploadOpen(true)}>
              Add The First Photos
            </button>
          ) : null}
        </section>
      ) : (
        <>
          <FeaturedMemory photo={featuredPhoto} isAdmin={isAdmin} onFeature={setFeatured} />
          <GalleryFilters activeFilter={filter} onFilterChange={setFilter} />
          <div className="sr-only" aria-live="polite">{visiblePhotos.length} memories shown</div>
          <section className="gallery-grid" aria-label="Gallery photos">
            {visiblePhotos.map((photo, index) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                index={index}
                isAdmin={isAdmin}
                onOpen={openLightbox}
                onEdit={setEditPhoto}
                onDelete={setDeletePhoto}
                onFeature={setFeatured}
              />
            ))}
          </section>
        </>
      )}

      {uploadOpen ? <UploadDialog onClose={() => setUploadOpen(false)} onUploaded={refreshPhotos} /> : null}
      {lightboxIndex !== null ? (
        <GalleryLightbox
          photos={visiblePhotos}
          activeIndex={lightboxIndex}
          onClose={closeLightbox}
          onMove={setLightboxIndex}
        />
      ) : null}
      {editPhoto ? (
        <EditDialog photo={editPhoto} onClose={() => setEditPhoto(null)} onSaved={refreshPhotos} />
      ) : null}
      {deletePhoto ? (
        <DeleteDialog photo={deletePhoto} onClose={() => setDeletePhoto(null)} onDeleted={refreshPhotos} />
      ) : null}
    </main>
  );
}
