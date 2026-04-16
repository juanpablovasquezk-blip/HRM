'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit2, Trash2, Building, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createCompany, updateCompany, deleteCompany } from './actions';

interface Company {
  id: string;
  name: string;
  created_at: string;
}

export function CompaniesClient({ initialCompanies }: { initialCompanies: Company[] }) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsLoading(true);
    const result = await createCompany(newName);
    setIsLoading(false);
    
    if (result.error) {
      toast.error('Error al crear empresa', { description: result.error });
    } else {
      toast.success('Empresa creada correctamente');
      setNewName('');
      window.location.reload(); // Quick way to sync server components
    }
  };

  const handleUpdate = async (id: string, name: string) => {
    setIsLoading(true);
    const result = await updateCompany(id, name);
    setIsLoading(false);
    
    if (result.error) {
      toast.error('Error al actualizar', { description: result.error });
    } else {
      toast.success('Empresa actualizada');
      setIsEditing(null);
      window.location.reload();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta empresa? Esto fallará si tiene personal asignado.')) return;
    setIsLoading(true);
    const result = await deleteCompany(id);
    setIsLoading(false);
    
    if (result.error) {
      toast.error('No se pudo eliminar', { description: 'Asegúrate de que no tenga personal o dependencias activas.' });
    } else {
      toast.success('Empresa eliminada');
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Nueva Empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="company-name" className="sr-only">Nombre de la Empresa</Label>
              <Input 
                id="company-name"
                placeholder="Ej. Logística Norte S.A." 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isLoading || !newName.trim()} className="bg-orange-600 hover:bg-orange-700 text-white">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Agregar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {companies.map((company) => (
          <Card key={company.id} className="border-slate-200/60 dark:border-slate-800 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 mr-4">
                <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 flex items-center justify-center shrink-0">
                  <Building className="h-5 w-5" />
                </div>
                {isEditing === company.id ? (
                  <Input 
                    defaultValue={company.name}
                    autoFocus
                    onBlur={(e) => handleUpdate(company.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdate(company.id, e.currentTarget.value);
                      if (e.key === 'Escape') setIsEditing(null);
                    }}
                    className="h-8"
                  />
                ) : (
                  <p className="font-medium text-sm truncate">{company.name}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-slate-400 hover:text-orange-600"
                  onClick={() => setIsEditing(company.id)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-slate-400 hover:text-red-600"
                  onClick={() => handleDelete(company.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
