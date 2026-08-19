'use client';

import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ReceptionPDFParams {
  workerName: string;
  workerRut: string;
  companyName: string;
  companyRut: string;
  sentAt?: string | Date | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
  });
}

export async function generateReceptionPDF(params: ReceptionPDFParams) {
  const { workerName, workerRut, companyName, companyRut, sentAt } = params;

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

  // Body Text Paragraph 1
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);

  const cleanWorkerName = workerName.trim().toUpperCase();
  const cleanRut = workerRut.trim();
  const cleanCompName = companyName.trim().toUpperCase();

  const sendDateObj = sentAt ? new Date(sentAt) : new Date();
  const dateFormattedStr = format(sendDateObj, "dd 'de' MMMM 'de' yyyy 'a las' HH:mm 'hrs'", { locale: es });

  const p1Text = `Yo, ${cleanWorkerName}, Cédula de Identidad N° ${cleanRut}, declaro recepción y lectura de forma digital de una copia del Reglamento Interno de Orden, Higiene y Seguridad de la empresa ${cleanCompName} RUT ${companyRut}, enviado por correo electrónico el ${dateFormattedStr}, de acuerdo a lo establecido en el artículo 156 inciso 2 del Código del Trabajo y ordinario 4417/ 21-sep-2017, el cual establece que "el empleador deberá entregar gratuitamente a los trabajadores un ejemplar del reglamento interno de la empresa y el reglamento a que se refiere la Ley N° 16.744".`;

  const linesP1 = doc.splitTextToSize(p1Text, usableW);
  doc.text(linesP1, margin, currentY, { align: 'justify', maxWidth: usableW });

  currentY += linesP1.length * 6 + 10;

  // Paragraph 2
  const p2Text = 'Asumo que es mi responsabilidad leer su contenido y dar cabal cumplimiento a las obligaciones, prohibiciones, normas de orden, higiene y seguridad que en él están escritas, como así también a las disposiciones y procedimientos que en forma posterior se emitan y/o se modifiquen y que formen parte integral de éste.';
  const linesP2 = doc.splitTextToSize(p2Text, usableW);
  doc.text(linesP2, margin, currentY, { align: 'justify', maxWidth: usableW });

  currentY += linesP2.length * 6 + 30;

  // Date line
  const todayStr = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha de Emisión: ${todayStr}`, margin, currentY);

  currentY += 25;

  // Worker Signature line
  const sigX = pageW / 2 - 45;
  doc.setDrawColor(100, 116, 139);
  doc.line(sigX, currentY, sigX + 90, currentY);
  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(cleanWorkerName, pageW / 2, currentY, { align: 'center' });
  currentY += 4;
  doc.setFont('helvetica', 'normal');
  doc.text(`RUT: ${cleanRut}`, pageW / 2, currentY, { align: 'center' });
  currentY += 4;
  doc.text('Firma del Trabajador', pageW / 2, currentY, { align: 'center' });

  currentY += 20;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  doc.text('(El trabajador debe escribir de su puño y letra). Este comprobante se archivará en la carpeta personal del trabajador.', pageW / 2, currentY, { align: 'center' });

  // Download trigger
  const fileName = `RECEPCION_RIOHS_${cleanRut.replace(/[^0-9kK]/g, '')}.pdf`;
  doc.save(fileName);
}
