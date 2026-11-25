import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRosterDisplayHolidays,
  LIBRE_CELL_STYLE,
  resolveRosterAssignmentDisplay,
  SUNDAY_OR_HOLIDAY_CELL_STYLE,
} from './roster-display-utils';

test('Roster Individual: colores de destino, Bodegas (DHL/FedEx), BlueExpress, Aeropuerto y Libre', () => {
  const dhl = resolveRosterAssignmentDisplay({
    assignment: { area: { name: 'Bodegas' }, position: { name: 'Operador DHL' } },
    isSundayOrHoliday: false,
  });
  assert.equal(dhl.label, 'DHL');
  assert.equal(dhl.destinationKey, 'dhl');
  assert.equal(dhl.style.backgroundColor, '#FACC15');
  assert.equal(dhl.style.color, '#111827');

  const fedex = resolveRosterAssignmentDisplay({
    assignment: { area: { name: 'Bodegas' }, position: { name: 'Operador FedEx' } },
    isSundayOrHoliday: true,
  });
  assert.equal(fedex.label, 'FEDEX');
  assert.equal(fedex.destinationKey, 'fedex');
  assert.equal(fedex.style.backgroundColor, '#7E22CE');
  assert.equal(fedex.style.color, '#FFFFFF');

  const blue1 = resolveRosterAssignmentDisplay({
    assignment: { area: { name: 'BlueExpress' }, position: { name: 'Conductor' } },
    isSundayOrHoliday: false,
  });
  const blue2 = resolveRosterAssignmentDisplay({
    assignment: { area: { name: 'Blue Express' }, position: { name: 'Conductor' } },
    isSundayOrHoliday: false,
  });
  assert.equal(blue1.label, 'BLUE EXPRESS');
  assert.equal(blue2.label, 'BLUE EXPRESS');
  assert.equal(blue1.destinationKey, 'blue_express');
  assert.deepEqual(blue1.style, blue2.style);

  const aero = resolveRosterAssignmentDisplay({
    assignment: { area: { name: 'Aeropuerto' }, position: { name: 'Conductor Aeropuerto' } },
    isSundayOrHoliday: true,
  });
  assert.equal(aero.label, 'AEROPUERTO');
  assert.equal(aero.destinationKey, 'minerquim');
  assert.equal(aero.style.backgroundColor, '#F97316');
  assert.equal(aero.style.color, '#111827');

  const libre = resolveRosterAssignmentDisplay({
    assignment: null,
    isSundayOrHoliday: false,
  });
  assert.equal(libre.label, 'LIBRE');
  assert.deepEqual(libre.style, LIBRE_CELL_STYLE);

  const vacSunday = resolveRosterAssignmentDisplay({
    leave: { type: 'vacation' },
    isSundayOrHoliday: true,
  });
  assert.equal(vacSunday.label, 'VACACIONES');
  assert.deepEqual(vacSunday.style, SUNDAY_OR_HOLIDAY_CELL_STYLE);
});

test('Roster Individual: feriados de Chile en rango que cruza de año (2026-12-21..2027-01-03)', () => {
  const holidays = getRosterDisplayHolidays('2026-12-21', '2027-01-03');
  assert.equal(holidays.get('2026-12-25')?.name, 'Navidad');
  assert.equal(holidays.get('2027-01-01')?.name, 'Año Nuevo');
  assert.equal(holidays.has('2026-12-24'), false);
});
