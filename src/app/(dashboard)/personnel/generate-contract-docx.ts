'use client';

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Formats an ISO date string (YYYY-MM-DD) to Spanish long form.
 * e.g. "2025-03-15" → "15 de marzo de 2025"
 */
function formatDateToLetters(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${day} de ${MONTHS_ES[monthIdx]} de ${year}`;
}

interface PersonForContract {
  first_name: string;
  last_name_father: string;
  last_name_mother?: string;
  rut: string;
  nationality?: string | null;
  marital_status?: string | null;
  birth_date?: string | null;
  address?: {
    street?: string;
    comuna?: string;
    city?: string;
  } | null;
  hire_date?: string | null;
  afp?: string | null;
  health_system?: string | null;
  isapre?: string | null;
}

/**
 * Generates a CONTRATO TICA Word document (.docx) with the worker's data filled in,
 * and triggers a browser download.
 */
export async function generateContractDocx(person: PersonForContract) {
  // 1. Fetch the template from public/templates/
  const response = await fetch('/templates/CONTRATO_TICA.docx');
  if (!response.ok) {
    throw new Error('No se pudo cargar la plantilla del contrato');
  }
  const arrayBuffer = await response.arrayBuffer();

  // 2. Load the template into PizZip
  const zip = new PizZip(arrayBuffer);

  // 3. Create Docxtemplater instance with « » delimiters
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '«', end: '»' },
    paragraphLoop: true,
    linebreaks: true,
  });

  // 4. Build the full name
  const fullName = [person.first_name, person.last_name_father, person.last_name_mother]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  // 5. Determine health/salud value
  const saludValue = person.health_system === 'ISAPRE' && person.isapre
    ? person.isapre.toUpperCase()
    : (person.health_system || '').toUpperCase();

  // 6. Set template data
  doc.render({
    NOMBRE_COMPLETO: fullName,
    RUT: person.rut || '',
    NACIONALIDAD: (person.nationality || 'CHILENA').toUpperCase(),
    ESTADO_CIVIL: (person.marital_status || '').toUpperCase(),
    FECHA_DE_NACIMIENTO_LETRAS: formatDateToLetters(person.birth_date),
    DOMICILO: (person.address?.street || '').toUpperCase(),
    COMUNA: (person.address?.comuna || '').toUpperCase(),
    CIUDAD: (person.address?.city || '').toUpperCase(),
    FECHA_DE_INGRESO_LETRAS: formatDateToLetters(person.hire_date),
    AFP: (person.afp || '').toUpperCase(),
    SALUD: saludValue,
  });

  // 7. Generate the output .docx
  const output = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  // 8. Download with the correct filename
  const workerName = `${person.first_name} ${person.last_name_father}`.toUpperCase().trim();
  saveAs(output, `CONTRATO TICA ${workerName}.docx`);
}
