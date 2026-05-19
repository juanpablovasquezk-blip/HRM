import * as fs from 'fs';
import * as path from 'path';

function getPngDimensions(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    // Verify PNG signature
    if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
      console.log(`${filePath} is NOT a valid PNG file!`);
      return null;
    }
    // Read width and height (big endian, 4 bytes each starting at offset 16)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return null;
  }
}

const iconPath = path.resolve('public', 'icon.png');
const logoPath = path.resolve('public', 'logo.png');

console.log('icon.png dimensions:', getPngDimensions(iconPath));
console.log('logo.png dimensions:', getPngDimensions(logoPath));
