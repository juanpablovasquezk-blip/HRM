import * as fs from 'fs';

const openapi = JSON.parse(fs.readFileSync('scratch/openapi.json', 'utf8'));
const properties = openapi.definitions.personnel.properties;
console.log('Personnel columns in schema:', Object.keys(properties));
