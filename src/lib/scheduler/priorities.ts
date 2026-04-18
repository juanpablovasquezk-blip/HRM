/**
 * Business Priority Definition
 * Higher score = filled first by the greedy algorithm.
 */

export function getSlotPriority(
  slot: any,
  position: string,
  area: string,
  shift: string
): number {
  const pos = position.toUpperCase();
  const shft = shift.toUpperCase();

  // 1. CANES (Highest priority)
  if (pos.includes('CANES')) return 100;

  // 2. SUPERVISORS (All supervisor shifts are high priority)
  if (pos.includes('SUPERVISOR')) {
    if (shft.includes('04')) return 98; // Extreme priority
    return 96; // High priority (higher than operators)
  }

  // 3. AIRPORT OPERATORS (especially 04:00, 13:30, 22:00)
  if (pos.includes('AEROPUERTO')) {
    if (shft.includes('04')) return 94; // Critical
    if (shft.includes('22')) return 90; // High
    if (shft.includes('13:30')) return 85; // High
    if (shft.includes('07')) return 40; // Low (eventual)
    return 70;
  }

  // 4. CRANE OPERATORS (Atrex/Base Balance)
  if (pos.includes('GRÚA') || pos.includes('HORQUILLA')) {
    if (area.toUpperCase().includes('ATREX')) return 92;
    return 95; // Base is HIGHER priority now to ensure it's covered
  }

  // 5. TRUCK DRIVERS (Blue)
  if (pos.includes('CONDUCTOR') || pos.includes('CAMIÓN')) return 82;

  // 6. WAREHOUSE (Fedex > DHL)
  if (pos.includes('BODEGA')) {
    if (area.toUpperCase().includes('FEDEX')) return 60;
    if (area.toUpperCase().includes('DHL')) return 55;
    return 50;
  }

  // 7. HELPERS (Ayudante Blue)
  if (pos.includes('AYUDANTE')) return 45;

  return 10; // Default
}

/**
 * REINFORCEMENT WHITE-LIST
 * Defines which positions should be pro-actively filled to 5 days/week (40h)
 * and which shift they should use as reinforcement.
 */
export const REINFORCEMENT_CONFIG: Record<string, { shift_start: string }> = {
  'SUPERVISOR': { shift_start: '07:00' },
  'SUP': { shift_start: '07:00' },
  'OPERADOR FEDEX': { shift_start: '05:00' },
  'OPERADOR DHL': { shift_start: '05:00' },
};
