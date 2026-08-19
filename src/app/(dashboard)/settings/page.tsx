'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Settings as SettingsIcon, Building, Users, Shield, Bell, FileText, History } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function SettingsPage() {
  const handleSettingClick = (title: string) => {
    toast.info(`Módulo ${title}`, {
      description: 'Este módulo de configuración se activará en la próxima expansión de la Fase 2.',
    });
  };

  const settingsItems = [
    { icon: Building, title: 'Ajustes de Compañía', desc: 'Gestionar información, razones sociales y configuración general', href: '/settings/companies' },
    { icon: FileText, title: 'Documentos Requeridos', desc: 'Configurar qué documentos debe subir cada empleado y cuáles son obligatorios', href: '/settings/documents' },
    { icon: Users, title: 'Gestión de Usuarios', desc: 'Gestionar usuarios del sistema, roles y permisos', href: '/settings/users' },
    { icon: Shield, title: 'Seguridad', desc: 'Políticas de contraseña, gestión de sesiones y registros de auditoría' },
    { icon: Bell, title: 'Notificaciones', desc: 'Configurar integración con WhatsApp y preferencias de alertas', href: '/settings/whatsapp' },
    { icon: SettingsIcon, title: 'Reglas de Programación', desc: 'Ventana de congelación, horas máximas, períodos de descanso y restricciones' },
    { icon: History, title: 'Ingreso Histórico', desc: 'Registrar turnos extras y transportes propios de periodos anteriores al inicio de la app', href: '/settings/historical-records' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configuración y preferencias del sistema
        </p>
      </div>

      <div className="space-y-4">
        {settingsItems.map((item) => {
          const content = (
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </CardContent>
          );

          if (item.href) {
            return (
              <Link key={item.title} href={item.href}>
                <Card 
                  className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-orange-200 dark:hover:border-orange-900 transition-all duration-200 cursor-pointer"
                >
                  {content}
                </Card>
              </Link>
            );
          }

          return (
            <Card 
              key={item.title} 
              onClick={() => handleSettingClick(item.title)}
              className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-orange-200 dark:hover:border-orange-900 transition-all duration-200 cursor-pointer"
            >
              {content}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
