'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

interface TicaLetterDownloadButtonProps {
  person: {
    first_name: string;
    last_name_father: string;
    last_name_mother?: string | null;
    rut: string;
  };
}

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

export function TicaLetterDownloadButton({ person }: TicaLetterDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter',
      });

      // 1. Load logo and signature images from public templates directory
      let logoBase64 = '';
      let signatureBase64 = '';
      try {
        logoBase64 = await imageUrlToBase64('/templates/tica_image_1.jpeg');
      } catch (err) {
        console.warn('Could not load logo image, continuing without it', err);
      }
      try {
        signatureBase64 = await imageUrlToBase64('/templates/tica_image_3.jpg');
      } catch (err) {
        console.warn('Could not load signature image, continuing without it', err);
      }

      // 2. Setup document formatting
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      // 3. Draw header logo if loaded
      if (logoBase64) {
        // Logo size: 30mm width, height based on aspect ratio 1.509
        const logoWidth = 30;
        const logoHeight = 30 / 1.509;
        doc.addImage(logoBase64, 'JPEG', 25, 20, logoWidth, logoHeight);
      }

      // 4. Today's date (top right)
      const today = new Date();
      const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' };
      const formattedDate = today.toLocaleDateString('es-CL', options);
      const chileDateStr = formattedDate.replace(/^\w/, (c) => c.toUpperCase()); // Capitalize first letter

      doc.setFontSize(11);
      doc.text(`Santiago, ${chileDateStr}`, 130, 50);

      // 5. Recipient
      let currentY = 65;
      doc.setFont('Helvetica', 'bold');
      doc.text('Señores', 25, currentY);
      doc.setFont('Helvetica', 'normal');
      currentY += 5;
      doc.text('Oficina de Credenciales', 25, currentY);
      currentY += 5;
      doc.text('Dirección General de Aeronáutica Civil (DGAC)', 25, currentY);
      currentY += 5;
      doc.setFont('Helvetica', 'bold');
      doc.text('Presente', 25, currentY);

      // 6. Subject (Asunto)
      currentY += 15;
      const workerFullName = [person.first_name, person.last_name_father, person.last_name_mother]
        .filter(Boolean)
        .join(' ')
        .trim()
        .toUpperCase();

      doc.setFont('Helvetica', 'bold');
      const subjectText = `Asunto: Solicitud de emisión de credencial TICA Zona 5 para ${workerFullName}`;
      const splitSubject = doc.splitTextToSize(subjectText, 165);
      doc.text(splitSubject, 25, currentY);
      currentY += (splitSubject.length * 5) + 8;

      // 7. Salutation
      doc.setFont('Helvetica', 'normal');
      doc.text('De nuestra consideración:', 25, currentY);
      currentY += 8;

      // 8. Paragraph 1
      const p1 = 'Junto con saludarles cordialmente, me dirijo a ustedes en representación de la empresa Minerquim Ltda. con el propósito de solicitar formalmente la emisión de la Tarjeta de Identificación Control de Acceso (TICA) Zona 5 para nuestro funcionario:';
      const splitP1 = doc.splitTextToSize(p1, 165);
      doc.text(splitP1, 25, currentY);
      currentY += (splitP1.length * 5) + 6;

      // 9. Personnel Details (bullet points)
      doc.setFont('Helvetica', 'bold');
      doc.text('Nombre Completo:', 35, currentY);
      doc.setFont('Helvetica', 'normal');
      doc.text(workerFullName, 75, currentY);
      currentY += 6;

      doc.setFont('Helvetica', 'bold');
      doc.text('RUT:', 35, currentY);
      doc.setFont('Helvetica', 'normal');
      doc.text(person.rut.toUpperCase(), 75, currentY);
      currentY += 6;

      doc.setFont('Helvetica', 'bold');
      doc.text('Cargo / Función:', 35, currentY);
      doc.setFont('Helvetica', 'normal');
      doc.text('Operador de Servicios', 75, currentY);
      currentY += 10;

      // 10. Paragraph 2
      const p2 = 'El motivo de esta solicitud se fundamenta en que el colaborador individualizado requiere acceso a la Zona Primaria / Salas de Embarque y Check-in para el desarrollo de sus funciones operativas. Entre sus tareas principales se encuentran el servicio de retiro de mercancías prohibidas en sala de embarque, así como la atención a requerimientos esporádicos de captura e intervención de canes en las zonas de Check-in y salas de embarque del Aeropuerto.';
      const splitP2 = doc.splitTextToSize(p2, 165);
      doc.text(splitP2, 25, currentY);
      currentY += (splitP2.length * 5) + 5;

      // 11. Paragraph 3
      const p3 = 'Como empresa, reafirmamos nuestro compromiso con el cumplimiento estricto de la normativa aeronáutica y las directrices de seguridad dictadas por la DGAC, asegurando que nuestro personal desempeñe sus labores bajo los más altos estándares de control y rigurosidad.';
      const splitP3 = doc.splitTextToSize(p3, 165);
      doc.text(splitP3, 25, currentY);
      currentY += (splitP3.length * 5) + 5;

      // 12. Salutation Close
      const p4 = 'Agradeciendo de antemano su gestión y favorable acogida a la presente solicitud, se despide atentamente,';
      const splitP4 = doc.splitTextToSize(p4, 165);
      doc.text(splitP4, 25, currentY);
      currentY += (splitP4.length * 5) + 8;

      // 13. Signature
      doc.text('Atentamente,', 25, currentY);

      if (signatureBase64) {
        // Signature size: 55mm width, height based on aspect ratio 3.135
        const sigWidth = 55;
        const sigHeight = 55 / 3.135;
        doc.addImage(signatureBase64, 'JPEG', 25, currentY + 3, sigWidth, sigHeight);
      }

      currentY += 25;
      doc.setFont('Helvetica', 'bold');
      doc.text('Gabriel Acuña Barraza', 25, currentY);
      doc.setFont('Helvetica', 'normal');
      currentY += 5;
      doc.text('Gerente General', 25, currentY);
      currentY += 5;
      doc.text('Minerquim Ltda.', 25, currentY);

      // 14. Save PDF file
      const workerFileSuffix = `${person.first_name}_${person.last_name_father}`.toUpperCase().trim().replace(/\s+/g, '_');
      doc.save(`CARTA_TICA_5_${workerFileSuffix}.pdf`);

      toast.success('Carta TICA generada y descargada exitosamente en PDF');
    } catch (error: any) {
      console.error('Error generating letter PDF:', error);
      toast.error('Error al generar la carta en PDF', {
        description: error.message || 'Intente nuevamente',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="border-sky-200 text-sky-700 hover:bg-sky-50 gap-1.5"
      onClick={handleDownload}
      disabled={isGenerating}
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
      Descargar Carta TICA (PDF)
    </Button>
  );
}
