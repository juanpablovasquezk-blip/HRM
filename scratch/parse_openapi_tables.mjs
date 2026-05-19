import * as fs from 'fs';

const openapi = JSON.parse(fs.readFileSync('scratch/openapi.json', 'utf8'));
const tables = Object.keys(openapi.definitions);
console.log('Tables in database:', tables);
