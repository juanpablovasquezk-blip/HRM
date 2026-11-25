import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkerMonthSelectorOptions,
  evaluateWorkerPendingDocuments,
  expandDateRange,
  getMonthDeadlineDateString,
  getSantiagoDateString,
  isMonthOpenForWorkerRequest,
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
