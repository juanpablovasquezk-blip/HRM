import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

async function imageUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function renderPdfPageToImage(pdfUrl: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Inject script if not loaded
      if (!(window as any).pdfjsLib) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
        script.async = true;
        document.head.appendChild(script);
        
        let loaded = false;
        script.onload = () => { loaded = true; };
        
        // Wait up to 5s for the script to load
        for (let i = 0; i < 50; i++) {
          if (loaded && (window as any).pdfjsLib) break;
          await new Promise(r => setTimeout(r, 100));
        }
        
        if (!(window as any).pdfjsLib) {
          reject(new Error('No se pudo cargar la librería PDF.js desde CDN'));
          return;
        }
      }

      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas 2d context failed'));
        return;
      }
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      await page.render(renderContext).promise;
      
      const base64 = canvas.toDataURL('image/jpeg', 0.95);
      resolve(base64);
    } catch (err) {
      reject(err);
    }
  });
}

async function loadImageElementAndDimensions(url: string): Promise<{ base64: string; width: number; height: number; format: 'JPEG' | 'PNG' }> {
  const isPdf = url.toLowerCase().includes('.pdf');
  let base64 = '';
  let format: 'JPEG' | 'PNG' = 'JPEG';

  if (isPdf) {
    base64 = await renderPdfPageToImage(url);
    format = 'JPEG';
  } else {
    base64 = await imageUrlToBase64(url);
    if (base64.startsWith('data:image/png')) {
      format = 'PNG';
    }
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const width = img.naturalWidth || img.width || 600;
      const height = img.naturalHeight || img.height || 950;
      resolve({ base64, width, height, format });
    };
    img.onerror = () => {
      // Fallback to standard vertical ID card proportion if load fails
      resolve({ base64, width: 600, height: 950, format });
    };
    img.src = base64;
  });
}

interface GenerateActaParams {
  first_name: string;
  last_name_father: string;
  last_name_mother?: string | null;
  rut: string;
  main_position_name: string;
  credential_type: 'TICA' | 'PCP';
  refused_to_return: boolean;
  credential_number: string;
  credential_expiry: string;
  credential_image_url?: string | null;
  inactive_reason?: string | null;
}

export async function generateDismissalActa(params: GenerateActaParams) {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter',
    });

    const isTica = params.credential_type === 'TICA';
    const workerFullName = [params.first_name, params.last_name_father, params.last_name_mother]
      .filter(Boolean)
      .join(' ')
      .trim()
      .toUpperCase();

    // 1. Fetch logo and signature images
    let logoBase64 = '';
    let signatureBase64 = '';

    try {
      logoBase64 = await imageUrlToBase64('/templates/acta_image2.png');
    } catch (err) {
      console.warn('Could not load logo image, continuing without it', err);
    }

    try {
      signatureBase64 = await imageUrlToBase64('/templates/acta_image1.png');
    } catch (err) {
      console.warn('Could not load signature image, continuing without it', err);
    }

    // 2. Setup styles
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    // 3. Draw logo
    if (logoBase64) {
      const logoWidth = 45;
      const logoHeight = 45 / 2.04;
      doc.addImage(logoBase64, 'PNG', 25, 18, logoWidth, logoHeight);
    }

    // 4. Date and title
    const today = new Date();
    const formattedDate = today.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
    const capitalizedDate = formattedDate.replace(/^\w/, (c) => c.toUpperCase());

    doc.setFontSize(11);
    doc.text(`Santiago, ${capitalizedDate}`, 130, 45);

    // Recipient & Wording based on TICA / PCP
    let currentY = 55;
    doc.setFont('Helvetica', 'bold');
    doc.text('Señores', 25, currentY);
    
    currentY += 5;
    doc.setFont('Helvetica', 'bold');
    if (isTica) {
      doc.text('Oficina de Credenciales', 25, currentY);
    } else {
      doc.text('Oficina de Fiscalización', 25, currentY);
    }
    
    currentY += 5;
    doc.text('Dirección General de Aeronáutica Civil (DGAC)', 25, currentY);
    currentY += 5;
    doc.text('Aeropuerto Arturo Merino Benítez', 25, currentY);
    currentY += 5;
    doc.text('Presente', 25, currentY);

    // Title
    currentY += 15;
    doc.setFontSize(13);
    doc.setFont('Helvetica', 'bold');
    
    let titleText = '';
    if (params.refused_to_return) {
      titleText = isTica 
        ? 'NOTIFICACIÓN DE NO ENTREGA Y SOLICITUD DE BLOQUEO DE TICA' 
        : 'NOTIFICACIÓN DE NO ENTREGA Y SOLICITUD DE BLOQUEO DE PCP';
    } else {
      titleText = isTica 
        ? 'ACTA DE ENTREGA Y DEVOLUCIÓN DE CREDENCIAL TICA' 
        : 'ACTA DE ENTREGA Y DEVOLUCIÓN DE CREDENCIAL PCP';
    }
    
    doc.text(titleText, 105, currentY, { align: 'center' });

    // Underline title
    doc.setLineWidth(0.4);
    doc.line(25, currentY + 1.5, 185, currentY + 1.5);

    // Main text
    currentY += 12;
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'normal');
    const recipientOfficeName = isTica ? 'Oficina de Credenciales' : 'Oficina de Fiscalización';

    const cardNumText = params.credential_number || 'N/A';
    const expiryText = params.credential_expiry 
      ? new Date(params.credential_expiry).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'N/A';

    if (params.refused_to_return) {
      // FORMAT B: REFUSAL & BLOCK REQUEST
      const p1 = `En la ciudad de Santiago, a ${capitalizedDate}, mediante la presente comunicación, Minerquim Ltda., RUT 76.135.448-5, representada por don Juan Pablo Vásquez K., en su calidad de Gerente de Operaciones, informa formalmente a la ${recipientOfficeName} de la Dirección General de Aeronáutica Civil (DGAC) del Aeropuerto Arturo Merino Benítez, lo siguiente:`;
      const splitP1 = doc.splitTextToSize(p1, 165);
      doc.text(splitP1, 25, currentY);
      currentY += (splitP1.length * 5) + 6;

      doc.setFont('Helvetica', 'bold');
      doc.text('1. Antecedentes del trabajador desvinculado:', 25, currentY);
      currentY += 6;

      doc.setFont('Helvetica', 'normal');
      const detailsLines = [
        `• Nombre Completo: ${workerFullName}`,
        `• Cédula de Identidad (RUT): ${params.rut}`,
        `• Cargo desempeñado: ${params.main_position_name || 'Operador de Servicios'}`,
        `• Credencial asignada: ${params.credential_type} N° ${cardNumText} (Vigencia registrada: ${expiryText})`
      ];
      detailsLines.forEach(line => {
        doc.text(line, 28, currentY);
        currentY += 5;
      });
      currentY += 3;

      doc.setFont('Helvetica', 'bold');
      doc.text('2. Constancia de No Devolución y Solicitud de Bloqueo:', 25, currentY);
      currentY += 6;

      doc.setFont('Helvetica', 'normal');
      const p2 = `Se deja expresa constancia de que el trabajador individualizado ya no presta servicios para nuestra empresa. Habiéndosele requerido formalmente la restitución de su credencial institucional al momento de su desvinculación, el trabajador SE NEGÓ A HACER ENTREGA FÍSICA DE LA MISMA / NO EFECTUÓ SU DEVOLUCIÓN.`;
      const splitP2 = doc.splitTextToSize(p2, 165);
      doc.text(splitP2, 25, currentY);
      currentY += (splitP2.length * 5) + 5;

      const p3 = `Por lo anterior, y con el objeto de resguardar la seguridad de las operaciones aeroportuarias y evitar cualquier uso indebido o no autorizado, solicitamos a la DGAC proceder con lo que sea necesario para que esto no afecte en la seguridad del aeropuerto.`;
      const splitP3 = doc.splitTextToSize(p3, 165);
      doc.text(splitP3, 25, currentY);
      currentY += (splitP3.length * 5) + 6;

    } else {
      // FORMAT A: PHYSICAL DELIVERY ACTA
      const p1 = `En la ciudad de Santiago, a ${capitalizedDate}, en dependencias de la ${recipientOfficeName} de la Dirección General de Aeronáutica Civil (DGAC) del Aeropuerto Arturo Merino Benítez, comparece en representación de Minerquim Ltda., RUT 76.135.448-5, don Juan Pablo Vásquez K., en su calidad de Gerente de Operaciones, con el objeto de hacer entrega formal y material de la siguiente credencial:`;
      const splitP1 = doc.splitTextToSize(p1, 165);
      doc.text(splitP1, 25, currentY);
      currentY += (splitP1.length * 5) + 6;

      doc.setFont('Helvetica', 'bold');
      doc.text('1. Detalle de credencial entregada:', 25, currentY);
      currentY += 6;

      doc.setFont('Helvetica', 'normal');
      const labelCard = isTica ? 'TICA N°' : 'PCP N°';
      const detailsText = `${labelCard} ${cardNumText}, correspondiente al Sr.(a) ${workerFullName}, RUT ${params.rut}, con vigencia hasta el ${expiryText}.`;
      const splitDetails = doc.splitTextToSize(detailsText, 165);
      doc.text(splitDetails, 25, currentY);
      currentY += (splitDetails.length * 5) + 5;

      const requestText = `Se deja constancia de que este colaborador ya no presta servicios en Minerquim Ltda., por lo que se hace entrega física de la tarjeta y se solicita a la DGAC proceder a la baja administrativa y técnica correspondiente en los registros aeroportuarios.`;
      const splitRequest = doc.splitTextToSize(requestText, 165);
      doc.text(splitRequest, 25, currentY);
      currentY += (splitRequest.length * 5) + 6;
    }

    // 2. Signatures section
    doc.setFont('Helvetica', 'bold');
    doc.text(params.refused_to_return ? '3. Constancia de emisión y recepción:' : '2. Entrega y recepción:', 25, currentY);
    currentY += 5;

    // Draw signature of Juan Pablo K.
    if (signatureBase64) {
      const sigWidth = 35;
      const sigHeight = 35 / 3.29;
      doc.addImage(signatureBase64, 'PNG', 25, currentY + 1, sigWidth, sigHeight);
      currentY += sigHeight + 4;
    } else {
      currentY += 7;
    }

    const initialYForSigs = currentY;
    
    // Left column: Minerquim
    doc.setFont('Helvetica', 'bold');
    doc.text(params.refused_to_return ? 'Emitido y Notificado por:' : 'Entregado por:', 25, currentY);
    currentY += 5;
    doc.setFont('Helvetica', 'normal');
    doc.text('Nombre: Juan Pablo Vásquez K.', 25, currentY);
    currentY += 5;
    doc.text('RUT: 9.326.241-7', 25, currentY);
    currentY += 5;
    doc.text('Minerquim LTDA. 76.135.448-5', 25, currentY);

    // Right column: Recipient (DGAC)
    let dgacY = initialYForSigs;
    doc.setFont('Helvetica', 'bold');
    doc.text('Recepción D.G.A.C.:', 110, dgacY);
    dgacY += 5;
    doc.setFont('Helvetica', 'normal');
    doc.text('Nombre: ________________________', 110, dgacY);
    dgacY += 5;
    doc.text('RUT:    ________________________', 110, dgacY);
    dgacY += 5;
    doc.text('Fecha / Timbre: _______________', 110, dgacY);

    // Y coordinate reset
    currentY = Math.max(currentY + 10, dgacY + 10);

    // Closing footer
    const closeText = params.refused_to_return
      ? 'La presente notificación se emite en dos ejemplares de igual tenor para constancia y registro del proceso de baja y bloqueo de credencial.'
      : 'En constancia de lo anterior, se firma la presente acta en dos ejemplares de igual tenor y fecha, quedando uno en poder de la DGAC y otro en poder de Minerquim Ltda.';
    const splitClose = doc.splitTextToSize(closeText, 165);
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(10);
    doc.text(splitClose, 25, currentY);

    // PAGE 2: Digital copy of credential card (if exists)
    if (params.credential_image_url) {
      try {
        const isPdf = params.credential_image_url.toLowerCase().includes('.pdf');
        if (isPdf) {
          toast.info('Renderizando credencial PDF para impresión...');
        }

        const cardData = await loadImageElementAndDimensions(params.credential_image_url);

        doc.addPage();
        
        // 1. Logo Minerquim on Page 2 header
        if (logoBase64) {
          const logoWidth = 35;
          const logoHeight = 35 / 2.04;
          doc.addImage(logoBase64, 'PNG', 25, 14, logoWidth, logoHeight);
        }

        // 2. Page 2 Header Title
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42); // slate-900
        const anexoTitle = params.refused_to_return 
          ? `ANEXO: COPIA DE CREDENCIAL ${params.credential_type} A BLOQUEAR`
          : `ANEXO: COPIA DE CREDENCIAL ${params.credential_type} ENTREGADA`;
        doc.text(anexoTitle, 105, 22, { align: 'center' });

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text('Dirección General de Aeronáutica Civil (DGAC) - AMB', 105, 27, { align: 'center' });
        
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(0.4);
        doc.line(25, 31, 190, 31);

        // 3. Employee & Credential summary card
        doc.setFillColor(248, 250, 252); // slate-50
        doc.roundedRect(25, 35, 165, 21, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(25, 35, 165, 21, 2, 2, 'D');

        doc.setFontSize(9);
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(51, 65, 85); // slate-700
        doc.text('Trabajador:', 29, 42);
        doc.setFont('Helvetica', 'normal');
        doc.text(workerFullName, 51, 42);

        doc.setFont('Helvetica', 'bold');
        doc.text('RUT:', 29, 49);
        doc.setFont('Helvetica', 'normal');
        doc.text(params.rut, 51, 49);

        doc.setFont('Helvetica', 'bold');
        doc.text('Credencial:', 118, 42);
        doc.setFont('Helvetica', 'normal');
        doc.text(`${params.credential_type} N° ${cardNumText}`, 138, 42);

        doc.setFont('Helvetica', 'bold');
        doc.text('Vigencia:', 118, 49);
        doc.setFont('Helvetica', 'normal');
        doc.text(expiryText, 138, 49);

        // 4. Calculate optimal card image dimensions preserving strict aspect ratio
        const maxAreaW = 115;  // mm
        const maxAreaH = 165;  // mm
        const aspect = cardData.width / cardData.height;

        let cardW = maxAreaW;
        let cardH = maxAreaW / aspect;

        if (cardH > maxAreaH) {
          cardH = maxAreaH;
          cardW = maxAreaH * aspect;
        }

        // Center within available bounds (Y from 60 to 240)
        const cardX = (215.9 - cardW) / 2;
        const availableHeight = 240 - 60;
        const cardY = 60 + (availableHeight - cardH) / 2;

        // Draw clean border/shadow frame around the badge
        doc.setFillColor(241, 245, 249); // slate-100
        doc.roundedRect(cardX - 1.5, cardY - 1.5, cardW + 3, cardH + 3, 2, 2, 'F');
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.setLineWidth(0.4);
        doc.roundedRect(cardX - 1.5, cardY - 1.5, cardW + 3, cardH + 3, 2, 2, 'D');

        // Draw image cleanly
        doc.addImage(cardData.base64, cardData.format, cardX, cardY, cardW, cardH, undefined, 'SLOW');

        // 5. Clean footer on Page 2
        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(
          'Documento anexo emitido por Minerquim Ltda. para respaldo y control de credenciales aeroportuarias.',
          105,
          255,
          { align: 'center' }
        );

      } catch (imgError: any) {
        console.warn('Error loading card copy image for PDF page 2:', imgError);
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(220, 38, 38);
        doc.text('ERROR: NO SE PUDO RENDERIZAR LA IMAGEN DE LA CREDENCIAL', 25, 70);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text('El documento está en formato PDF o no se pudo cargar. Descárgalo desde el sistema:', 25, 80);
        doc.setTextColor(37, 99, 235);
        doc.text(params.credential_image_url || '', 25, 86);
      }
    }

    const fileSuffix = `${params.first_name}_${params.last_name_father}`.toUpperCase().trim().replace(/\s+/g, '_');
    const docName = params.refused_to_return 
      ? `SOLICITUD_BLOQUEO_${params.credential_type}_${fileSuffix}.pdf`
      : `ACTA_ENTREGA_${params.credential_type}_${fileSuffix}.pdf`;

    doc.save(docName);
    
    if (params.refused_to_return) {
      toast.success(`Notificación de bloqueo de ${params.credential_type} descargada correctamente`);
    } else {
      toast.success(`Acta de entrega física de ${params.credential_type} descargada correctamente`);
    }
  } catch (error: any) {
    console.error('Error generating dismissal acta:', error);
    toast.error('Error al generar el acta PDF', {
      description: error.message || 'Intente de nuevo',
    });
  }
}
