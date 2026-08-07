import {
  createGalleryPhotoId,
  GALLERY_MAX_STORED_FILE_SIZE,
  sortGalleryPhotos,
  type GalleryCategory,
  type GalleryPhoto,
  type GalleryPhotoId,
  type GalleryPhotoUpdate,
  type GalleryRepository,
  type GalleryUploadInput
} from "./gallery";
import { isSupabaseDataSource } from "@/lib/data-source";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export const GALLERY_DATABASE_NAME = "gully-legends-gallery";
export const GALLERY_PHOTO_STORE = "galleryPhotos";
export const GALLERY_BLOB_STORE = "galleryPhotoBlobs";
export const GALLERY_UPDATED_EVENT = "gully-legends-gallery-updated";
export const GALLERY_STORAGE_BUCKET = "gallery";

type SupabaseErrorLike = {
  message: string;
};

type SupabaseGalleryPhotoRow = {
  id: string;
  storage_path: string | null;
  title: string | null;
  caption: string | null;
  category: GalleryCategory;
  taken_on: string | null;
  related_match_id: string | null;
  album_title: string | null;
  mime_type: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  original_file_name: string | null;
  is_featured: boolean;
  sort_order: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  deleted_at: string | null;
};

type StoredGalleryPhoto = Omit<GalleryPhoto, "imageSource"> & {
  blobId: string;
};

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openGalleryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GALLERY_DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(GALLERY_PHOTO_STORE)) {
        database.createObjectStore(GALLERY_PHOTO_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(GALLERY_BLOB_STORE)) {
        database.createObjectStore(GALLERY_BLOB_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dispatchGalleryUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GALLERY_UPDATED_EVENT));
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function datePath(value = new Date()) {
  return {
    year: String(value.getFullYear()),
    month: String(value.getMonth() + 1).padStart(2, "0")
  };
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";

  return "jpg";
}

function sanitizeStorageFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const sanitized = withoutExtension
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return sanitized || "gully-memory";
}

export function createGalleryStoragePath(input: Pick<GalleryUploadInput, "fileName" | "mimeType">) {
  const { year, month } = datePath();
  const id = createGalleryPhotoId();
  const safeFileName = sanitizeStorageFileName(input.fileName);
  const extension = extensionForMimeType(input.mimeType);

  return `${GALLERY_STORAGE_BUCKET}/${year}/${month}/${id}-${safeFileName}.${extension}`;
}

function mapSupabaseGalleryPhotoRow(
  row: SupabaseGalleryPhotoRow,
  getPublicUrl: (storagePath: string) => string
): GalleryPhoto {
  const storagePath = row.storage_path ?? "";

  return {
    id: row.id,
    title: row.title ?? undefined,
    caption: row.caption ?? undefined,
    category: row.category,
    takenOn: row.taken_on ?? undefined,
    relatedMatchId: row.related_match_id,
    albumTitle: row.album_title ?? undefined,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    mimeType: row.mime_type,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    fileSize: row.file_size ?? undefined,
    originalFileName: row.original_file_name ?? undefined,
    isFeatured: row.is_featured,
    sortOrder: row.sort_order ?? undefined,
    imageSource: {
      kind: "remote",
      storagePath,
      url: storagePath ? getPublicUrl(storagePath) : ""
    }
  };
}

export class SupabaseGalleryRepository implements GalleryRepository {
  private client: SupabaseClient | null = null;

  private getClient() {
    this.client ??= createSupabaseBrowserClient();

    return this.client;
  }

  private getPublicUrl(storagePath: string) {
    return this.getClient().storage
      .from(GALLERY_STORAGE_BUCKET)
      .getPublicUrl(storagePath).data.publicUrl;
  }

  private async getCurrentAdminUserId(): Promise<string> {
    const { data, error } = await this.getClient().auth.getUser();

    if (error || !data.user) {
      throw new Error("Admin login required to update Gallery.");
    }

    return data.user.id;
  }

  private async assertRelatedMatchExists(relatedMatchId: string | null | undefined) {
    if (!relatedMatchId) return;

    const { data, error } = (await this.getClient()
      .from("matches")
      .select("id")
      .eq("id", relatedMatchId)
      .is("deleted_at", null)
      .maybeSingle()) as unknown as {
      data: { id: string } | null;
      error: SupabaseErrorLike | null;
    };

    if (error || !data) {
      throw new Error("Related match is not available.");
    }
  }

  async listPhotos(): Promise<GalleryPhoto[]> {
    const { data, error } = (await this.getClient()
      .from("gallery_photos")
      .select(
        [
          "id",
          "storage_path",
          "title",
          "caption",
          "category",
          "taken_on",
          "related_match_id",
          "album_title",
          "mime_type",
          "file_size",
          "width",
          "height",
          "original_file_name",
          "is_featured",
          "sort_order",
          "uploaded_by",
          "uploaded_at",
          "deleted_at"
        ].join(", ")
      )
      .is("deleted_at", null)
      .order("taken_on", { ascending: false, nullsFirst: false })
      .order("uploaded_at", { ascending: false })) as unknown as {
      data: SupabaseGalleryPhotoRow[] | null;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      throw new Error("Could not load Gallery photos.");
    }

    return sortGalleryPhotos(
      (data ?? []).map((row) =>
        mapSupabaseGalleryPhotoRow(row, (storagePath) => this.getPublicUrl(storagePath))
      )
    );
  }

  async uploadPhotos(input: GalleryUploadInput[]): Promise<GalleryPhoto[]> {
    const uploadedBy = await this.getCurrentAdminUserId();
    const uploadedPhotos: GalleryPhoto[] = [];

    for (const item of input) {
      if (item.blob.size > GALLERY_MAX_STORED_FILE_SIZE) {
        throw new Error("Optimised image is larger than the 6 MB Gallery limit.");
      }

      await this.assertRelatedMatchExists(item.relatedMatchId);

      const id = createGalleryPhotoId();
      const storagePath = createGalleryStoragePath(item);
      const uploadedAt = new Date().toISOString();
      const { error: uploadError } = await this.getClient().storage
        .from(GALLERY_STORAGE_BUCKET)
        .upload(storagePath, item.blob, {
          contentType: item.mimeType,
          upsert: false
        });

      if (uploadError) {
        throw new Error(uploadError.message || "Could not upload Gallery photo.");
      }

      const insertPayload = {
        id,
        storage_path: storagePath,
        title: emptyToNull(item.title ?? item.albumTitle),
        caption: emptyToNull(item.caption),
        category: item.category,
        taken_on: emptyToNull(item.takenOn),
        related_match_id: item.relatedMatchId ?? null,
        album_title: emptyToNull(item.albumTitle),
        mime_type: item.mimeType,
        file_size: item.fileSize ?? item.blob.size,
        width: item.width ?? null,
        height: item.height ?? null,
        original_file_name: item.fileName,
        is_featured: false,
        is_demo: false,
        sort_order: Date.now(),
        image_payload: {},
        uploaded_by: uploadedBy,
        uploaded_at: uploadedAt
      };
      const { data, error: insertError } = (await this.getClient()
        .from("gallery_photos")
        .insert(insertPayload)
        .select()
        .single()) as unknown as {
        data: SupabaseGalleryPhotoRow | null;
        error: SupabaseErrorLike | null;
      };

      if (insertError || !data) {
        const { error: cleanupError } = await this.getClient().storage
          .from(GALLERY_STORAGE_BUCKET)
          .remove([storagePath]);

        if (cleanupError) {
          throw new Error("Photo uploaded, but Gallery details could not be saved. Storage cleanup also failed.");
        }

        throw new Error("Photo uploaded, but Gallery details could not be saved. The uploaded file was cleaned up.");
      }

      uploadedPhotos.push(
        mapSupabaseGalleryPhotoRow(data, (path) => this.getPublicUrl(path))
      );
    }

    dispatchGalleryUpdate();
    return uploadedPhotos;
  }

  async updatePhoto(
    id: GalleryPhotoId,
    changes: GalleryPhotoUpdate
  ): Promise<GalleryPhoto> {
    await this.getCurrentAdminUserId();
    await this.assertRelatedMatchExists(changes.relatedMatchId);

    if (changes.isFeatured) {
      await this.getClient()
        .from("gallery_photos")
        .update({ is_featured: false })
        .is("deleted_at", null)
        .eq("is_featured", true);
    }

    const { data, error } = (await this.getClient()
      .from("gallery_photos")
      .update({
        title: changes.title === undefined ? undefined : emptyToNull(changes.title),
        caption: changes.caption === undefined ? undefined : emptyToNull(changes.caption),
        category: changes.category,
        taken_on: changes.takenOn === undefined ? undefined : emptyToNull(changes.takenOn),
        related_match_id:
          changes.relatedMatchId === undefined ? undefined : changes.relatedMatchId,
        album_title:
          changes.albumTitle === undefined ? undefined : emptyToNull(changes.albumTitle),
        is_featured: changes.isFeatured
      })
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single()) as unknown as {
      data: SupabaseGalleryPhotoRow | null;
      error: SupabaseErrorLike | null;
    };

    if (error || !data) {
      throw new Error("Could not update Gallery photo.");
    }

    dispatchGalleryUpdate();
    return mapSupabaseGalleryPhotoRow(data, (storagePath) => this.getPublicUrl(storagePath));
  }

  async deletePhoto(id: GalleryPhotoId): Promise<void> {
    await this.getCurrentAdminUserId();

    const { data: current, error: readError } = (await this.getClient()
      .from("gallery_photos")
      .select("id, storage_path")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle()) as unknown as {
      data: { id: string; storage_path: string | null } | null;
      error: SupabaseErrorLike | null;
    };

    if (readError) {
      throw new Error("Could not delete Gallery photo.");
    }

    if (!current?.storage_path) return;

    const deletedAt = new Date().toISOString();
    const { error: markDeletedError } = await this.getClient()
      .from("gallery_photos")
      .update({ deleted_at: deletedAt, is_featured: false })
      .eq("id", id);

    if (markDeletedError) {
      throw new Error("Could not delete Gallery photo.");
    }

    const { error: removeError } = await this.getClient().storage
      .from(GALLERY_STORAGE_BUCKET)
      .remove([current.storage_path]);

    if (removeError) {
      await this.getClient()
        .from("gallery_photos")
        .update({ deleted_at: null })
        .eq("id", id);
      throw new Error("The Gallery photo could not be removed from Storage.");
    }

    dispatchGalleryUpdate();
  }

  async setFeaturedPhoto(id: GalleryPhotoId): Promise<void> {
    await this.updatePhoto(id, { isFeatured: true });
  }
}

export class LocalGalleryRepository implements GalleryRepository {
  private async getDatabase() {
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is not available in this browser.");
    }

    return openGalleryDatabase();
  }

  async listPhotos(): Promise<GalleryPhoto[]> {
    const database = await this.getDatabase();
    const transaction = database.transaction(
      [GALLERY_PHOTO_STORE, GALLERY_BLOB_STORE],
      "readonly"
    );
    const photoStore = transaction.objectStore(GALLERY_PHOTO_STORE);
    const blobStore = transaction.objectStore(GALLERY_BLOB_STORE);
    const [storedPhotos, blobRecords] = await Promise.all([
      requestToPromise<StoredGalleryPhoto[]>(photoStore.getAll()),
      requestToPromise<Array<{ id: string; blob: Blob }>>(blobStore.getAll())
    ]);
    const blobById = new Map(blobRecords.map((record) => [record.id, record.blob]));
    const photos = storedPhotos.map((photo) => {
      const blob = blobById.get(photo.blobId);

      return {
        ...photo,
        imageSource: {
          kind: "object-url" as const,
          blobId: photo.blobId,
          url: blob ? URL.createObjectURL(blob) : ""
        }
      };
    });

    database.close();

    return sortGalleryPhotos(photos);
  }

  async uploadPhotos(input: GalleryUploadInput[]): Promise<GalleryPhoto[]> {
    const database = await this.getDatabase();
    const transaction = database.transaction(
      [GALLERY_PHOTO_STORE, GALLERY_BLOB_STORE],
      "readwrite"
    );
    const photoStore = transaction.objectStore(GALLERY_PHOTO_STORE);
    const blobStore = transaction.objectStore(GALLERY_BLOB_STORE);
    const uploadedAt = new Date().toISOString();
    const photos = input.map((item, index) => {
      const id = createGalleryPhotoId();
      const blobId = `${id}-blob`;
      const storedPhoto: StoredGalleryPhoto = {
        id,
        blobId,
        title: item.title,
        caption: item.caption,
        category: item.category,
        takenOn: item.takenOn,
        relatedMatchId: item.relatedMatchId ?? null,
        albumTitle: item.albumTitle,
        uploadedAt,
        uploadedBy: item.uploadedBy ?? null,
        mimeType: item.mimeType,
        width: item.width,
        height: item.height,
        fileSize: item.fileSize,
        originalFileName: item.fileName,
        isFeatured: false,
        sortOrder: Date.now() + index
      };

      photoStore.put(storedPhoto);
      blobStore.put({ id: blobId, blob: item.blob });

      return {
        ...storedPhoto,
        imageSource: {
          kind: "object-url" as const,
          blobId,
          url: URL.createObjectURL(item.blob)
        }
      };
    });

    await transactionDone(transaction);
    database.close();
    dispatchGalleryUpdate();

    return photos;
  }

  async updatePhoto(
    id: GalleryPhotoId,
    changes: GalleryPhotoUpdate
  ): Promise<GalleryPhoto> {
    const database = await this.getDatabase();
    const readTransaction = database.transaction(GALLERY_PHOTO_STORE, "readonly");
    const readPhotoStore = readTransaction.objectStore(GALLERY_PHOTO_STORE);
    const [current, allPhotos] = await Promise.all([
      requestToPromise<StoredGalleryPhoto | undefined>(readPhotoStore.get(id)),
      changes.isFeatured
        ? requestToPromise<StoredGalleryPhoto[]>(readPhotoStore.getAll())
        : Promise.resolve([])
    ]);

    if (!current) {
      database.close();
      throw new Error("Gallery photo not found.");
    }

    const transaction = database.transaction(GALLERY_PHOTO_STORE, "readwrite");
    const photoStore = transaction.objectStore(GALLERY_PHOTO_STORE);

    if (changes.isFeatured) {
      for (const photo of allPhotos) {
        photoStore.put({ ...photo, isFeatured: photo.id === id });
      }
    }

    const updated: StoredGalleryPhoto = {
      ...current,
      ...changes,
      relatedMatchId: changes.relatedMatchId ?? current.relatedMatchId ?? null,
      isFeatured: changes.isFeatured ?? current.isFeatured
    };

    photoStore.put(updated);
    await transactionDone(transaction);

    const blobTransaction = database.transaction(GALLERY_BLOB_STORE, "readonly");
    const blobStore = blobTransaction.objectStore(GALLERY_BLOB_STORE);
    const blobRecord = await requestToPromise<{ id: string; blob: Blob } | undefined>(
      blobStore.get(updated.blobId)
    );

    database.close();
    dispatchGalleryUpdate();

    return {
      ...updated,
      imageSource: {
        kind: "object-url",
        blobId: updated.blobId,
        url: blobRecord?.blob ? URL.createObjectURL(blobRecord.blob) : ""
      }
    };
  }

  async deletePhoto(id: GalleryPhotoId): Promise<void> {
    const database = await this.getDatabase();
    const readTransaction = database.transaction(GALLERY_PHOTO_STORE, "readonly");
    const readPhotoStore = readTransaction.objectStore(GALLERY_PHOTO_STORE);
    const current = await requestToPromise<StoredGalleryPhoto | undefined>(
      readPhotoStore.get(id)
    );

    if (current) {
      const transaction = database.transaction(
        [GALLERY_PHOTO_STORE, GALLERY_BLOB_STORE],
        "readwrite"
      );
      const photoStore = transaction.objectStore(GALLERY_PHOTO_STORE);
      const blobStore = transaction.objectStore(GALLERY_BLOB_STORE);

      photoStore.delete(id);
      blobStore.delete(current.blobId);

      await transactionDone(transaction);
    }

    database.close();
    dispatchGalleryUpdate();
  }

  async setFeaturedPhoto(id: GalleryPhotoId): Promise<void> {
    const database = await this.getDatabase();
    const readTransaction = database.transaction(GALLERY_PHOTO_STORE, "readonly");
    const readPhotoStore = readTransaction.objectStore(GALLERY_PHOTO_STORE);
    const allPhotos = await requestToPromise<StoredGalleryPhoto[]>(
      readPhotoStore.getAll()
    );
    const transaction = database.transaction(GALLERY_PHOTO_STORE, "readwrite");
    const photoStore = transaction.objectStore(GALLERY_PHOTO_STORE);

    for (const photo of allPhotos) {
      photoStore.put({ ...photo, isFeatured: photo.id === id });
    }

    await transactionDone(transaction);
    database.close();
    dispatchGalleryUpdate();
  }
}

// Local-mode photos are intentionally browser/device-local during localhost
// development. Supabase mode uses the public "gallery" Storage bucket and
// gallery_photos metadata without touching IndexedDB.
export function createGalleryRepository(): GalleryRepository {
  if (isSupabaseDataSource()) {
    return new SupabaseGalleryRepository();
  }

  return new LocalGalleryRepository();
}

export const galleryRepository = createGalleryRepository();
