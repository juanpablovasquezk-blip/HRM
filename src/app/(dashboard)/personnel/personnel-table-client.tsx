'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { 
  Plus, 
  Users as UsersIcon, 
  FileSpreadsheet, 
  Edit, 
  ShieldCheck, 
  FileText, 
  Settings2,
  Download,
  Check,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface Personnel {
  id: string;
  first_name: string;
  last_name_father: string;
  last_name_mother: string;
  rut: string;
  main_position: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  hire_date: string | null;
  termination_date: string | null;
  prefers_night: boolean;
  avoids_night: boolean;
  company_id: string;
  rotation_pattern: string | null;
  fixed_shift_id: string | null;
  user_id: string | null;
  requires_transport: boolean;
  is_active: boolean;
  driver_licenses?: string[];
  company: { name: string } | null;
}

interface PersonnelTableClientProps {
  personnel: Personnel[];
  positionMap: Record<string, string>;
  shiftMap: Record<string, string>;
  canEdit: boolean;
}

interface ColumnConfig {
  id: string;
  label: string;
  defaultVisible: boolean;
}

export default function PersonnelTableClient({
  personnel,
  positionMap,
  shiftMap,
  canEdit
}: PersonnelTableClientProps) {
  // Define available columns
  const columns: ColumnConfig[] = [
    { id: 'fullName', label: 'Nombre Completo', defaultVisible: true },
    { id: 'rut', label: 'RUT', defaultVisible: true },
    { id: 'main_position', label: 'Cargo', defaultVisible: true },
    { id: 'company', label: 'Empresa', defaultVisible: true },
    { id: 'rotation_pattern', label: 'Planificación', defaultVisible: true },
    { id: 'preferences', label: 'Preferencias', defaultVisible: true },
    { id: 'email', label: 'Correo', defaultVisible: false },
    { id: 'phone', label: 'Teléfono', defaultVisible: false },
    { id: 'driver_licenses', label: 'Licencias', defaultVisible: false },
    { id: 'birth_date', label: 'Fecha Nacimiento', defaultVisible: false },
    { id: 'hire_date', label: 'Fecha Contratación', defaultVisible: false },
    { id: 'termination_date', label: 'Fecha Término', defaultVisible: false },
    { id: 'requires_transport', label: 'Requiere Transporte', defaultVisible: false },
    { id: 'is_active', label: 'Estado', defaultVisible: false },
  ];

  // State to track visible columns
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    return Object.fromEntries(columns.map(c => [c.id, c.defaultVisible]));
  });

  const toggleColumn = (columnId: string) => {
    setVisibleColumns(prev => {
      // Don't allow hiding all columns
      const next = { ...prev, [columnId]: !prev[columnId] };
      const hasVisible = Object.values(next).some(Boolean);
      return hasVisible ? next : prev;
    });
  };

  // Select all / Deselect all
  const selectAll = () => {
    setVisibleColumns(Object.fromEntries(columns.map(c => [c.id, true])));
  };

  const resetDefault = () => {
    setVisibleColumns(Object.fromEntries(columns.map(c => [c.id, c.defaultVisible])));
  };

  // Export to Excel
  const handleExport = () => {
    if (personnel.length === 0) {
      toast.info('No hay registros para exportar');
      return;
    }

    try {
      // Map data according to selected/visible columns
      const dataToExport = personnel.map(p => {
        const row: Record<string, any> = {};

        if (visibleColumns.fullName) {
          row['Nombres'] = p.first_name || '';
          row['Apellido Paterno'] = p.last_name_father || '';
          row['Apellido Materno'] = p.last_name_mother || '';
        }
        if (visibleColumns.rut) {
          row['RUT'] = p.rut || '';
        }
        if (visibleColumns.main_position) {
          row['Cargo'] = positionMap[p.main_position] || p.main_position || '';
        }
        if (visibleColumns.company) {
          row['Empresa'] = p.company?.name || '';
        }
        if (visibleColumns.rotation_pattern) {
          row['Planificación / Rotación'] = p.rotation_pattern || 'Estándar';
          row['Turno Fijo'] = p.fixed_shift_id ? (shiftMap[p.fixed_shift_id] || 'Sí') : 'No';
        }
        if (visibleColumns.preferences) {
          row['Prefiere Turno Noche'] = p.prefers_night ? 'Sí' : 'No';
          row['Evita Turno Noche'] = p.avoids_night ? 'Sí' : 'No';
        }
        if (visibleColumns.email) {
          row['Correo'] = p.email || '';
        }
        if (visibleColumns.phone) {
          row['Teléfono'] = p.phone || '';
        }
        if (visibleColumns.driver_licenses) {
          row['Licencias'] = p.driver_licenses?.join(', ') || '';
        }
        if (visibleColumns.birth_date) {
          row['Fecha de Nacimiento'] = p.birth_date || '';
        }
        if (visibleColumns.hire_date) {
          row['Fecha de Contratación'] = p.hire_date || '';
        }
        if (visibleColumns.termination_date) {
          row['Fecha de Término'] = p.termination_date || '';
        }
        if (visibleColumns.requires_transport) {
          row['Requiere Transporte'] = p.requires_transport ? 'Sí' : 'No';
        }
        if (visibleColumns.is_active) {
          row['Estado'] = p.is_active ? 'Activo' : 'De baja';
        }

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Personal');

      // Add simple styling by auto-adjusting column widths
      const maxLens = Object.keys(dataToExport[0] || {}).map(key => {
        let max = key.length;
        dataToExport.forEach(row => {
          const val = String(row[key] || '');
          if (val.length > max) max = val.length;
        });
        return { wch: max + 3 };
      });
      ws['!cols'] = maxLens;

      const fileName = `Listado_Personal_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Listado exportado correctamente en Excel');
    } catch (error: any) {
      toast.error('Error al exportar a Excel', { description: error.message });
    }
  };

  return (
    <div className="space-y-4">
      {/* Table Toolbar / Control Row */}
      <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground font-medium">
          Mostrando <span className="font-bold text-slate-700 dark:text-slate-300">{personnel.length}</span> registros de personal
        </div>
        
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {/* Column Selector Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-background text-slate-600 hover:bg-slate-50 hover:text-orange-600 dark:border-slate-800 dark:text-slate-400 h-9 px-3 gap-1.5 text-xs font-semibold cursor-pointer outline-none">
              <Settings2 className="h-4 w-4" />
              Columnas
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1">
              <DropdownMenuLabel className="text-xs uppercase font-bold text-slate-400">Ver Columnas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="max-h-64 overflow-y-auto">
                {columns.map(c => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={visibleColumns[c.id]}
                    onCheckedChange={() => toggleColumn(c.id)}
                    className="text-xs cursor-pointer"
                  >
                    {c.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between p-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={selectAll} 
                  className="text-[10px] h-7 px-2 font-bold"
                >
                  Todas
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={resetDefault} 
                  className="text-[10px] h-7 px-2 font-bold text-slate-500"
                >
                  Predeterminado
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export to Excel Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="h-9 bg-emerald-50/50 hover:bg-emerald-50 border-emerald-200 text-emerald-700 hover:text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400 gap-1.5 text-xs font-semibold rounded-lg"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Descargar Excel
          </Button>
        </div>
      </div>

      {/* Main Table */}
      {personnel.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.fullName && <TableHead>Nombre</TableHead>}
                {visibleColumns.rut && <TableHead>RUT</TableHead>}
                {visibleColumns.main_position && <TableHead>Cargo</TableHead>}
                {visibleColumns.company && <TableHead>Empresa</TableHead>}
                {visibleColumns.rotation_pattern && <TableHead>Planificación</TableHead>}
                {visibleColumns.preferences && <TableHead>Preferencias</TableHead>}
                {visibleColumns.email && <TableHead>Correo</TableHead>}
                {visibleColumns.phone && <TableHead>Teléfono</TableHead>}
                {visibleColumns.driver_licenses && <TableHead>Licencias</TableHead>}
                {visibleColumns.birth_date && <TableHead>Fecha Nacimiento</TableHead>}
                {visibleColumns.hire_date && <TableHead>Fecha Contratación</TableHead>}
                {visibleColumns.termination_date && <TableHead>Fecha Término</TableHead>}
                {visibleColumns.requires_transport && <TableHead>Transporte</TableHead>}
                {visibleColumns.is_active && <TableHead>Estado</TableHead>}
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personnel.map((person) => {
                return (
                  <TableRow key={person.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {/* Full Name Cell */}
                    {visibleColumns.fullName && (
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Link
                            href={`/personnel/${person.id}`}
                            className="font-medium text-orange-600 hover:text-orange-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1.5"
                          >
                            {person.first_name} {person.last_name_father} {person.last_name_mother}
                            {person.user_id && (
                              <ShieldCheck className="h-3.5 w-3.5 text-blue-500 fill-blue-50" />
                            )}
                          </Link>
                        </div>
                      </TableCell>
                    )}

                    {/* RUT Cell */}
                    {visibleColumns.rut && (
                      <TableCell className="font-mono text-sm">
                        {person.rut}
                      </TableCell>
                    )}

                    {/* Cargo Cell */}
                    {visibleColumns.main_position && (
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {positionMap[person.main_position] || person.main_position}
                        </Badge>
                      </TableCell>
                    )}

                    {/* Empresa Cell */}
                    {visibleColumns.company && (
                      <TableCell className="text-muted-foreground">
                        {person.company?.name || '—'}
                      </TableCell>
                    )}

                    {/* Planificación Cell */}
                    {visibleColumns.rotation_pattern && (
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit text-[10px] font-semibold bg-orange-50/50 text-orange-700 border-orange-200">
                            {person.rotation_pattern === '5x2' ? '5x2 Rotativo' : 
                             person.rotation_pattern === '7x7' ? '7x7 Canes' : 
                             person.rotation_pattern === '4x4_noche' ? '4x4 Noche' : 
                             person.rotation_pattern || 'Estándar'}
                          </Badge>
                          {person.fixed_shift_id && (
                            <div className="text-[10px] text-slate-500 italic">
                              Turno: {shiftMap[person.fixed_shift_id] || 'Fijo'}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    )}

                    {/* Preferencias Cell */}
                    {visibleColumns.preferences && (
                      <TableCell>
                        <div className="flex gap-1">
                          {person.prefers_night && (
                            <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px]">
                              Noche
                            </Badge>
                          )}
                          {person.avoids_night && (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                              No Noche
                            </Badge>
                          )}
                          {!person.prefers_night && !person.avoids_night && (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </TableCell>
                    )}

                    {/* Email Cell */}
                    {visibleColumns.email && (
                      <TableCell className="text-xs font-mono text-slate-600">
                        {person.email || '—'}
                      </TableCell>
                    )}

                    {/* Phone Cell */}
                    {visibleColumns.phone && (
                      <TableCell className="text-xs text-slate-600">
                        {person.phone || '—'}
                      </TableCell>
                    )}

                    {/* Licenses Cell */}
                    {visibleColumns.driver_licenses && (
                      <TableCell>
                        {person.driver_licenses && person.driver_licenses.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {person.driver_licenses.map(lic => (
                              <Badge key={lic} variant="outline" className="text-[9px] bg-slate-100 text-slate-700 border-slate-200">
                                {lic}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                    )}

                    {/* Birth Date Cell */}
                    {visibleColumns.birth_date && (
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {person.birth_date || '—'}
                      </TableCell>
                    )}

                    {/* Hire Date Cell */}
                    {visibleColumns.hire_date && (
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {person.hire_date || '—'}
                      </TableCell>
                    )}

                    {/* Termination Date Cell */}
                    {visibleColumns.termination_date && (
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {person.termination_date || '—'}
                      </TableCell>
                    )}

                    {/* Requires Transport Cell */}
                    {visibleColumns.requires_transport && (
                      <TableCell>
                        <Badge variant="outline" className={person.requires_transport ? 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]' : 'bg-slate-50 text-slate-500 border-slate-200 text-[10px]'}>
                          {person.requires_transport ? 'Sí' : 'No'}
                        </Badge>
                      </TableCell>
                    )}

                    {/* Is Active Cell */}
                    {visibleColumns.is_active && (
                      <TableCell>
                        <Badge variant="outline" className={person.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]' : 'bg-rose-50 text-rose-700 border-rose-200 text-[10px]'}>
                          {person.is_active ? 'Activo' : 'De baja'}
                        </Badge>
                      </TableCell>
                    )}

                    {/* Actions Cell */}
                    <TableCell className="text-right">
                      {canEdit ? (
                        <Link href={`/personnel/${person.id}/edit`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-orange-600">
                             <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/personnel/${person.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-orange-600">
                             <FileText className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 mb-4">
            <UsersIcon className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">
            No se encontró personal para el filtro actual.
          </p>
        </div>
      )}
    </div>
  );
}
