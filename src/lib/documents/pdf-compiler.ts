import { jsPDF } from 'jspdf';

/**
 * Compila dos imágenes (frontal y trasera) en un único archivo PDF tamaño Carta vertical.
 * @param frontBase64 Imagen frontal en Base64 (Data URI)
 * @param backBase64 Imagen trasera en Base64 (Data URI)
 * @returns Promesa que resuelve a un Data URI en Base64 del archivo PDF generado
 */
async function getImageAspect(base64: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || img.width || 600;
      const h = img.naturalHeight || img.height || 950;
      resolve(w / h);
    };
    img.onerror = () => resolve(0.63);
    img.src = base64;
  });
}

function getFormat(base64: string): 'PNG' | 'JPEG' {
  if (base64.toLowerCase().includes('image/png')) {
    return 'PNG';
  }
  return 'JPEG';
}

/**
 * Compila dos imágenes (frontal y trasera) en un único archivo PDF tamaño Carta vertical respetando proporciones reales.
 * @param frontBase64 Imagen frontal en Base64 (Data URI)
 * @param backBase64 Imagen trasera en Base64 (Data URI)
 * @returns Promesa que resuelve a un Data URI en Base64 del archivo PDF generado
 */
export async function compileFrontBackPdf(
  frontBase64: string,
  backBase64: string
): Promise<string> {
  // Crear documento PDF vertical en tamaño carta (Letter: 215.9 mm x 279.4 mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const frontAspect = await getImageAspect(frontBase64);
  const backAspect = await getImageAspect(backBase64);

  // Escalar frontis
  const maxW = 125;
  const maxH = 95;
  let fW = maxW;
  let fH = maxW / frontAspect;
  if (fH > maxH) {
    fH = maxH;
    fW = maxH * frontAspect;
  }
  const fX = (215.9 - fW) / 2;
  const fY = 25 + (maxH - fH) / 2;

  // Escalar trasera
  let bW = maxW;
  let bH = maxW / backAspect;
  if (bH > maxH) {
    bH = maxH;
    bW = maxH * backAspect;
  }
  const bX = (215.9 - bW) / 2;
  const bY = 145 + (maxH - bH) / 2;

  doc.addImage(frontBase64, getFormat(frontBase64), fX, fY, fW, fH, undefined, 'SLOW');
  doc.addImage(backBase64, getFormat(backBase64), bX, bY, bW, bH, undefined, 'SLOW');

  return doc.output('datauristring');
}

/**
 * Compila una única imagen (frontal) en un archivo PDF tamaño Carta vertical centrado respetando la orientación real.
 * @param frontBase64 Imagen en Base64 (Data URI)
 * @returns Promesa que resuelve a un Data URI en Base64 del archivo PDF generado
 */
export async function compileSingleCardPdf(
  frontBase64: string
): Promise<string> {
  // Crear documento PDF vertical en tamaño carta (Letter: 215.9 mm x 279.4 mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const aspect = await getImageAspect(frontBase64);
  const maxW = 130;
  const maxH = 190;

  let cardW = maxW;
  let cardH = maxW / aspect;

  if (cardH > maxH) {
    cardH = maxH;
    cardW = maxH * aspect;
  }

  const x = (215.9 - cardW) / 2;
  const y = 35 + (maxH - cardH) / 2;

  doc.addImage(frontBase64, getFormat(frontBase64), x, y, cardW, cardH, undefined, 'SLOW');

  return doc.output('datauristring');
}
