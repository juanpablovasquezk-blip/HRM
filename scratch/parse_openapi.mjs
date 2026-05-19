import * as fs from 'fs';

const spec = JSON.parse(fs.readFileSync('scratch/openapi.json', 'utf8'));

console.log('--- DEFINITIONS FOUND IN OPENAPI SPEC ---');
const tables = ['shift_assignments', 'roster_audit_logs', 'transport_requests'];

tables.forEach(t => {
  const def = spec.definitions[t];
  if (def) {
    console.log(`\nTable: ${t}`);
    const props = def.properties;
    Object.keys(props).forEach(col => {
      console.log(`  - ${col}: type=${props[col].type}, format=${props[col].format || 'none'}, description=${props[col].description || 'none'}`);
    });
  } else {
    console.log(`\nTable: ${t} not found in definitions!`);
  }
});
