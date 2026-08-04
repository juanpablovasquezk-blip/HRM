'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Bell, 
  BellRing, 
  FileWarning, 
  AlertTriangle, 
  XCircle, 
  UserCheck, 
  Users, 
  Check, 
  CheckCheck,
  RefreshCw
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getDashboardAlerts
} from '@/app/(dashboard)/notifications/actions';

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'hace un momento';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `hace ${diffInMinutes} min`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `hace ${diffInHours} ${diffInHours === 1 ? 'hora' : 'horas'}`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'ayer';
  if (diffInDays < 7) return `hace ${diffInDays} días`;
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function NotificationCenter() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleAlertClick = (alertId: string) => {
    setIsOpen(false);
    switch (alertId) {
      case 'docs-expired':
      case 'docs-expiring':
      case 'docs-pending':
        router.push('/documents');
        break;
      case 'fichas-incomplete':
        router.push('/personnel?status=incomplete');
        break;
      case 'fichas-updated':
        router.push('/personnel');
        break;
      default:
        break;
    }
  };

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [notifsData, alertsData] = await Promise.all([
        getNotifications(50),
        getDashboardAlerts()
      ]);
      
      setNotifications(notifsData.notifications);
      setUnreadCount(notifsData.unreadCount);
      setAlerts(alertsData.alerts);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleMarkAsRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllAsRead = async () => {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const getAlertIcon = (type: string, id: string) => {
    if (id === 'docs-expired') return <XCircle className="h-5 w-5 text-red-500" />;
    if (id === 'docs-expiring') return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    if (id === 'fichas-incomplete') return <Users className="h-5 w-5 text-amber-500" />;
    if (id === 'fichas-updated') return <UserCheck className="h-5 w-5 text-blue-500" />;
    return <FileWarning className="h-5 w-5 text-slate-500" />;
  };

  const getAlertBorder = (type: string) => {
    switch (type) {
      case 'danger': return 'border-l-red-500';
      case 'warning': return 'border-l-amber-500';
      case 'info': return 'border-l-blue-500';
      case 'success': return 'border-l-emerald-500';
      default: return 'border-l-slate-500';
    }
  };

  const totalAlertsCount = alerts.reduce((acc, alert) => acc + (alert.count || 1), 0);
  const totalBadgeCount = unreadCount + totalAlertsCount;
  const hasAlertsOrUnread = totalBadgeCount > 0;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className={cn("relative h-9 w-9 rounded-xl transition-all", hasAlertsOrUnread && "animate-pulse-slow")} id="notifications-btn" />}>
        {hasAlertsOrUnread ? <BellRing className="h-[18px] w-[18px] text-orange-500" /> : <Bell className="h-[18px] w-[18px]" />}
        {hasAlertsOrUnread && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] font-bold border-2 border-white dark:border-slate-950 bg-red-500 text-white hover:bg-red-600 flex items-center justify-center rounded-full"
          >
            {totalBadgeCount > 99 ? '99+' : totalBadgeCount}
          </Badge>
        )}
      </SheetTrigger>
      
      <SheetContent className="w-full sm:max-w-md h-full max-h-screen overflow-hidden flex flex-col p-0 gap-0 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
        <SheetHeader className="p-6 pb-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm z-10">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl font-bold">Centro de Notificaciones</SheetTitle>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-8 w-8 rounded-full", refreshing && "animate-spin")} 
                onClick={() => loadData(true)}
              >
                <RefreshCw className="h-4 w-4 text-slate-500" />
              </Button>
            </div>
          </div>
          <SheetDescription className="hidden">Gestiona tus alertas y notificaciones</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="alertas" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <TabsList className="w-full grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <TabsTrigger value="alertas" className="rounded-md">
                Alertas
                {totalAlertsCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 bg-slate-200 dark:bg-slate-700 text-[10px]">
                    {totalAlertsCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="notificaciones" className="rounded-md">
                Notificaciones
                {unreadCount > 0 && (
                  <Badge variant="default" className="ml-2 h-5 px-1.5 bg-blue-500 text-white text-[10px]">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="alertas" className="flex-1 m-0 data-[state=inactive]:hidden min-h-0 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4 flex flex-col gap-3">
                {loading ? (
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-24 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
                    ))}
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                      <CheckCheck className="h-6 w-6 text-slate-400" />
                    </div>
                    <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">Todo al día</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-[200px]">No hay alertas pendientes en tu panel.</p>
                  </div>
                ) : (
                  alerts.map(alert => {
                    const hasDataItems = alert.data && Array.isArray(alert.data) && alert.data.length > 0;
                    
                    return (
                      <div 
                        key={alert.id} 
                        onClick={() => handleAlertClick(alert.id)}
                        className={cn(
                          "bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm relative overflow-hidden group",
                          "border-l-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all", 
                          getAlertBorder(alert.type)
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 p-1.5 rounded-full bg-slate-50 dark:bg-slate-800 shrink-0">
                            {getAlertIcon(alert.type, alert.id)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                {alert.category}
                              </span>
                            </div>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                              {alert.title}
                            </h4>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                              {alert.message}
                            </p>

                            {hasDataItems && (
                              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/50 flex flex-col gap-1.5">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Casos que requieren atención:</p>
                                <div className="flex flex-col gap-1">
                                  {alert.data.map((item: any) => {
                                    const p = item.personnel || item;
                                    if (!p || !p.id) return null;
                                    return (
                                      <button
                                        key={item.id || p.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setIsOpen(false);
                                          router.push(`/personnel/${p.id}`);
                                        }}
                                        className="text-left text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold flex justify-between items-center bg-blue-50/50 dark:bg-blue-900/10 px-2.5 py-1.5 rounded-lg group/btn hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-all"
                                      >
                                        <span>{p.first_name} {p.last_name_father}</span>
                                        <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-300 font-semibold max-w-[150px] truncate">
                                          {item.type || 'Ver Ficha'}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="notificaciones" className="flex-1 m-0 data-[state=inactive]:hidden min-h-0 flex flex-col overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between sticky top-0 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-sm z-10 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {unreadCount} sin leer
              </span>
              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleMarkAllAsRead}
                  className="h-7 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
                  Marcar todo como leído
                </Button>
              )}
            </div>
            
            <ScrollArea className="flex-1">
              <div className="flex flex-col">
                {loading ? (
                  <div className="p-4 flex flex-col gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-20 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800/50 animate-pulse" />
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                      <Bell className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                    </div>
                    <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">Sin notificaciones</h3>
                    <p className="text-xs text-slate-500 mt-1">Cuando tengas nuevas notificaciones, aparecerán aquí.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {notifications.map(notif => (
                      <div 
                        key={notif.id} 
                        className={cn(
                          "p-4 transition-colors relative group",
                          !notif.is_read ? "bg-blue-50/50 dark:bg-blue-950/20" : "bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-slate-900/50"
                        )}
                      >
                        {!notif.is_read && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                        )}
                        <div className="flex gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h4 className={cn("text-sm truncate", !notif.is_read ? "font-semibold text-slate-900 dark:text-slate-100" : "font-medium text-slate-700 dark:text-slate-300")}>
                                {notif.title}
                              </h4>
                              <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                                {formatRelativeTime(notif.created_at)}
                              </span>
                            </div>
                            <p className={cn("text-xs line-clamp-2 leading-relaxed", !notif.is_read ? "text-slate-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-400")}>
                              {notif.message}
                            </p>
                          </div>
                          {!notif.is_read && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700"
                              onClick={() => handleMarkAsRead(notif.id)}
                              title="Marcar como leída"
                            >
                              <Check className="h-3 w-3 text-slate-600 dark:text-slate-300" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
