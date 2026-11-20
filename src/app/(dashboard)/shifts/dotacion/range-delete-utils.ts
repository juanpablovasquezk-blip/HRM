export interface OrdinaryRequirementRangeFilter {
  startDate: string;
  endDate: string;
  areaId?: string | null;
  positionId?: string | null;
  shiftId?: string | null;
}

export interface RangeDeletableRequirementRow {
  id: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  required_count: number;
  is_extra?: boolean | null;
  area?: { name?: string | null } | null;
  position?: { name?: string | null } | null;
  shift?: { name?: string | null } | null;
}

export interface OrdinaryRequirementRangeGroupPreview {
  key: string;
  area_id: string;
  area_name: string;
  position_id: string;
  position_name: string;
  shift_id: string;
  shift_name: string;
  count: number;
  min_date: string;
  max_date: string;
}

export interface OrdinaryRequirementRangeDeletePreview {
  startDate: string;
  endDate: string;
  allAreasSelected: boolean;
  totalCount: number;
  groups: OrdinaryRequirementRangeGroupPreview[];
  matchedIds: string[];
}

export function matchesOrdinaryRequirementRangeFilter(
  row: RangeDeletableRequirementRow,
  filter: OrdinaryRequirementRangeFilter
): boolean {
  if (Boolean(row.is_extra)) return false;
  const d = String(row.date).split('T')[0];
  if (d < filter.startDate || d > filter.endDate) return false;
  if (filter.areaId && filter.areaId !== 'all' && row.area_id !== filter.areaId) return false;
  if (filter.positionId && filter.positionId !== 'all' && row.position_id !== filter.positionId) {
    return false;
  }
  if (filter.shiftId && filter.shiftId !== 'all' && row.shift_id !== filter.shiftId) return false;
  return true;
}

export function buildOrdinaryRequirementRangePreview(
  rows: RangeDeletableRequirementRow[],
  filter: OrdinaryRequirementRangeFilter
): OrdinaryRequirementRangeDeletePreview {
  const matched = rows.filter((r) => matchesOrdinaryRequirementRangeFilter(r, filter));
  const groupMap = new Map<string, OrdinaryRequirementRangeGroupPreview>();

  for (const r of matched) {
    const d = String(r.date).split('T')[0];
    const key = `${r.area_id}|${r.position_id}|${r.shift_id}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.count++;
      if (d < existing.min_date) existing.min_date = d;
      if (d > existing.max_date) existing.max_date = d;
    } else {
      groupMap.set(key, {
        key,
        area_id: r.area_id,
        area_name: r.area?.name || r.area_id,
        position_id: r.position_id,
        position_name: r.position?.name || r.position_id,
        shift_id: r.shift_id,
        shift_name: r.shift?.name || r.shift_id,
        count: 1,
        min_date: d,
        max_date: d,
      });
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) =>
    `${a.area_name}|${a.position_name}|${a.shift_name}`.localeCompare(
      `${b.area_name}|${b.position_name}|${b.shift_name}`,
      'es'
    )
  );

  return {
    startDate: filter.startDate,
    endDate: filter.endDate,
    allAreasSelected: !filter.areaId || filter.areaId === 'all',
    totalCount: matched.length,
    groups,
    matchedIds: matched.map((r) => r.id),
  };
}
