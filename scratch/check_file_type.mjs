import * as fs from 'fs';
import * as path from 'path';

function printHeader(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    console.log(`${path.basename(filePath)} size:`, buffer.length);
    console.log(`${path.basename(filePath)} header (hex):`, buffer.slice(0, 16).toString('hex'));
    console.log(`${path.basename(filePath)} header (ascii):`, buffer.slice(0, 16).toString('ascii'));
  } catch (err) {
    console.error(err);
  }
}

printHeader(path.resolve('public', 'icon.png'));
printHeader(path.resolve('public', 'logo.png'));
printHeader(path.resolve('public', 'icon.jpg'));
printHeader(path.resolve('public', 'logo.jpg'));
