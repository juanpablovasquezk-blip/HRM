import { jsPDF } from 'jspdf';

async function fetchLogoBase64(): Promise<string> {
  try {
    const res = await fetch('/templates/acta_image2.png');
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return '';
  }
}

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

export interface CardPdfMetadata {
  workerFullName?: string;
  rut?: string;
  docTitle?: string;
  docNumber?: string;
  expirationDate?: string;
  companyName?: string;
}

/**
 * Compila dos imágenes (frontal y trasera) en un único archivo PDF tamaño Carta vertical con membrete Minerquim.
 */
export async function compileFrontBackPdf(
  frontBase64: string,
  backBase64: string,
  meta?: CardPdfMetadata
): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const logoBase64 = await fetchLogoBase64();

  // 1. Logo
  if (logoBase64) {
    const logoW = 35;
    const logoH = 35 / 2.04;
    doc.addImage(logoBase64, 'PNG', 20, 12, logoW, logoH);
  }

  // 2. Date
  const today = new Date();
  const formattedDate = today.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
  const capitalizedDate = formattedDate.replace(/^\w/, (c) => c.toUpperCase());
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Santiago, ${capitalizedDate}`, 195, 18, { align: 'right' });

  // 3. Title
  const title = meta?.docTitle || 'REGISTRO DE DOCUMENTO DE IDENTIFICACIÓN';
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 107.95, 28, { align: 'center' });

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(20, 31, 195, 31);

  let currentY = 35;

  // 4. Worker Box
  if (meta?.workerFullName || meta?.rut) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(20, currentY, 175, 16, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(20, currentY, 175, 16, 2, 2, 'D');

    doc.setFontSize(8.5);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('Trabajador:', 25, currentY + 6);
    doc.setFont('Helvetica', 'normal');
    doc.text(meta.workerFullName || '—', 45, currentY + 6);

    doc.setFont('Helvetica', 'bold');
    doc.text('RUT:', 25, currentY + 12);
    doc.setFont('Helvetica', 'normal');
    doc.text(meta.rut || '—', 45, currentY + 12);

    if (meta.expirationDate) {
      doc.setFont('Helvetica', 'bold');
      doc.text('Vencimiento:', 120, currentY + 6);
      doc.setFont('Helvetica', 'normal');
      doc.text(meta.expirationDate, 142, currentY + 6);
    }

    currentY += 21;
  }

  // 5. Images Front & Back
  const frontAspect = await getImageAspect(frontBase64);
  const backAspect = await getImageAspect(backBase64);

  const maxW = 120;
  const maxH = 92;

  let fW = maxW;
  let fH = maxW / frontAspect;
  if (fH > maxH) {
    fH = maxH;
    fW = maxH * frontAspect;
  }
  const fX = (215.9 - fW) / 2;
  const fY = currentY + (maxH - fH) / 2;

  let bW = maxW;
  let bH = maxW / backAspect;
  if (bH > maxH) {
    bH = maxH;
    bW = maxH * backAspect;
  }
  const bX = (215.9 - bW) / 2;
  const bY = currentY + maxH + 8 + (maxH - bH) / 2;

  // Draw frame front
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(fX - 1, fY - 1, fW + 2, fH + 2, 1.5, 1.5, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(fX - 1, fY - 1, fW + 2, fH + 2, 1.5, 1.5, 'D');
  doc.addImage(frontBase64, getFormat(frontBase64), fX, fY, fW, fH, undefined, 'SLOW');

  // Draw frame back
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(bX - 1, bY - 1, bW + 2, bH + 2, 1.5, 1.5, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(bX - 1, bY - 1, bW + 2, bH + 2, 1.5, 1.5, 'D');
  doc.addImage(backBase64, getFormat(backBase64), bX, bY, bW, bH, undefined, 'SLOW');

  // Footer
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Copia digital oficial - Grupo Minerquim.', 107.95, 268, { align: 'center' });

  return doc.output('datauristring');
}

/**
 * Compila una única imagen (frontal) en un archivo PDF tamaño Carta vertical centrado respetando orientación natural con membrete Minerquim.
 */
export async function compileSingleCardPdf(
  frontBase64: string,
  meta?: CardPdfMetadata
): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const logoBase64 = await fetchLogoBase64();

  // 1. Logo
  if (logoBase64) {
    const logoW = 38;
    const logoH = 38 / 2.04;
    doc.addImage(logoBase64, 'PNG', 20, 14, logoW, logoH);
  }

  // 2. Date
  const today = new Date();
  const formattedDate = today.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
  const capitalizedDate = formattedDate.replace(/^\w/, (c) => c.toUpperCase());
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Santiago, ${capitalizedDate}`, 195, 20, { align: 'right' });

  // 3. Document Title
  const rawTitle = meta?.docTitle?.toUpperCase() || 'CREDENCIAL TICA';
  let title = rawTitle;
  if (rawTitle.includes('TICA')) {
    title = 'CREDENCIAL DE ACCESO AEROPORTUARIO (TICA)';
  } else if (rawTitle.includes('PCP')) {
    title = 'PERMISO DE CONDUCCIÓN EN PLATAFORMA (PCP)';
  }

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 107.95, 32, { align: 'center' });

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(20, 36, 195, 36);

  let currentY = 40;

  // 4. Worker & Document Info Summary Box
  if (meta?.workerFullName || meta?.rut) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(20, currentY, 175, 20, 2.5, 2.5, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(20, currentY, 175, 20, 2.5, 2.5, 'D');

    doc.setFontSize(9);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('Trabajador:', 25, currentY + 7);
    doc.setFont('Helvetica', 'normal');
    doc.text(meta.workerFullName || '—', 48, currentY + 7);

    doc.setFont('Helvetica', 'bold');
    doc.text('RUT:', 25, currentY + 15);
    doc.setFont('Helvetica', 'normal');
    doc.text(meta.rut || '—', 48, currentY + 15);

    if (meta.docNumber) {
      doc.setFont('Helvetica', 'bold');
      doc.text('N° Credencial:', 115, currentY + 7);
      doc.setFont('Helvetica', 'normal');
      doc.text(meta.docNumber, 138, currentY + 7);
    }

    if (meta.expirationDate) {
      doc.setFont('Helvetica', 'bold');
      doc.text('Vencimiento:', 115, currentY + 15);
      doc.setFont('Helvetica', 'normal');
      doc.text(meta.expirationDate, 138, currentY + 15);
    }

    currentY += 26;
  }

  // 5. Card Image Scaling (Strictly Preserving Real Aspect Ratio)
  const aspect = await getImageAspect(frontBase64); // width / height
  const maxW = 120;
  const maxH = 245 - currentY; // Available height down to Y=245

  let cardW = maxW;
  let cardH = maxW / aspect;

  if (cardH > maxH) {
    cardH = maxH;
    cardW = maxH * aspect;
  }

  const cardX = (215.9 - cardW) / 2;
  const cardY = currentY + (maxH - cardH) / 2;

  // Background frame / shadow
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(cardX - 1.5, cardY - 1.5, cardW + 3, cardH + 3, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(cardX - 1.5, cardY - 1.5, cardW + 3, cardH + 3, 2, 2, 'D');

  // Render Image directly
  doc.addImage(frontBase64, getFormat(frontBase64), cardX, cardY, cardW, cardH, undefined, 'SLOW');

  // 6. Institutional Footer
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Copia digital y registro oficial de credenciales - Grupo Minerquim.',
    107.95,
    262,
    { align: 'center' }
  );

  return doc.output('datauristring');
}
