/**
 * Carga una imagen base64 de selfie (1:1), la redimensiona y añade un banner negro
 * en la parte inferior con el Nombre Completo y RUT del trabajador en letras blancas y mayúsculas.
 * @param selfieBase64 Selfie original en Base64 (Data URI)
 * @param fullName Nombre completo del trabajador
 * @param rut RUT del trabajador
 * @returns Promesa que resuelve al Data URI de la nueva imagen etiquetada (JPEG)
 */
export function labelSelfie(
  selfieBase64: string,
  fullName: string,
  rut: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Evitar problemas de origen cruzado si viniera de URL
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 800; // Ancho y alto de la foto de perfil principal
        const bannerHeight = 130; // Altura del banner inferior para acomodar el texto
        
        canvas.width = size;
        canvas.height = size + bannerHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo obtener el contexto 2D del Canvas'));
          return;
        }

        // 1. Dibujar la selfie original escalada a 800x800
        ctx.drawImage(img, 0, 0, size, size);

        // 2. Dibujar el banner negro al fondo
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, size, size, bannerHeight);

        // 3. Estilo del texto
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Escribir el nombre completo en la primera línea (Mayúsculas)
        ctx.font = 'bold 26px Arial, Helvetica, sans-serif';
        const nameText = fullName.trim().toUpperCase();
        ctx.fillText(nameText, size / 2, size + 40);

        // Escribir el RUT en la segunda línea (Mayúsculas)
        ctx.font = 'bold 26px Arial, Helvetica, sans-serif';
        const rutText = `RUT: ${rut.trim().toUpperCase()}`;
        ctx.fillText(rutText, size / 2, size + 85);

        // Exportar a formato JPEG con buena calidad (90%)
        const resultBase64 = canvas.toDataURL('image/jpeg', 0.9);
        resolve(resultBase64);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      reject(new Error('Error al cargar la imagen de la selfie: ' + err));
    };

    img.src = selfieBase64;
  });
}
