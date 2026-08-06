import {
  createGalleryPhotoId,
  sortGalleryPhotos,
  type GalleryPhoto,
  type GalleryPhotoId,
  type GalleryPhotoUpdate,
  type GalleryRepository,
  type GalleryUploadInput
} from "./gallery";

export const GALLERY_DATABASE_NAME = "gully-legends-gallery";
export const GALLERY_PHOTO_STORE = "galleryPhotos";
export const GALLERY_BLOB_STORE = "galleryPhotoBlobs";
export const GALLERY_UPDATED_EVENT = "gully-legends-gallery-updated";

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
// development. A future SupabaseGalleryRepository can keep this UI contract and
// store binaries in the "gallery" bucket with metadata in "gallery_photos".
export function createGalleryRepository(): GalleryRepository {
  const mode = process.env.NEXT_PUBLIC_GALLERY_STORAGE_MODE ?? "local";

  if (mode === "supabase") {
    return new LocalGalleryRepository();
  }

  return new LocalGalleryRepository();
}

export const galleryRepository = createGalleryRepository();
