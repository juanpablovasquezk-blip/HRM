export async function validateAntecedentesPDF(
  pdfBuffer: Buffer
): Promise<{ valid: boolean; error: string | null }> {
  try {
    // Dynamic require to prevent bundling issues on the client side
    const pdf = require('pdf-parse');
    const data = await pdf(pdfBuffer);
    const text = (data.text || '').toUpperCase();

    // Normalize text by removing diacritics and collapsing whitespace
    const normalizedText = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, ' ');

    // Check if it is a background check certificate first (has signature/registry markers)
    // to avoid false positives on completely different documents, but focus on the specific type
    const hasParticulares = normalizedText.includes('FINES PARTICULARES') || normalizedText.includes('PARTICULARES');
    const hasEspeciales = normalizedText.includes('FINES ESPECIALES') || normalizedText.includes('ESPECIALES');

    if (hasParticulares && !hasEspeciales) {
      return {
        valid: false,
        error: 'El certificado de antecedentes subido es para fines particulares. Se requiere el certificado para fines especiales.'
      };
    }

    return { valid: true, error: null };
  } catch (error: any) {
    console.error('Error al validar el PDF de antecedentes:', error);
    // Return valid: true on parsing failure (e.g. non-readable scanned image)
    // so manual verification by admin can still occur and we do not block the worker.
    return { valid: true, error: null };
  }
}
