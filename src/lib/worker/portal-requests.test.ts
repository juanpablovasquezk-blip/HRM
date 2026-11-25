import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appliesFiveDayTwoOffWeeklyRule,
  buildWorkerMonthSelectorOptions,
  evaluateWorkerPendingDocuments,
  expandDateRange,
  getMonthDeadlineDateString,
  getSantiagoDateString,
  isMonthOpenForWorkerRequest,
  validateWeeklyFreeDayQuota,
} from './portal-requests';

test('Portal trabajador: fechas límite en horario de Santiago y selector de meses el 25-11-2026', () => {
  const nov25 = new Date('2026-11-25T23:59:00-03:00');
  assert.equal(getSantiagoDateString(nov25), '2026-11-25');
  assert.equal(getMonthDeadlineDateString('2026-12'), '2026-11-20');
  assert.equal(isMonthOpenForWorkerRequest('2026-12', nov25), false);
  assert.equal(isMonthOpenForWorkerRequest('2027-01', nov25), true);
  assert.equal(isMonthOpenForWorkerRequest('2027-02', nov25), true);

  const options = buildWorkerMonthSelectorOptions(nov25);
  assert.equal(options.find((o) => o.yearMonth === '2026-12')?.isOpen, false);
  assert.equal(options.find((o) => o.yearMonth === '2027-01')?.isOpen, true);
  assert.equal(options.find((o) => o.yearMonth === '2027-02')?.isOpen, true);

  // Vacaciones 1-3 enero 2027 pertenecen a enero (abierto)
  const janRange = expandDateRange('2027-01-01', '2027-01-03');
  assert.deepEqual(janRange, ['2027-01-01', '2027-01-02', '2027-01-03']);
  assert.equal(
    janRange.every((d) => isMonthOpenForWorkerRequest(d.slice(0, 7), nov25)),
    true
  );
});

test('Portal trabajador: evaluación de documentos pendientes (Faltante, Vencido, Rechazado, En revisión)', () => {
  const defs = [
    { id: 'd1', name: 'TICA', is_mandatory: true },
    { id: 'd2', name: 'Licencia de Conducir', is_mandatory: true },
    { id: 'd3', name: 'Cédula de Identidad', is_mandatory: true },
    { id: 'd4', name: 'Certificado Antecedentes', is_mandatory: true },
    { id: 'd5', name: 'Contrato', is_mandatory: true },
  ];
  const docs = [
    { definition_id: 'd2', status: 'APPROVED', expiration_date: '2026-11-10' },
    { definition_id: 'd3', status: 'REJECTED', rejection_reason: 'Borrosa' },
    { definition_id: 'd4', status: 'PENDING', expiration_date: '2027-05-01' },
    { definition_id: 'd5', status: 'APPROVED', expiration_date: '2027-12-31' },
  ];

  const items = evaluateWorkerPendingDocuments({
    definitions: defs,
    existingDocuments: docs,
    todayStr: '2026-11-25',
  });

  const byName = new Map(items.map((i) => [i.name, i]));
  assert.equal(byName.get('TICA')?.status, 'MISSING');
  assert.equal(byName.get('Licencia de Conducir')?.status, 'EXPIRED');
  assert.equal(byName.get('Cédula de Identidad')?.status, 'REJECTED');
  assert.equal(byName.get('Certificado Antecedentes')?.status, 'IN_REVIEW');
  assert.equal(byName.has('Contrato'), false);
});

test('Portal trabajador: cupo semanal 5x2 con cumpleaños el miércoles y semana que cruza de mes', () => {
  // Cumpleaños miércoles 2027-01-13
  const r1 = validateWeeklyFreeDayQuota({
    rotationPattern: '5x2',
    birthDate: '1992-01-13',
    existingFreeRequests: [
      {
        start_date: '2027-01-14',
        end_date: '2027-01-14',
        type: 'other',
        status: 'pending',
        reason: 'Solicitud mensual de días libres',
      },
    ],
    selectedDates: ['2027-01-15'],
  });
  assert.equal(r1.valid, false);
  assert.match(r1.message || '', /miércoles ya tienes libre por tu cumpleaños.*jueves/i);

  // Jueves y viernes seleccionados juntos
  const r2 = validateWeeklyFreeDayQuota({
    rotationPattern: '5x2',
    birthDate: '1992-01-13',
    existingFreeRequests: [],
    selectedDates: ['2027-01-14', '2027-01-15'],
  });
  assert.equal(r2.valid, false);
  assert.match(r2.message || '', /miércoles ya tienes libre por tu cumpleaños/i);

  // Semana que cruza de mes (2027-03-29..2027-04-04): cumpleaños 31-03 (miércoles), ya pidió 01-04 (jueves), intenta 02-04 (viernes)
  const rCross = validateWeeklyFreeDayQuota({
    rotationPattern: '5x2',
    birthDate: '1992-03-31',
    existingFreeRequests: [
      {
        start_date: '2027-04-01',
        end_date: '2027-04-01',
        type: 'other',
        status: 'approved',
        reason: 'Solicitud mensual de días libres',
      },
    ],
    selectedDates: ['2027-04-02'],
  });
  assert.equal(rCross.valid, false);
  assert.match(rCross.message || '', /miércoles ya tienes libre por tu cumpleaños.*jueves/i);

  // Regímenes alineados con HRM v2: 5X2, BLUE_DIA-3, L-V aplican; 4X4_NOCHE titular queda fuera
  assert.equal(appliesFiveDayTwoOffWeeklyRule({ rotationPattern: '5x2', requiresShifts: true }), true);
  assert.equal(appliesFiveDayTwoOffWeeklyRule({ rotationPattern: 'BLUE_DIA-3', requiresShifts: true }), true);
  assert.equal(appliesFiveDayTwoOffWeeklyRule({ rotationPattern: 'l-v', requiresShifts: true }), true);
  assert.equal(appliesFiveDayTwoOffWeeklyRule({ rotationPattern: '4x4_noche', ns22AnchorDate: '2026-12-14', requiresShifts: true }), false);

  const rBlue = validateWeeklyFreeDayQuota({
    rotationPattern: 'BLUE_DIA-3',
    birthDate: '1992-01-13',
    existingFreeRequests: [],
    selectedDates: ['2027-01-14', '2027-01-15'],
  });
  assert.equal(rBlue.valid, false);

  const r4x4 = validateWeeklyFreeDayQuota({
    rotationPattern: '4x4_noche',
    ns22AnchorDate: '2026-12-14',
    birthDate: '1992-01-13',
    existingFreeRequests: [],
    selectedDates: ['2027-01-14', '2027-01-15'],
  });
  assert.equal(r4x4.valid, true);
});
