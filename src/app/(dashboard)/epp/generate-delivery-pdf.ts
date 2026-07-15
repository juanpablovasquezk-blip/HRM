'use client';

import { jsPDF } from 'jspdf';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface CompanyDetails {
  name: string;
  rut?: string;
  giro?: string;
}

interface WorkerDetails {
  first_name: string;
  last_name_father: string;
  last_name_mother?: string;
  rut: string;
  positionName: string;
  areaName: string;
}

interface DeliveryItemPDF {
  productName: string;
  productType: 'UNIFORM' | 'EPP';
  size: string;
  quantity: number;
  reason: 'FIRST_TIME' | 'EXPIRATION' | 'DAMAGE' | 'PAST_DELIVERY';
}

export interface DeliveryPDFParams {
  company: CompanyDetails;
  worker: WorkerDetails;
  deliveryDate: string;
  items: DeliveryItemPDF[];
  delivererName: string;
}

// Helper to load image
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
  });
}

export async function generateDeliveryFormPDF(params: DeliveryPDFParams) {
  const { company, worker, deliveryDate, items, delivererName } = params;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4', // 210 x 297 mm
  });

  const pageW = doc.internal.pageSize.getWidth();   // 210
  const pageH = doc.internal.pageSize.getHeight();  // 297
  const margin = 12;
  const usableW = pageW - margin * 2; // 186 mm

  let currentY = margin;

  // Colors
  const primaryColor = [26, 54, 93] as [number, number, number]; // Dark Navy (#1A365D)
  const secondaryColor = [237, 242, 247] as [number, number, number]; // Shaded Gray (#EDF2F7)
  const borderGray = [203, 213, 225] as [number, number, number]; // Slate-300
  const darkText = [30, 41, 59] as [number, number, number]; // Slate-800
  const lightText = [100, 116, 139] as [number, number, number]; // Slate-500

  const setFillColor = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setDrawColor = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
  const setTextColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

  // 1. Header (Logo & Company details)
  try {
    // Try to load Grupo Minerquim logo
    const logoImg = await loadImage('/logo.jpg');
    doc.addImage(logoImg, 'JPEG', margin, currentY, 38, 16);
  } catch (error) {
    try {
      const logoPng = await loadImage('/logo.png');
      doc.addImage(logoPng, 'PNG', margin, currentY, 38, 16);
    } catch (e) {
      // Fallback placeholder if logo fails to load
      doc.setFillColor(26, 54, 93);
      doc.rect(margin, currentY, 38, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text('GRUPO MINERQUIM', margin + 2, currentY + 8);
    }
  }

  // Company info on the right
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const compName = company.name.toUpperCase();
  const compRut = company.rut ? `R.U.T.: ${company.rut}` : 'R.U.T.: [Sin registrar]';
  const compGiro = company.giro ? `Giro: ${company.giro}` : 'Giro: Actividades de servicio';

  doc.text(compName, pageW - margin, currentY + 3.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(lightText[0], lightText[1], lightText[2]);
  doc.text(compRut, pageW - margin, currentY + 7.5, { align: 'right' });
  doc.text(compGiro, pageW - margin, currentY + 11.5, { align: 'right' });

  currentY += 19;

  // Title section
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, currentY, usableW, 8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('ENTREGA DE EPP Y UNIFORMES', margin + usableW / 2, currentY + 5.2, { align: 'center' });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('REGISTRO OBLIGATORIO - LEY Nº 16.744 / DECRETO SUPREMO Nº 594', margin + usableW / 2, currentY + 7.8, { align: 'center' });

  currentY += 10;

  // Legal Framework Box
  doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.rect(margin, currentY, usableW, 15, 'F');
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.setLineWidth(0.2);
  doc.rect(margin, currentY, usableW, 15);

  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Fundamento Legal:', margin + 3, currentY + 4);

  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.setFont('helvetica', 'normal');
  const legalText = 'En cumplimiento con el Artículo 184 del Código del Trabajo y el Decreto Supremo Nº 594 del Ministerio de Salud, el empleador está obligado a proporcionar a sus trabajadores de forma oportuna, gratuita y adecuada los Equipos de Protección Personal (EPP) y uniformes necesarios para el desempeño seguro de sus funciones. El trabajador se obliga a su cuidado y uso obligatorio durante toda su jornada laboral.';
  const splitLegal = doc.splitTextToSize(legalText, usableW - 6);
  doc.text(splitLegal, margin + 3, currentY + 7.5);

  currentY += 17.5;

  // Section 1: Worker Identification
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('1. IDENTIFICACIÓN DEL TRABAJADOR', margin, currentY + 3);
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY + 4.5, pageW - margin, currentY + 4.5);

  currentY += 6.5;

  // Grid for worker details
  const rowH = 6;
  const colW = usableW / 2;

  // Draw box outline for identification
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.setLineWidth(0.2);
  doc.rect(margin, currentY, usableW, rowH * 3);

  // Horizontal lines inside grid
  doc.line(margin, currentY + rowH, pageW - margin, currentY + rowH);
  doc.line(margin, currentY + rowH * 2, pageW - margin, currentY + rowH * 2);

  // Vertical line down the middle
  doc.line(margin + colW, currentY + rowH, margin + colW, currentY + rowH * 3);

  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);

  // Row 1: Nombre Completo
  const workerFullName = `${worker.first_name} ${worker.last_name_father} ${worker.last_name_mother || ''}`.toUpperCase();
  doc.text('Nombre Completo:', margin + 3, currentY + 4);
  doc.setFont('helvetica', 'normal');
  doc.text(workerFullName, margin + 30, currentY + 4);

  // Row 2: RUT & Cargo
  doc.setFont('helvetica', 'bold');
  doc.text('R.U.T.:', margin + 3, currentY + rowH + 4);
  doc.setFont('helvetica', 'normal');
  doc.text(worker.rut, margin + 15, currentY + rowH + 4);

  doc.setFont('helvetica', 'bold');
  doc.text('Cargo / Función:', margin + colW + 3, currentY + rowH + 4);
  doc.setFont('helvetica', 'normal');
  doc.text(worker.positionName.toUpperCase(), margin + colW + 28, currentY + rowH + 4);

  // Row 3: Área/Faena & Fecha de Entrega
  doc.setFont('helvetica', 'bold');
  doc.text('Área / Faena:', margin + 3, currentY + rowH * 2 + 4);
  doc.setFont('helvetica', 'normal');
  doc.text(worker.areaName.toUpperCase(), margin + 22, currentY + rowH * 2 + 4);

  doc.setFont('helvetica', 'bold');
  doc.text('Fecha de Entrega:', margin + colW + 3, currentY + rowH * 2 + 4);
  doc.setFont('helvetica', 'normal');

  let formattedDate = deliveryDate;
  try {
    const parsed = parseISO(deliveryDate);
    formattedDate = format(parsed, "dd / MM / yyyy", { locale: es });
  } catch (e) {}
  doc.text(formattedDate, margin + colW + 28, currentY + rowH * 2 + 4);

  currentY += rowH * 3 + 4;

  // Section 2: Items Delivered
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('2. REGISTRO DE IMPLEMENTOS Y EQUIPOS DE PROTECCIÓN ENTREGADOS', margin, currentY + 3);
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY + 4.5, pageW - margin, currentY + 4.5);

  currentY += 7.5;

  // Table header
  const th1 = 8;   // Nº
  const th2 = 22;  // Tipo (EPP o Uniforme)
  const th3 = 70;  // Prenda/Implemento
  const th4 = 30;  // Detalle/Talla
  const th5 = 18;  // Cant.
  const th6 = 38;  // Motivo

  const cellX1 = margin;
  const cellX2 = cellX1 + th1;
  const cellX3 = cellX2 + th2;
  const cellX4 = cellX3 + th3;
  const cellX5 = cellX4 + th4;
  const cellX6 = cellX5 + th5;

  const thH = 6.5;

  setFillColor(primaryColor);
  doc.rect(margin, currentY, usableW, thH, 'F');
  setDrawColor(borderGray);
  doc.setLineWidth(0.2);
  doc.rect(margin, currentY, usableW, thH);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');

  doc.text('Nº', cellX1 + th1 / 2, currentY + 4.2, { align: 'center' });
  doc.text('TIPO', cellX2 + th2 / 2, currentY + 4.2, { align: 'center' });
  doc.text('PRENDA / IMPLEMENTO', cellX3 + 3, currentY + 4.2);
  doc.text('TALLA / DETALLE', cellX4 + 3, currentY + 4.2);
  doc.text('CANT.', cellX5 + th5 / 2, currentY + 4.2, { align: 'center' });
  doc.text('MOTIVO ENTREGA', cellX6 + 3, currentY + 4.2);

  currentY += thH;

  // Table rows
  doc.setFontSize(6.5);
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);

  // If items list is empty, draw empty lines
  const displayItems = [...items];
  while (displayItems.length < 10) {
    displayItems.push({
      productName: '__________________________________',
      productType: 'EPP',
      size: '________',
      quantity: 0,
      reason: 'FIRST_TIME'
    });
  }

  const tdH = 6;

  displayItems.forEach((item, index) => {
    // Row background (zebra striping)
    if (index % 2 === 0) {
      setFillColor(secondaryColor);
      doc.rect(margin, currentY, usableW, tdH, 'F');
    }

    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.rect(margin, currentY, usableW, tdH);

    // Vertical line dividers
    doc.line(cellX2, currentY, cellX2, currentY + tdH);
    doc.line(cellX3, currentY, cellX3, currentY + tdH);
    doc.line(cellX4, currentY, cellX4, currentY + tdH);
    doc.line(cellX5, currentY, cellX5, currentY + tdH);
    doc.line(cellX6, currentY, cellX6, currentY + tdH);

    doc.setFont('helvetica', 'normal');

    // Nº
    doc.text((index + 1).toString(), cellX1 + th1 / 2, currentY + 4, { align: 'center' });

    // Tipo
    const isPlaceholder = item.quantity === 0;
    const typeLabel = isPlaceholder ? '' : (item.productType === 'UNIFORM' ? 'Uniforme' : 'EPP');
    doc.text(typeLabel, cellX2 + th2 / 2, currentY + 4, { align: 'center' });

    // Implemento
    doc.text(item.productName, cellX3 + 3, currentY + 4);

    // Talla
    const sizeLabel = isPlaceholder ? '' : item.size;
    doc.text(sizeLabel, cellX4 + 3, currentY + 4);

    // Cantidad
    const qtyLabel = isPlaceholder ? '' : item.quantity.toString();
    doc.text(qtyLabel, cellX5 + th5 / 2, currentY + 4, { align: 'center' });

    // Motivo
    let reasonText = '';
    if (!isPlaceholder) {
      switch (item.reason) {
        case 'FIRST_TIME': reasonText = 'Ingreso / Primera Vez'; break;
        case 'EXPIRATION': reasonText = 'Renovación por Vencimiento'; break;
        case 'DAMAGE': reasonText = 'Reemplazo por Deterioro'; break;
        case 'PAST_DELIVERY': reasonText = 'Registro Histórico'; break;
      }
    }
    doc.text(reasonText, cellX6 + 3, currentY + 4);

    currentY += tdH;
  });

  currentY += 4;

  // Section 3: Declaration of Obligatoriedad (Statement)
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('3. DECLARACIÓN DE OBLIGATORIEDAD Y COMPROMISO DEL TRABAJADOR', margin, currentY + 3);
  doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY + 4.5, pageW - margin, currentY + 4.5);

  currentY += 6.5;

  // Box with declaration text
  doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.rect(margin, currentY, usableW, 19, 'F');
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.setLineWidth(0.2);
  doc.rect(margin, currentY, usableW, 19);

  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  const declarationText = 'Por el presente acto, yo declaro haber recibido en conformidad y de forma absolutamente gratuita el equipamiento e indumentaria descritos en este documento, comprometiéndome a: (1) Utilizarlos de manera permanente y obligatoria durante mi jornada laboral; (2) Responsabilizarme de su correcto cuidado, higiene y mantención; (3) Informar inmediatamente en caso de pérdida, daño crítico o desgaste natural para proceder a su oportuna reposición; (4) Participar activamente en las capacitaciones brindadas sobre su uso y cuidado; (5) Comprender que está estrictamente prohibido alterar o retirar componentes de los equipos, constituyendo el no uso o descuido negligente una infracción grave a las normas internas de seguridad e higiene de la empresa.';
  const splitDeclaration = doc.splitTextToSize(declarationText, usableW - 6);
  doc.text(splitDeclaration, margin + 3, currentY + 4.5);

  currentY += 23;

  // Section 4: Signatures
  // Left: Worker signature
  const sigBoxW = usableW / 2 - 5;
  const sigBoxH = 18;

  // Draw signature line guides
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.setLineWidth(0.3);
  doc.line(margin + 5, currentY + sigBoxH, margin + 5 + sigBoxW - 10, currentY + sigBoxH);
  doc.line(margin + colW + 5, currentY + sigBoxH, margin + colW + 5 + sigBoxW - 10, currentY + sigBoxH);

  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');

  // Left printed info
  doc.text('Firma del Trabajador', margin + sigBoxW / 2, currentY + sigBoxH + 3.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Nombre: ${workerFullName}`, margin + 5, currentY + sigBoxH + 7);
  doc.text(`R.U.T.: ${worker.rut}`, margin + 5, currentY + sigBoxH + 10);

  // Right printed info
  doc.setFont('helvetica', 'bold');
  doc.text('Firma Entregado Por', margin + colW + sigBoxW / 2, currentY + sigBoxH + 3.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Nombre: ${delivererName.toUpperCase()}`, margin + colW + 5, currentY + sigBoxH + 7);
  doc.text('Cargo: Prevencionista / Representante', margin + colW + 5, currentY + sigBoxH + 10);

  // Footer page/legal markers
  doc.setFontSize(5);
  doc.setTextColor(lightText[0], lightText[1], lightText[2]);
  doc.text('Registro de Control de Seguridad - Ley 16.744 / D.S. 594', margin, pageH - 5);
  doc.text('Página 1 de 1', pageW - margin, pageH - 5, { align: 'right' });

  // Save the document
  const safeName = `${worker.last_name_father}_${worker.first_name}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  doc.save(`Acta_Entrega_${safeName}_${deliveryDate}.pdf`);
}
