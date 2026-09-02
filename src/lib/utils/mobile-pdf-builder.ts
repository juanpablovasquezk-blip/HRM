import { jsPDF } from 'jspdf';

/**
 * Resizes and compresses an image File or DataURL using HTML5 Canvas
 * and converts it into a lightweight, compressed PDF Blob.
 *
 * @param files Single File or Array of File / DataURL images
 * @param maxDimension Max width/height in pixels (default 1200)
 * @param quality JPEG compression quality (default 0.72)
 * @returns Promise<Blob> Lightweight PDF Blob
 */
export async function convertImagesToLightweightPDF(
  files: (File | string)[],
  maxDimension = 1200,
  quality = 0.72
): Promise<Blob> {
  const imagesDataUrls: { dataUrl: string; width: number; height: number }[] = [];

  for (const file of files) {
    const dataUrl = typeof file === 'string' ? file : await readFileAsDataURL(file);
    const compressed = await compressImage(dataUrl, maxDimension, quality);
    imagesDataUrls.push(compressed);
  }

  if (imagesDataUrls.length === 0) {
    throw new Error('No hay imágenes válidas para generar el PDF.');
  }

  // A4 dimensions in mm: 210 x 297
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pdfWidth = 210;
  const pdfHeight = 297;

  imagesDataUrls.forEach((img, idx) => {
    if (idx > 0) {
      doc.addPage();
    }

    // Calculate aspect ratio fit to A4 page with 5mm margin
    const margin = 5;
    const availWidth = pdfWidth - margin * 2;
    const availHeight = pdfHeight - margin * 2;

    const imgRatio = img.width / img.height;
    let renderWidth = availWidth;
    let renderHeight = availWidth / imgRatio;

    if (renderHeight > availHeight) {
      renderHeight = availHeight;
      renderWidth = availHeight * imgRatio;
    }

    const x = (pdfWidth - renderWidth) / 2;
    const y = (pdfHeight - renderHeight) / 2;

    doc.addImage(img.dataUrl, 'JPEG', x, y, renderWidth, renderHeight, undefined, 'FAST');
  });

  return doc.output('blob');
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

function compressImage(
  dataUrl: string,
  maxDim: number,
  quality: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          maxDim;
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl, width: img.width, height: img.height });
        return;
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ dataUrl: compressedDataUrl, width, height });
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}
