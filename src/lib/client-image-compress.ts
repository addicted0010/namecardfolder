const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB - stay under Vercel Hobby limit

/**
 * Compress and resize an image file client-side using Canvas API
 */
export async function compressImage(file: File): Promise<File> {
  // Skip compression for small files or non-image files
  if (file.size < 500 * 1024 || !file.type.startsWith("image/")) {
    return file;
  }

  // Load image
  const img = await loadImage(file);

  // Calculate new dimensions
  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  // Create canvas and draw
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(img, 0, 0, width, height);

  // Convert to blob
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size >= file.size) {
          // Compression didn't help, return original
          resolve(file);
        } else if (blob.size > MAX_FILE_SIZE) {
          // Still too large, try lower quality
          canvas.toBlob(
            (smallerBlob) => {
              if (!smallerBlob) {
                resolve(file);
              } else {
                resolve(
                  new File([smallerBlob], file.name.replace(/\.[^.]+$/, ".jpg"), {
                    type: "image/jpeg",
                  })
                );
              }
            },
            "image/jpeg",
            0.7
          );
        } else {
          resolve(
            new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
              type: "image/jpeg",
            })
          );
        }
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}
