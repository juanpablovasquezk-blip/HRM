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
    doc.setFontSize(14);
    doc.setFont('Helvetica', 'bold');
    const titleText = isTica ? 'ACTA DE ENTREGA DE CREDENCIAL TICA' : 'ACTA DE ENTREGA DE CREDENCIAL PCP';
    doc.text(titleText, 105, currentY, { align: 'center' });

    // Underline title
    doc.setLineWidth(0.4);
    doc.line(45, currentY + 1.5, 165, currentY + 1.5);

    // Main paragraph
    currentY += 12;
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'normal');
    const recipientOfficeName = isTica ? 'Oficina de Credenciales' : 'Oficina de Fiscalización';
    
    const introText = `En la ciudad de Santiago, a ${capitalizedDate}, en dependencias de la ${recipientOfficeName} de la Dirección General de Aeronáutica Civil (DGAC) del Aeropuerto Arturo Merino Benítez, comparece en representación de Minerquim Ltda., RUT 76.135.448-5, don Juan Pablo Vásquez K., en su calidad de Gerente de Operaciones, con el objeto de hacer entrega formal de la siguiente credencial:`;
    
    const splitIntro = doc.splitTextToSize(introText, 165);
    doc.text(splitIntro, 25, currentY);
    currentY += (splitIntro.length * 5) + 6;

    // 1. Details section
    doc.setFont('Helvetica', 'bold');
    const section1Title = isTica ? '1. Detalle de TICA entregada:' : '1. Detalle de PCP entregada:';
    doc.text(section1Title, 25, currentY);
    currentY += 7;

    doc.setFont('Helvetica', 'normal');
    const labelCard = isTica ? 'TICA N°' : 'PCP N°';
    const cardNumText = params.credential_number || 'N/A';
    const expiryText = params.credential_expiry 
      ? new Date(params.credential_expiry).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'N/A';

    let detailsText = `${labelCard} ${cardNumText}, correspondiente al Sr.(a) ${workerFullName}, RUT ${params.rut}, con vigencia hasta el ${expiryText}.`;
    
    // Add special clause if refused to return
    if (params.refused_to_return) {
      detailsText = `Se deja expresa constancia que el/la trabajador(a) ${workerFullName}, RUT ${params.rut}, se negó a hacer entrega de su credencial ${params.credential_type}, quedando bajo su exclusiva responsabilidad la devolución directa a la autoridad competente.`;
    }

    const splitDetails = doc.splitTextToSize(detailsText, 165);
    doc.text(splitDetails, 25, currentY);
    currentY += (splitDetails.length * 5) + 6;

    // Request clause
    const requestText = `Se deja constancia que este trabajador ya no presta servicios en Minerquim Ltda., por lo que se solicita expresamente a la DGAC proceder a la baja administrativa y técnica de la mencionada credencial, a fin de evitar su uso no autorizado y mantener actualizados los registros de control.`;
    const splitRequest = doc.splitTextToSize(requestText, 165);
    doc.text(splitRequest, 25, currentY);
    currentY += (splitRequest.length * 5) + 8;

    // 2. Delivery & Reception section
    doc.setFont('Helvetica', 'bold');
    doc.text('2. Entrega y recepción:', 25, currentY);
    currentY += 7;

    // Drawing the signatures columns
    const initialYForSigs = currentY;
    
    // Left column: Minerquim / Juan Pablo
    doc.setFont('Helvetica', 'bold');
    doc.text('Entregado por:', 25, currentY);
    currentY += 5;
    doc.setFont('Helvetica', 'normal');
    doc.text('Nombre: Juan Pablo Vásquez K.', 25, currentY);
    currentY += 5;
    doc.text('RUT: 9.326.241-7', 25, currentY);
    currentY += 5;
    doc.text('Minerquim LTDA. 76.135.448-5', 25, currentY);

    if (signatureBase64) {
      const sigWidth = 35;
      const sigHeight = 35 / 3.29;
      doc.addImage(signatureBase64, 'PNG', 25, currentY + 2, sigWidth, sigHeight);
    }

    // Right column: Recipient (DGAC)
    let dgacY = initialYForSigs;
    doc.setFont('Helvetica', 'bold');
    doc.text('Recibido por:', 110, dgacY);
    dgacY += 5;
    doc.setFont('Helvetica', 'normal');
    doc.text('Nombre: ________________________', 110, dgacY);
    dgacY += 5;
    doc.text('RUT:    ________________________', 110, dgacY);
    dgacY += 5;
    doc.text('D.G.A.C.', 110, dgacY);

    // Signature line for worker in case of refusal
    currentY += 20;
    if (params.refused_to_return) {
      doc.setFont('Helvetica', 'bold');
      doc.text('Firma Trabajador:', 25, currentY + 5);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(220, 38, 38); // red color
      doc.text('SE NEGÓ A FIRMAR / ENTREGAR', 65, currentY + 5);
      doc.setTextColor(0, 0, 0); // reset
    }

    // Y coordinate reset
    currentY = Math.max(currentY + 12, dgacY + 15);

    // 3. Observations section
    doc.setFont('Helvetica', 'bold');
    doc.text('3. Observaciones:', 25, currentY);
    currentY += 6;
    doc.setFont('Helvetica', 'normal');
    const obsText = params.refused_to_return 
      ? 'El trabajador se negó a entregar la credencial física de manera voluntaria al momento de su desvinculación.' 
      : (params.inactive_reason ? `Baja operativa: ${params.inactive_reason}` : 'Entrega regular sin observaciones.');
    
    const splitObs = doc.splitTextToSize(obsText, 165);
    doc.text(splitObs, 25, currentY);
    currentY += (splitObs.length * 5) + 10;

    // Closing footer
    const closeText = 'En constancia de lo anterior, se firma la presente acta en dos ejemplares de igual tenor y fecha, quedando uno en poder de la DGAC y otro en poder de Minerquim Ltda.';
    const splitClose = doc.splitTextToSize(closeText, 165);
    doc.setFont('Helvetica', 'italic');
    doc.text(splitClose, 25, currentY);

    // PAGE 2: Digital copy of credential card (if exists)
    if (params.credential_image_url) {
      try {
        const cardBase64 = await imageUrlToBase64(params.credential_image_url);
        doc.addPage();
        
        // Page 2 header
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('ANEXO: COPIA DE CREDENCIAL ENTREGADA', 105, 25, { align: 'center' });
        
        doc.setLineWidth(0.4);
        doc.line(45, 27, 165, 27);
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(`Trabajador: ${workerFullName}`, 25, 38);
        doc.text(`RUT: ${params.rut}`, 25, 44);
        doc.text(`Tipo de Documento: Copia de Credencial ${params.credential_type}`, 25, 50);

        // Add Card Image (Centered)
        // Card size: ~90mm width, height based on standard card aspect ratio (~1.58)
        const cardWidth = 100;
        const cardHeight = 100 / 1.58;
        
        // Render it centered on page
        const cardX = (215.9 - cardWidth) / 2; // letter width is 215.9mm
        doc.addImage(cardBase64, 'JPEG', cardX, 70, cardWidth, cardHeight);
      } catch (imgError) {
        console.warn('Error loading card copy image for PDF page 2:', imgError);
      }
    }

    const fileSuffix = `${params.first_name}_${params.last_name_father}`.toUpperCase().trim().replace(/\s+/g, '_');
    doc.save(`ACTA_ENTREGA_${params.credential_type}_${fileSuffix}.pdf`);
    toast.success(`Acta de entrega ${params.credential_type} descargada correctamente`);
  } catch (error: any) {
    console.error('Error generating dismissal acta:', error);
    toast.error('Error al generar el acta PDF', {
      description: error.message || 'Intente de nuevo',
    });
  }
}
