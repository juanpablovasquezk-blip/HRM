export interface MatrixShiftRow {
  shiftId: string;
  shiftName: string;
  startTime: string;
  /** Counts ordered Monday (index 0) to Sunday (index 6) */
  counts: [number, number, number, number, number, number, number];
  weeklyTotal: number;
  templateCount: number;
}

export interface MatrixPositionGroup {
  groupKey: string;
  areaId: string;
  areaName: string;
  positionId: string;
  positionName: string;
  shifts: MatrixShiftRow[];
  /** Daily totals ordered Monday (index 0) to Sunday (index 6) */
  dailyTotals: [number, number, number, number, number, number, number];
  weeklyTotal: number;
}

/** DB convention: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb */
export const MATRIX_DAYS_ORDER = [
  { dbDay: 1, label: 'L', fullName: 'Lunes' },
  { dbDay: 2, label: 'M', fullName: 'Martes' },
  { dbDay: 3, label: 'X', fullName: 'Miércoles' },
  { dbDay: 4, label: 'J', fullName: 'Jueves' },
  { dbDay: 5, label: 'V', fullName: 'Viernes' },
  { dbDay: 6, label: 'S', fullName: 'Sábado' },
  { dbDay: 0, label: 'D', fullName: 'Domingo' },
] as const;

const DB_DAY_TO_INDEX: Record<number, number> = {
  1: 0, // Lunes
  2: 1, // Martes
  3: 2, // Miércoles
  4: 3, // Jueves
  5: 4, // Viernes
  6: 5, // Sábado
  0: 6, // Domingo
};

export interface TemplateLike {
  id?: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  required_count: number;
  days_of_week: number[];
  is_active?: boolean;
  area?: { name?: string };
  position?: { name?: string };
  shift?: { name?: string; start_time?: string };
}

/**
 * Consolidates requirement_templates into a weekly matrix grouped by Area -> Position -> Shift.
 * Sums required_count when multiple templates overlap on the same (area, position, shift, day),
 * matching materializeTemplates behavior.
 */
export function buildWeeklyMatrix(templates: TemplateLike[]): MatrixPositionGroup[] {
  const groupMap = new Map<string, {
    areaId: string;
    areaName: string;
    positionId: string;
    positionName: string;
    shiftMap: Map<string, MatrixShiftRow>;
  }>();

  for (const tmpl of templates) {
    // Respect is_active if present in future schema, default true
    if (tmpl.is_active === false) continue;

    const areaId = tmpl.area_id;
    const positionId = tmpl.position_id;
    const shiftId = tmpl.shift_id;
    const groupKey = `${areaId}||${positionId}`;

    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        areaId,
        areaName: tmpl.area?.name || 'Desconocido',
        positionId,
        positionName: tmpl.position?.name || 'Desconocido',
        shiftMap: new Map(),
      };
      groupMap.set(groupKey, group);
    }

    let shiftRow = group.shiftMap.get(shiftId);
    if (!shiftRow) {
      shiftRow = {
        shiftId,
        shiftName: tmpl.shift?.name || 'Desconocido',
        startTime: tmpl.shift?.start_time || '99:99:99',
        counts: [0, 0, 0, 0, 0, 0, 0],
        weeklyTotal: 0,
        templateCount: 0,
      };
      group.shiftMap.set(shiftId, shiftRow);
    }

    shiftRow.templateCount += 1;
    const reqCount = Number(tmpl.required_count) || 0;
    const days = Array.isArray(tmpl.days_of_week) ? tmpl.days_of_week : [];

    for (const dbDay of days) {
      const idx = DB_DAY_TO_INDEX[dbDay];
      if (idx !== undefined) {
        shiftRow.counts[idx] += reqCount;
        shiftRow.weeklyTotal += reqCount;
      }
    }
  }

  const result: MatrixPositionGroup[] = [];

  for (const [groupKey, group] of groupMap.entries()) {
    const shifts = Array.from(group.shiftMap.values()).sort((a, b) => {
      const timeCmp = a.startTime.localeCompare(b.startTime);
      return timeCmp !== 0 ? timeCmp : a.shiftName.localeCompare(b.shiftName);
    });

    const dailyTotals: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];
    let weeklyTotal = 0;

    for (const row of shifts) {
      for (let i = 0; i < 7; i++) {
        dailyTotals[i] += row.counts[i];
      }
      weeklyTotal += row.weeklyTotal;
    }

    result.push({
      groupKey,
      areaId: group.areaId,
      areaName: group.areaName,
      positionId: group.positionId,
      positionName: group.positionName,
      shifts,
      dailyTotals,
      weeklyTotal,
    });
  }

  return result.sort((a, b) => {
    const areaCmp = a.areaName.localeCompare(b.areaName);
    return areaCmp !== 0 ? areaCmp : a.positionName.localeCompare(b.positionName);
  });
}
