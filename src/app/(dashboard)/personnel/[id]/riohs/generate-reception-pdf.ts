'use client';

import { jsPDF } from 'jspdf';

interface ReceptionPDFParams {
  workerName: string;
  workerRut: string;
  companyName: string;
  companyRut: string;
  sentAt?: string | Date | null;
}

interface TextChunk {
  text: string;
  bold?: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
  });
}

function printStyledParagraph(
  doc: jsPDF,
  chunks: TextChunk[],
  startX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number = 6
): number {
  let currentX = startX;
  let currentY = startY;

  for (const chunk of chunks) {
    doc.setFont('helvetica', chunk.bold ? 'bold' : 'normal');
    const tokens = chunk.text.split(/(\s+)/);

    for (const token of tokens) {
      if (!token) continue;
      const tokenWidth = doc.getTextWidth(token);

      if (currentX + tokenWidth > startX + maxWidth && token.trim() !== '') {
        currentX = startX;
        currentY += lineHeight;
      }

      doc.text(token, currentX, currentY);
      currentX += tokenWidth;
    }
  }

  return currentY;
}

export async function generateReceptionPDF(params: ReceptionPDFParams) {
  const { workerName, workerRut, companyName, companyRut } = params;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4', // 210 x 297 mm
  });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const usableW = pageW - margin * 2; // 170 mm
  let currentY = margin;

  // Header Logo
  try {
    const logoImg = await loadImage('/logo.jpg');
    doc.addImage(logoImg, 'JPEG', margin, currentY, 40, 16);
  } catch (error) {
    try {
      const logoPng = await loadImage('/logo.png');
      doc.addImage(logoPng, 'PNG', margin, currentY, 40, 16);
    } catch (e) {
      doc.setFillColor(26, 54, 93);
      doc.rect(margin, currentY, 40, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('GRUPO MINERQUIM', margin + 3, currentY + 9);
    }
  }

  // Header Company Info
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName.toUpperCase(), pageW - margin, currentY + 5, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`RUT: ${companyRut}`, pageW - margin, currentY + 10, { align: 'right' });
  doc.text('DEPARTAMENTO DE PREVENCIÓN DE RIESGOS', pageW - margin, currentY + 15, { align: 'right' });

  currentY += 25;

  // Title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 54, 93);
  doc.text('COMPROBANTE DE RECEPCIÓN REGLAMENTO INTERNO', pageW / 2, currentY, { align: 'center' });
  currentY += 6;
  doc.text('(RIOHS - VERSIÓN DIGITAL)', pageW / 2, currentY, { align: 'center' });

  currentY += 15;

  // Paragraph 1 with Inline BOLD Worker & Company Data
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);

  const cleanWorkerName = workerName.trim().toUpperCase();
  const cleanRut = workerRut.trim();
  const cleanCompName = companyName.trim().toUpperCase();

  const chunksP1: TextChunk[] = [
    { text: 'Yo, ' },
    { text: cleanWorkerName, bold: true },
    { text: ', Cédula de Identidad N° ' },
    { text: cleanRut, bold: true },
    { text: ', declaro recepción y lectura de forma digital de una copia del Reglamento Interno de Orden, Higiene y Seguridad de la empresa ' },
    { text: `${cleanCompName} RUT ${companyRut}`, bold: true },
    { text: ', de acuerdo a lo establecido en el artículo 156 inciso 2 del Código del Trabajo y ordinario: 4417/ 21-sep-2017, el cual establece que "el empleador deberá entregar gratuitamente a los trabajadores un ejemplar del reglamento interno de la empresa y el reglamento a que se refiere la Ley N° 16.744".' },
  ];

  currentY = printStyledParagraph(doc, chunksP1, margin, currentY, usableW, 6);
  currentY += 10;

  // Paragraph 2
  const chunksP2: TextChunk[] = [
    { text: 'Asumo que es mi responsabilidad leer su contenido y dar cabal cumplimiento a las obligaciones, prohibiciones, normas de orden, higiene y seguridad que en él están escritas, como así también a las disposiciones y procedimientos que en forma posterior se emitan y/o se modifiquen y que formen parte integral de éste.' }
  ];
  currentY = printStyledParagraph(doc, chunksP2, margin, currentY, usableW, 6);

  currentY += 35;

  // Handwritten Signature Block (matching template Image 2)
  const col1X = margin;
  const col1W = 85;
  const col2X = pageW - margin - 60;
  const col2W = 60;

  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.4);

  // Left signature line (Nombre del Trabajador)
  doc.line(col1X, currentY, col1X + col1W, currentY);
  // Right signature line (Firma del Trabajador)
  doc.line(col2X, currentY, col2X + col2W, currentY);

  currentY += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text('Nombre del Trabajador', col1X + col1W / 2, currentY, { align: 'center' });
  doc.text('Firma del Trabajador', col2X + col2W / 2, currentY, { align: 'center' });

  currentY += 16;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text('(El trabajador debe escribir de su puño y letra). Este comprobante se archivará en la carpeta personal del trabajador.', margin, currentY);

  currentY += 15;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Fecha:    ______/______ /________/', margin, currentY);

  // Download trigger
  const fileName = `RECEPCION_RIOHS_${cleanRut.replace(/[^0-9kK]/g, '')}.pdf`;
  doc.save(fileName);
}
