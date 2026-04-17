require('ts-node').register();
const { generateSchedule } = require('./src/lib/scheduler/index');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function simulate() {
  console.log('--- SIMULACIÓN DE MOTOR (ABRIL 2026) ---');
  try {
    const result = await generateSchedule('2026-04-01', '2026-04-30');
    console.log('--- RESULTADO FINAL ---');
    console.log('Cobertura:', result.coverage, '%');
    console.log('Asignaciones:', result.count);
  } catch (err) {
    console.error('ERROR EN SIMULACIÓN:', err);
  }
}

simulate();
