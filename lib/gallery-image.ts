import {
  GALLERY_IMAGE_LONG_EDGE,
  GALLERY_IMAGE_QUALITY,
  type GalleryUploadInput,
  type GalleryCategory
} from "./gallery";

export type OptimisedGalleryImage = {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
};

async function getImageBitmap(file: File): Promise<ImageBitmap> {
  if ("createImageBitmap" in window) {
    return window.createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Could not read image."));
        return;
      }

      context.drawImage(image, 0, 0);
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error("Could not read image."));
          return;
        }

        try {
          resolve(await window.createImageBitmap(blob));
        } catch (error) {
          reject(error);
        }
      }, file.type || "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not optimise image."));
      },
      mimeType,
      quality
    );
  });
}

export async function optimiseGalleryImage(
  file: File
): Promise<OptimisedGalleryImage> {
  const bitmap = await getImageBitmap(file);
  const longestEdge = Math.max(bitmap.width, bitmap.height);
  const needsResize = longestEdge > GALLERY_IMAGE_LONG_EDGE;
  const smallEnough = file.size <= 5 * 1024 * 1024 && !needsResize;

  if (smallEnough) {
    return {
      blob: file,
      mimeType: file.type,
      width: bitmap.width,
      height: bitmap.height,
      fileSize: file.size
    };
  }

  const scale = needsResize ? GALLERY_IMAGE_LONG_EDGE / longestEdge : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return {
      blob: file,
      mimeType: file.type,
      width: bitmap.width,
      height: bitmap.height,
      fileSize: file.size
    };
  }

  context.drawImage(bitmap, 0, 0, width, height);
  const outputMimeType = file.type === "image/png" ? "image/jpeg" : file.type;
  const optimisedBlob = await canvasToBlob(
    canvas,
    outputMimeType,
    GALLERY_IMAGE_QUALITY
  );

  return {
    blob: optimisedBlob.size < file.size ? optimisedBlob : file,
    mimeType: optimisedBlob.size < file.size ? outputMimeType : file.type,
    width: optimisedBlob.size < file.size ? width : bitmap.width,
    height: optimisedBlob.size < file.size ? height : bitmap.height,
    fileSize: Math.min(optimisedBlob.size, file.size)
  };
}

export function buildGalleryUploadInput({
  file,
  optimised,
  caption,
  category,
  takenOn,
  relatedMatchId,
  albumTitle
}: {
  file: File;
  optimised: OptimisedGalleryImage;
  caption?: string;
  category: GalleryCategory;
  takenOn?: string;
  relatedMatchId?: string | null;
  albumTitle?: string;
}): GalleryUploadInput {
  return {
    fileName: file.name,
    blob: optimised.blob,
    caption,
    category,
    takenOn,
    relatedMatchId,
    albumTitle,
    mimeType: optimised.mimeType,
    width: optimised.width,
    height: optimised.height,
    fileSize: optimised.fileSize
  };
}
