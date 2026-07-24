import { jsPDF } from 'jspdf';

/**
 * Compila dos imágenes (frontal y trasera) en un único archivo PDF tamaño Carta vertical.
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

  // Dimensiones sugeridas para las tarjetas (proporción estándar de cédulas chilenas ~1.586)
  // Ancho: 125 mm. Alto: 125 / 1.586 ≈ 78.8 mm
  const cardWidth = 125;
  const cardHeight = 78.8;
  const x = (215.9 - cardWidth) / 2; // Centrado horizontalmente (45.45 mm)

  // Posicionamiento vertical para un balance limpio en la hoja
  const frontY = 40;  // Margen superior para el frontis
  const backY = 145;  // Margen superior para la trasera

  // Determinar formato de imagen de origen (PNG o JPEG)
  const getFormat = (base64: string): 'PNG' | 'JPEG' => {
    if (base64.toLowerCase().includes('image/png')) {
      return 'PNG';
    }
    return 'JPEG';
  };

  // Agregar ambas imágenes
  doc.addImage(
    frontBase64,
    getFormat(frontBase64),
    x,
    frontY,
    cardWidth,
    cardHeight,
    undefined,
    'FAST'
  );

  doc.addImage(
    backBase64,
    getFormat(backBase64),
    x,
    backY,
    cardWidth,
    cardHeight,
    undefined,
    'FAST'
  );

  // Retornar en formato de Data URI para poder enviarlo por JSON
  return doc.output('datauristring');
}
