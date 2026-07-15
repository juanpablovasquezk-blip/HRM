'use client';

import { jsPDF } from 'jspdf';
import { format, isSaturday, isSunday } from 'date-fns';
import { es } from 'date-fns/locale';

// ── Types ────────────────────────────────────────────────────────────────────

interface Position { id: string; name: string; area_id: string; }
interface Area { id: string; name: string; positions: Position[]; }
interface Shift { id: string; name: string; start_time: string; end_time: string; }
interface Leave { id: string; personnel_id: string; start_date: string; end_date: string; type: string; }
interface Assignment {
  id: string;
  personnel_id: string;
  date: string;
  shift_id: string;
  area_id: string;
  position_id: string;
  is_manual: boolean;
  is_validated?: boolean;
  is_published?: boolean;
  original_shift_id?: string | null;
  is_extra?: boolean;
}
interface Personnel {
  id: string;
  first_name: string;
  last_name_father: string;
  last_name_mother?: string;
  rotation_pattern: string | null;
  main_position: string;
  secondary_positions: string[];
  hire_date: string | null;
  termination_date: string | null;
  has_special_contract: boolean;
  birth_date: string | null;
}

export interface RosterPDFParams {
  personnel: Personnel[];
  assignments: Assignment[];
  shifts: Shift[];
  areas: Area[];
  positions: Position[];
  leaves: Leave[];
  days: Date[];
  monthLabel: string;
  areaFilter?: string;
  positionFilter?: string;
}

// ── Colors ───────────────────────────────────────────────────────────────────

const COLORS = {
  headerBg: [41, 55, 72] as [number, number, number],
  headerText: [255, 255, 255] as [number, number, number],
  areaBg: [229, 231, 235] as [number, number, number],
  areaText: [31, 41, 55] as [number, number, number],
  positionBg: [241, 245, 249] as [number, number, number],
  positionText: [71, 85, 105] as [number, number, number],
  cellBorder: [203, 213, 225] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  offWhite: [248, 250, 252] as [number, number, number],
  weekendBg: [241, 245, 249] as [number, number, number],
  changeBg: [255, 243, 224] as [number, number, number],
  changeBorder: [251, 146, 60] as [number, number, number],
  leaveVac: [209, 250, 229] as [number, number, number],
  leaveSick: [254, 226, 226] as [number, number, number],
  leavePersonal: [254, 243, 199] as [number, number, number],
  leaveMaternity: [243, 232, 255] as [number, number, number],
  leaveFreeReq: [219, 234, 254] as [number, number, number],
  leaveDefault: [241, 245, 249] as [number, number, number],
  textPrimary: [15, 23, 42] as [number, number, number],
  textSecondary: [100, 116, 139] as [number, number, number],
  textMuted: [148, 163, 184] as [number, number, number],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLeaveLabel(type: string): string {
  switch (type) {
    case 'vacation': return 'VAC';
    case 'sick': return 'LM';
    case 'personal': return 'ADM';
    case 'maternity': return 'MAT';
    case 'free_request': return 'SL';
    default: return 'ABS';
  }
}

function getLeaveBgColor(type: string): [number, number, number] {
  switch (type) {
    case 'vacation': return COLORS.leaveVac;
    case 'sick': return COLORS.leaveSick;
    case 'personal': return COLORS.leavePersonal;
    case 'maternity': return COLORS.leaveMaternity;
    case 'free_request': return COLORS.leaveFreeReq;
    default: return COLORS.leaveDefault;
  }
}

// ── Main Export Function ─────────────────────────────────────────────────────

export function generateRosterPDF(params: RosterPDFParams) {
  const {
    personnel,
    assignments,
    shifts,
    areas,
    positions,
    leaves,
    days,
    monthLabel,
    areaFilter,
    positionFilter,
  } = params;

  // ── Build lookup maps ──────────────────────────────────────────────────

  const shiftsMap: Record<string, Shift> = {};
  shifts.forEach(s => { shiftsMap[s.id] = s; });

  const areasMap: Record<string, Area> = {};
  areas.forEach(a => { areasMap[a.id] = a; });

  const positionsMap: Record<string, Position> = {};
  positions.forEach(p => { positionsMap[p.id] = p; });

  // Assignments map: personnelId -> date -> Assignment (excluding extras)
  const assignmentsMap: Record<string, Record<string, Assignment>> = {};
  assignments.forEach(a => {
    if ((a as any).is_extra) return; // Skip extra shifts
    if (!assignmentsMap[a.personnel_id]) assignmentsMap[a.personnel_id] = {};
    assignmentsMap[a.personnel_id][a.date] = a;
  });

  // Leaves map: personnelId -> Leave[]
  const leavesMap: Record<string, Leave[]> = {};
  leaves.forEach(l => {
    if (!leavesMap[l.personnel_id]) leavesMap[l.personnel_id] = [];
    leavesMap[l.personnel_id].push(l);
  });

  // ── Group personnel: Area -> Position -> Alphabetical ──────────────────

  interface GroupedEntry {
    areaName: string;
    areaId: string;
    positionName: string;
    person: Personnel;
  }

  const entries: GroupedEntry[] = personnel.map(p => {
    const pos = positionsMap[p.main_position];
    const area = pos ? areasMap[pos.area_id] : null;
    return {
      areaName: area?.name || 'Sin Area',
      areaId: pos?.area_id || '',
      positionName: pos?.name || 'Sin Cargo',
      person: p,
    };
  });

  // Sort: area name -> position name -> last name
  entries.sort((a, b) => {
    const areaComp = a.areaName.localeCompare(b.areaName, 'es');
    if (areaComp !== 0) return areaComp;
    const posComp = a.positionName.localeCompare(b.positionName, 'es');
    if (posComp !== 0) return posComp;
    return a.person.last_name_father.localeCompare(b.person.last_name_father, 'es');
  });

  // ── PDF Setup ──────────────────────────────────────────────────────────

  const numDays = days.length;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginLeft = 4;
  const marginRight = 4;
  const marginTop = 4;
  const marginBottom = 8;
  const usableW = pageW - marginLeft - marginRight;

  // Column widths
  const nameColW = 38;
  const dayColW = (usableW - nameColW) / numDays;

  // Row heights
  const titleH = 10;
  const headerRowH = 10;
  const dataRowH = 9;
  const groupRowH = 6;

  // Font sizes
  const FONT_TITLE = 10;
  const FONT_SUBTITLE = 6.5;
  const FONT_HEADER = 5.5;
  const FONT_CELL = 5;
  const FONT_CELL_SMALL = 4;
  const FONT_GROUP = 6;

  let currentY = marginTop;
  let currentPage = 1;

  // ── Helper: draw functions ─────────────────────────────────────────────

  const setFillColor = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setDrawColor = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  function drawTitle() {
    setFillColor(COLORS.headerBg);
    doc.rect(marginLeft, currentY, usableW, titleH, 'F');

    setTextColor(COLORS.headerText);
    doc.setFontSize(FONT_TITLE);
    doc.setFont('helvetica', 'bold');
    doc.text(`ROSTER MENSUAL \u2014 ${monthLabel}`, marginLeft + 3, currentY + 4.5);

    doc.setFontSize(FONT_SUBTITLE);
    doc.setFont('helvetica', 'normal');
    const filterParts: string[] = [];
    if (areaFilter && areaFilter !== 'all') {
      const areaName = Object.values(areasMap).find(a => a.id === areaFilter)?.name;
      if (areaName) filterParts.push(`\u00c1rea: ${areaName}`);
    }
    if (positionFilter) filterParts.push(`Cargo: ${positionFilter}`);
    if (filterParts.length === 0) filterParts.push('Todas las \u00e1reas');

    const now = format(new Date(), "dd/MM/yyyy HH:mm");
    const subtitle = `${filterParts.join(' | ')}  \u2022  Generado: ${now}  \u2022  ${personnel.length} trabajadores`;
    doc.text(subtitle, marginLeft + 3, currentY + 8);

    currentY += titleH + 1;
  }

  function drawDateHeader() {
    const y = currentY;

    // Name column header
    setFillColor(COLORS.headerBg);
    doc.rect(marginLeft, y, nameColW, headerRowH, 'F');
    setTextColor(COLORS.headerText);
    doc.setFontSize(FONT_HEADER);
    doc.setFont('helvetica', 'bold');
    doc.text('Trabajador', marginLeft + 1.5, y + 5.5);

    // Day columns
    days.forEach((day, i) => {
      const x = marginLeft + nameColW + i * dayColW;
      const isWeekend = isSaturday(day) || isSunday(day);

      setFillColor(isWeekend ? [55, 65, 81] : COLORS.headerBg);
      doc.rect(x, y, dayColW, headerRowH, 'F');

      setTextColor(COLORS.headerText);
      doc.setFontSize(FONT_CELL_SMALL);
      doc.setFont('helvetica', 'normal');

      const dayName = format(day, 'EEE', { locale: es }).toUpperCase().slice(0, 3);
      const dayNameW = doc.getTextWidth(dayName);
      doc.text(dayName, x + (dayColW - dayNameW) / 2, y + 3.5);

      doc.setFontSize(FONT_HEADER);
      doc.setFont('helvetica', 'bold');
      const dayNum = format(day, 'd');
      const dayNumW = doc.getTextWidth(dayNum);
      doc.text(dayNum, x + (dayColW - dayNumW) / 2, y + 7.5);
    });

    setDrawColor(COLORS.cellBorder);
    doc.setLineWidth(0.2);
    doc.rect(marginLeft, y, usableW, headerRowH);

    currentY += headerRowH;
  }

  function checkPageBreak(neededH: number) {
    if (currentY + neededH > pageH - marginBottom) {
      drawFooter();
      doc.addPage();
      currentPage++;
      currentY = marginTop;
      drawDateHeader();
    }
  }

  function drawFooter() {
    doc.setFontSize(4);
    doc.setFont('helvetica', 'normal');
    setTextColor(COLORS.textMuted);
    const footerText = `P\u00e1gina ${currentPage}  \u2022  ${monthLabel}`;
    doc.text(footerText, marginLeft + 2, pageH - 3);
  }

  function drawAreaSeparator(areaName: string) {
    checkPageBreak(groupRowH);
    const y = currentY;

    setFillColor(COLORS.areaBg);
    doc.rect(marginLeft, y, usableW, groupRowH, 'F');

    setDrawColor(COLORS.cellBorder);
    doc.setLineWidth(0.2);
    doc.rect(marginLeft, y, usableW, groupRowH);

    setTextColor(COLORS.areaText);
    doc.setFontSize(FONT_GROUP);
    doc.setFont('helvetica', 'bold');
    doc.text(`\u25cc ${areaName.toUpperCase()}`, marginLeft + 2, y + 4.2);

    currentY += groupRowH;
  }

  function drawPositionSeparator(positionName: string) {
    checkPageBreak(groupRowH);
    const y = currentY;

    setFillColor(COLORS.positionBg);
    doc.rect(marginLeft, y, usableW, groupRowH, 'F');

    setDrawColor(COLORS.cellBorder);
    doc.setLineWidth(0.2);
    doc.rect(marginLeft, y, usableW, groupRowH);

    setTextColor(COLORS.positionText);
    doc.setFontSize(FONT_CELL);
    doc.setFont('helvetica', 'bold');
    doc.text(`\u2500\u2500 ${positionName} \u2500\u2500`, marginLeft + nameColW / 2 - 5, y + 4);

    currentY += groupRowH;
  }

  function drawPersonRow(person: Personnel, rowIndex: number) {
    checkPageBreak(dataRowH);
    const y = currentY;
    const isEvenRow = rowIndex % 2 === 0;

    // Name cell
    const nameBg: [number, number, number] = isEvenRow ? COLORS.white : COLORS.offWhite;
    setFillColor(nameBg);
    doc.rect(marginLeft, y, nameColW, dataRowH, 'F');

    setDrawColor(COLORS.cellBorder);
    doc.setLineWidth(0.1);
    doc.rect(marginLeft, y, nameColW, dataRowH);

    // Worker name: LAST_NAME, First
    setTextColor(COLORS.textPrimary);
    doc.setFontSize(FONT_CELL);
    doc.setFont('helvetica', 'bold');
    const fullName = `${person.last_name_father}, ${person.first_name}`;
    const maxNameW = nameColW - 2;
    let displayName = fullName;
    while (doc.getTextWidth(displayName) > maxNameW && displayName.length > 3) {
      displayName = displayName.slice(0, -1);
    }
    if (displayName !== fullName) displayName += '\u2026';
    doc.text(displayName, marginLeft + 1, y + 3.5);

    // Position name below the name
    const pos = positionsMap[person.main_position];
    if (pos) {
      doc.setFontSize(FONT_CELL_SMALL);
      doc.setFont('helvetica', 'normal');
      setTextColor(COLORS.textSecondary);
      let posDisplay = pos.name;
      while (doc.getTextWidth(posDisplay) > maxNameW && posDisplay.length > 3) {
        posDisplay = posDisplay.slice(0, -1);
      }
      if (posDisplay !== pos.name) posDisplay += '\u2026';
      doc.text(posDisplay, marginLeft + 1, y + 6.5);
    }

    // Day cells
    const personLeaves = leavesMap[person.id] || [];

    days.forEach((day, i) => {
      const x = marginLeft + nameColW + i * dayColW;
      const dateStr = format(day, 'yyyy-MM-dd');
      const isWeekend = isSaturday(day) || isSunday(day);

      const assignment = assignmentsMap[person.id]?.[dateStr];
      const leave = personLeaves.find(l => dateStr >= l.start_date && dateStr <= l.end_date);
      const shift = assignment ? shiftsMap[assignment.shift_id] : null;
      const isChanged = assignment?.original_shift_id &&
        assignment.original_shift_id !== assignment.shift_id;

      // Cell background
      let cellBg: [number, number, number];
      if (leave) {
        cellBg = getLeaveBgColor(leave.type);
      } else if (isChanged) {
        cellBg = COLORS.changeBg;
      } else if (isWeekend) {
        cellBg = COLORS.weekendBg;
      } else {
        cellBg = isEvenRow ? COLORS.white : COLORS.offWhite;
      }

      setFillColor(cellBg);
      doc.rect(x, y, dayColW, dataRowH, 'F');

      setDrawColor(COLORS.cellBorder);
      doc.setLineWidth(0.1);
      doc.rect(x, y, dayColW, dataRowH);

      // Change indicator: orange left border
      if (isChanged) {
        setDrawColor(COLORS.changeBorder);
        doc.setLineWidth(0.6);
        doc.line(x, y, x, y + dataRowH);
        setDrawColor(COLORS.cellBorder);
        doc.setLineWidth(0.1);
      }

      // Cell content
      if (leave) {
        doc.setFontSize(FONT_CELL);
        doc.setFont('helvetica', 'bold');
        setTextColor(COLORS.textPrimary);
        const label = getLeaveLabel(leave.type);
        const labelW = doc.getTextWidth(label);
        doc.text(label, x + (dayColW - labelW) / 2, y + 5.5);
      } else if (shift) {
        // Line 1: Shift name
        doc.setFontSize(FONT_CELL);
        doc.setFont('helvetica', 'bold');
        setTextColor(COLORS.textPrimary);
        let shiftName = shift.name;
        const maxCellTextW = dayColW - 1;
        while (doc.getTextWidth(shiftName) > maxCellTextW && shiftName.length > 2) {
          shiftName = shiftName.slice(0, -1);
        }
        const shiftNameW = doc.getTextWidth(shiftName);
        doc.text(shiftName, x + (dayColW - shiftNameW) / 2, y + 3);

        // Line 2: Start time
        doc.setFontSize(FONT_CELL_SMALL);
        doc.setFont('helvetica', 'normal');
        setTextColor(COLORS.textSecondary);
        const timeStr = shift.start_time.substring(0, 5);
        const timeW = doc.getTextWidth(timeStr);
        doc.text(timeStr, x + (dayColW - timeW) / 2, y + 5.5);

        // Line 3: Position/Cargo assigned for this day
        const assignedPos = assignment.position_id ? positionsMap[assignment.position_id] : null;
        if (assignedPos) {
          doc.setFontSize(3.5);
          doc.setFont('helvetica', 'normal');
          setTextColor(COLORS.textMuted);
          let posLabel = assignedPos.name;
          while (doc.getTextWidth(posLabel) > maxCellTextW && posLabel.length > 2) {
            posLabel = posLabel.slice(0, -1);
          }
          if (posLabel !== assignedPos.name) posLabel += '\u2026';
          const posW = doc.getTextWidth(posLabel);
          doc.text(posLabel, x + (dayColW - posW) / 2, y + 7.8);
        }
      } else {
        // Empty / OFF
        doc.setFontSize(FONT_CELL_SMALL);
        doc.setFont('helvetica', 'normal');
        setTextColor(COLORS.textMuted);
        const dash = '\u2014';
        const dashW = doc.getTextWidth(dash);
        doc.text(dash, x + (dayColW - dashW) / 2, y + 5.5);
      }
    });

    currentY += dataRowH;
  }

  // ── Build the PDF ──────────────────────────────────────────────────────

  // 1. Title
  drawTitle();

  // 2. Date header
  drawDateHeader();

  // 3. Data rows grouped by area -> position
  let lastArea = '';
  let lastPosition = '';
  let rowIndex = 0;

  entries.forEach(entry => {
    if (entry.areaName !== lastArea) {
      drawAreaSeparator(entry.areaName);
      lastArea = entry.areaName;
      lastPosition = '';
      rowIndex = 0;
    }

    if (entry.positionName !== lastPosition) {
      drawPositionSeparator(entry.positionName);
      lastPosition = entry.positionName;
      rowIndex = 0;
    }

    drawPersonRow(entry.person, rowIndex);
    rowIndex++;
  });

  // 4. Footer on last page
  drawFooter();

  // 5. Legend
  if (currentY + 12 < pageH - marginBottom) {
    currentY += 3;
    doc.setFontSize(FONT_CELL_SMALL);
    doc.setFont('helvetica', 'normal');
    setTextColor(COLORS.textSecondary);

    const legendItems = [
      'Naranja = Cambio de turno  |  Fondo gris = S\u00e1bado/Domingo',
      'VAC=Vacaciones  LM=Lic. M\u00e9dica  ADM=Administrativo  MAT=Maternidad  SL=Sol. Libre',
    ];

    legendItems.forEach((item, i) => {
      doc.text(item, marginLeft + 2, currentY + (i * 3));
    });
  }

  // ── Download ───────────────────────────────────────────────────────────
  const safeMonth = monthLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00c1\u00c9\u00cd\u00d3\u00da\u00d1]/g, '');
  doc.save(`Roster_${safeMonth}.pdf`);
}
