import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTurnoAeropuertoExternalRef,
  isConductorCamionBlueExpress,
  isEligibleTurnoAeropuertoAssignment,
  normalizeCatalogLabel,
} from './turno-aeropuerto';

test('normalizeCatalogLabel strips accents, collapses spaces and uppercases', () => {
  assert.equal(normalizeCatalogLabel('  Conductor   Camión '), 'CONDUCTOR CAMION');
  assert.equal(normalizeCatalogLabel('BlueExpress'), 'BLUEEXPRESS');
  assert.equal(normalizeCatalogLabel(null), '');
});

test('isConductorCamionBlueExpress matches catalog Conductor Camion + BlueExpress', () => {
  assert.equal(isConductorCamionBlueExpress('Conductor Camion', 'BlueExpress'), true);
  assert.equal(isConductorCamionBlueExpress('Conductor Camión', 'Blue Express'), true);
  assert.equal(isConductorCamionBlueExpress('Conductor Camion', 'Aeropuerto'), false);
  assert.equal(isConductorCamionBlueExpress('Operador Aeropuerto', 'BlueExpress'), false);
  assert.equal(isConductorCamionBlueExpress('Ayudante Blue Express', 'BlueExpress'), false);
});

test('isEligibleTurnoAeropuertoAssignment matches Operador Aeropuerto, FedEx and DHL (including Bodegas)', () => {
  assert.equal(isEligibleTurnoAeropuertoAssignment('Operador Aeropuerto', 'Aeropuerto'), true);
  assert.equal(isEligibleTurnoAeropuertoAssignment('Operador Fedex', 'Bodegas'), true);
  assert.equal(isEligibleTurnoAeropuertoAssignment('Operador FedEx', 'FedEx'), true);
  assert.equal(isEligibleTurnoAeropuertoAssignment('Operador DHL', 'Bodegas'), true);
  assert.equal(isEligibleTurnoAeropuertoAssignment('Operador DHL', 'DHL'), true);

  assert.equal(isEligibleTurnoAeropuertoAssignment('Conductor Camion', 'BlueExpress'), false);
  assert.equal(isEligibleTurnoAeropuertoAssignment('Operador Aeropuerto', 'Bodegas'), false);
  assert.equal(isEligibleTurnoAeropuertoAssignment('Operador Bodega', 'Bodegas'), false);
});

test('buildTurnoAeropuertoExternalRef builds deterministic daily key', () => {
  assert.equal(
    buildTurnoAeropuertoExternalRef('p-1', '2026-11-25'),
    'TURNO_AEROPUERTO:p-1:2026-11-25'
  );
});
