const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;
const SKIP_BELOW_BYTES = 300 * 1024; // already small enough, not worth re-encoding

// Resizes/re-encodes an image client-side before upload, so a 3-8MB phone
// photo doesn't burn through Supabase's free-tier storage and egress budget.
// Falls back to the original file on any failure (unsupported browser API,
// corrupt image, etc.) so a receipt upload never gets blocked by this.
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < SKIP_BELOW_BYTES) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    let { width, height } = bitmap;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (err) {
    console.warn('Image compression failed, uploading original:', err);
    return file;
  }
}
