import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrdinaryRequirementRangePreview,
  matchesOrdinaryRequirementRangeFilter,
  type RangeDeletableRequirementRow,
} from './range-delete-utils';

test('Eliminar necesidades por rango: Blue Express AM 00 (2026-12-07..2027-01-03) solo borra cupos seleccionados y conserva diurnos, extras y otros', () => {
  const rows: RangeDeletableRequirementRow[] = [
    // En rango y filtros -> deben eliminarse
    {
      id: 'blue-am00-cond-dec10',
      date: '2026-12-10',
      area_id: 'area-blue',
      position_id: 'pos-cond',
      shift_id: 'sh-am00',
      required_count: 1,
      is_extra: false,
      area: { name: 'BlueExpress' },
      position: { name: 'Conductor Camion' },
      shift: { name: 'AM 00' },
    },
    {
      id: 'blue-am00-ayud-jan03',
      date: '2027-01-03',
      area_id: 'area-blue',
      position_id: 'pos-ayud',
      shift_id: 'sh-am00',
      required_count: 1,
      is_extra: false,
      area: { name: 'BlueExpress' },
      position: { name: 'Ayudante' },
      shift: { name: 'AM 00' },
    },
    // Turno diurno en BlueExpress en las mismas fechas -> debe conservarse
    {
      id: 'blue-am08-day-dec10',
      date: '2026-12-10',
      area_id: 'area-blue',
      position_id: 'pos-cond',
      shift_id: 'sh-am08',
      required_count: 2,
      is_extra: false,
      area: { name: 'BlueExpress' },
      position: { name: 'Conductor Camion' },
      shift: { name: 'AM 08' },
    },
    // Requerimiento extra en BlueExpress AM 00 en las mismas fechas -> debe conservarse
    {
      id: 'blue-am00-extra-dec10',
      date: '2026-12-10',
      area_id: 'area-blue',
      position_id: 'pos-cond',
      shift_id: 'sh-am00',
      required_count: 1,
      is_extra: true,
      area: { name: 'BlueExpress' },
      position: { name: 'Conductor Camion' },
      shift: { name: 'AM 00' },
    },
    // Fuera del rango (2026-12-06 y 2027-01-04) -> deben conservarse
    {
      id: 'blue-am00-before',
      date: '2026-12-06',
      area_id: 'area-blue',
      position_id: 'pos-cond',
      shift_id: 'sh-am00',
      required_count: 1,
      is_extra: false,
    },
    {
      id: 'blue-am00-after',
      date: '2027-01-04',
      area_id: 'area-blue',
      position_id: 'pos-cond',
      shift_id: 'sh-am00',
      required_count: 1,
      is_extra: false,
    },
    // Otra área (Base) en AM 00 dentro del rango -> debe conservarse
    {
      id: 'base-am00-dec10',
      date: '2026-12-10',
      area_id: 'area-base',
      position_id: 'pos-cond',
      shift_id: 'sh-am00',
      required_count: 1,
      is_extra: false,
    },
  ];

  const filter = {
    startDate: '2026-12-07',
    endDate: '2027-01-03',
    areaId: 'area-blue',
    positionId: 'all',
    shiftId: 'sh-am00',
  };

  const preview = buildOrdinaryRequirementRangePreview(rows, filter);
  assert.equal(preview.allAreasSelected, false);
  assert.equal(preview.totalCount, 2);
  assert.equal(preview.groups.length, 2);
  assert.deepEqual(preview.matchedIds, ['blue-am00-cond-dec10', 'blue-am00-ayud-jan03']);

  // Simular eliminación en una sola operación (sin tocar base operativa)
  const remaining = rows.filter((r) => !matchesOrdinaryRequirementRangeFilter(r, filter));
  assert.equal(remaining.length, 5);
  assert.ok(remaining.some((r) => r.id === 'blue-am08-day-dec10'));
  assert.ok(remaining.some((r) => r.id === 'blue-am00-extra-dec10'));
  assert.ok(remaining.some((r) => r.id === 'blue-am00-before'));
  assert.ok(remaining.some((r) => r.id === 'blue-am00-after'));
  assert.ok(remaining.some((r) => r.id === 'base-am00-dec10'));

  // Verificar indicador visible cuando se seleccionan todas las áreas
  const allAreasPreview = buildOrdinaryRequirementRangePreview(rows, {
    startDate: '2026-12-07',
    endDate: '2027-01-03',
    areaId: 'all',
    positionId: 'all',
    shiftId: 'sh-am00',
  });
  assert.equal(allAreasPreview.allAreasSelected, true);
  assert.equal(allAreasPreview.totalCount, 3);
});
