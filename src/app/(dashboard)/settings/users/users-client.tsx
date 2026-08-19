'use client';

import React, { useState, useTransition } from 'react';
import { 
  UserPlus, 
  Search, 
  ShieldCheck, 
  User as UserIcon, 
  Briefcase, 
  Loader2, 
  Edit3,
  CheckCircle2,
  KeyRound
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { SystemUserItem, createSystemUser, updateSystemUserRole } from './actions';
import { Role } from '@/types/database';
import { getRoleBadgeColor, getRoleLabel } from '@/lib/auth/roles';

interface UsersClientProps {
  initialUsers: SystemUserItem[];
}

export function UsersClient({ initialUsers }: UsersClientProps) {
  const [users, setUsers] = useState<SystemUserItem[]>(initialUsers);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  // Create User Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('SAFETY_OFFICER');

  // Edit Role Modal State
  const [editUser, setEditUser] = useState<SystemUserItem | null>(null);
  const [newRole, setNewRole] = useState<Role>('USER');

  // Filter users by search
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = u.full_name.toLowerCase().includes(q);
    const emailMatch = u.email.toLowerCase().includes(q);
    const roleLabel = getRoleLabel(u.role).toLowerCase();
    const roleMatch = roleLabel.includes(q) || u.role.toLowerCase().includes(q);
    return nameMatch || emailMatch || roleMatch;
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    startTransition(async () => {
      const res = await createSystemUser({
        full_name: fullName,
        email,
        password,
        role: selectedRole,
      });

      if (res.success) {
        toast.success(`Usuario ${fullName} creado exitosamente como ${getRoleLabel(selectedRole)}`);
        setIsCreateOpen(false);
        setFullName('');
        setEmail('');
        setPassword('');
        setSelectedRole('SAFETY_OFFICER');

        // Optimistically add or refresh list
        const newUser: SystemUserItem = {
          id: `temp-${Date.now()}`,
          email: email.trim().toLowerCase(),
          full_name: fullName.trim(),
          role: selectedRole,
          created_at: new Date().toISOString(),
          is_worker: false,
        };
        setUsers([newUser, ...users]);
      } else {
        toast.error(res.error || 'Error al crear el usuario');
      }
    });
  };

  const handleUpdateRole = async () => {
    if (!editUser) return;

    startTransition(async () => {
      const res = await updateSystemUserRole(editUser.id, newRole);

      if (res.success) {
        toast.success(`Rol de ${editUser.full_name} actualizado a ${getRoleLabel(newRole)}`);
        setUsers(users.map((u) => (u.id === editUser.id ? { ...u, role: newRole } : u)));
        setEditUser(null);
      } else {
        toast.error(res.error || 'Error al actualizar el rol');
      }
    });
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestión de Usuarios del Sistema</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Administra usuarios con acceso al sistema, asignación de roles y cuentas administrativas.
          </p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-md flex items-center gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Crear Usuario Administrativo
        </Button>
      </div>

      {/* Main Table Card */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, email o rol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              Mostrando <span className="font-bold text-slate-800 dark:text-white">{filteredUsers.length}</span> usuarios
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol Asignado</TableHead>
                  <TableHead>Tipo de Cuenta</TableHead>
                  <TableHead>Fecha de Registro</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => {
                    const badgeClass = getRoleBadgeColor(u.role);
                    const roleLabel = getRoleLabel(u.role);

                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {u.full_name}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {u.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${badgeClass} font-semibold border-0`}>
                            {roleLabel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.is_worker ? (
                            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 gap-1">
                              <Briefcase className="h-3 w-3" />
                              Trabajador Vinculado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              Usuario Administrativo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.created_at ? format(parseISO(u.created_at), 'dd/MM/yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditUser(u);
                              setNewRole(u.role);
                            }}
                            className="h-8 text-slate-600 hover:text-orange-600 font-medium text-xs gap-1"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Cambiar Rol
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                      No se encontraron usuarios con ese criterio de búsqueda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal: Crear Usuario */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl">
          <form onSubmit={handleCreateUser}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-orange-600" />
                Crear Usuario del Sistema
              </DialogTitle>
              <DialogDescription className="text-xs">
                Crea accesos para personal de prevención de riesgos, supervisión o administración sin ingresarlo a la ficha de trabajadores.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Nombre Completo *</Label>
                <Input
                  id="full_name"
                  placeholder="Ej: Juan Pérez Morales"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Correo Electrónico *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="prevencion@empresa.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña Inicial *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role">Rol del Sistema *</Label>
                <Select value={selectedRole} onValueChange={(val) => setSelectedRole(val as Role)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAFETY_OFFICER">Prevención de Riesgos (Acceso Solo Lectura Fichas/EPP)</SelectItem>
                    <SelectItem value="SUPERVISOR">Supervisor (Gestión Turnos/Roster)</SelectItem>
                    <SelectItem value="HR">Recursos Humanos (Gestión Personal/Licencias)</SelectItem>
                    <SelectItem value="ADMIN">Administrador (Acceso Total)</SelectItem>
                    <SelectItem value="AIRPORT_ASSISTANT">Asistente Administrativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear Usuario
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Rol */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Cambiar Rol de Usuario</DialogTitle>
            <DialogDescription className="text-xs">
              Modifica los permisos de acceso para <span className="font-semibold text-slate-800 dark:text-white">{editUser?.full_name}</span> ({editUser?.email}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Nuevo Rol</Label>
              <Select value={newRole} onValueChange={(val) => setNewRole(val as Role)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona el nuevo rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAFETY_OFFICER">Prevención de Riesgos</SelectItem>
                  <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                  <SelectItem value="HR">Recursos Humanos</SelectItem>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="AIRPORT_ASSISTANT">Asistente Administrativo</SelectItem>
                  <SelectItem value="USER">Empleado / Trabajador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditUser(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateRole}
              disabled={isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white font-semibold"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
