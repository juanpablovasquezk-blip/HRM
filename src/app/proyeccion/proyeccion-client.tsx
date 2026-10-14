'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { KioskAutoFit } from './components/kiosk-auto-fit';
import { ProyeccionDashboard } from './components/proyeccion-dashboard';
import { ProyeccionDaily } from './components/proyeccion-daily';
import { getProyeccionData, type ProyeccionPayload } from './actions';
import { 
  Play, 
  Pause, 
  RotateCw, 
  Maximize, 
  Minimize, 
  ChevronRight, 
  ChevronLeft,
  LayoutDashboard,
  CalendarCheck2
} from 'lucide-react';

interface ProyeccionClientProps {
  initialPayload: ProyeccionPayload;
}

const CYCLE_DURATION = 60; // 60 seconds per view

export default function ProyeccionClient({ initialPayload }: ProyeccionClientProps) {
  const [payload, setPayload] = useState<ProyeccionPayload>(initialPayload);
  const [currentView, setCurrentView] = useState<'dashboard' | 'daily'>('dashboard');
  const [timeLeft, setTimeLeft] = useState<number>(CYCLE_DURATION);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showHud, setShowHud] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Background refresh function
  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await getProyeccionData();
      if (res.data) {
        setPayload(res.data);
      }
    } catch (err) {
      console.warn('[ProyeccionClient] Error in background data refresh:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Switch to next view
  const toggleView = useCallback(() => {
    setCurrentView(prev => (prev === 'dashboard' ? 'daily' : 'dashboard'));
    setTimeLeft(CYCLE_DURATION);
    // Auto-refresh data on each view change
    refreshData();
  }, [refreshData]);

  // Timer countdown
  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          toggleView();
          return CYCLE_DURATION;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused, toggleView]);

  // Auto-hide HUD on mouse idle
  const handleMouseMove = () => {
    setShowHud(true);
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    hudTimeoutRef.current = setTimeout(() => {
      setShowHud(false);
    }, 3500);
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    };
  }, []);

  // Keyboard controls (Space to toggle pause, Left/Right to switch, F for fullscreen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPaused(p => !p);
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault();
        toggleView();
      } else if (e.key.toLowerCase() === 'f') {
        handleToggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleView]);

  // Fullscreen toggle handler
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  // Listen to fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const progressPercent = ((CYCLE_DURATION - timeLeft) / CYCLE_DURATION) * 100;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* ── TOP CYCLE PROGRESS BAR ── */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-800 z-50 overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${
            currentView === 'dashboard' ? 'bg-orange-500 shadow-orange-500/50 shadow-sm' : 'bg-indigo-500 shadow-indigo-500/50 shadow-sm'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ── AUTO-FITTING VIRTUAL CANVAS (1280 x 720) ── */}
      <KioskAutoFit baseWidth={1280} baseHeight={720} className="w-full h-full">
        <div className="relative w-full h-full">
          {/* DASHBOARD VIEW */}
          <div
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              currentView === 'dashboard'
                ? 'opacity-100 pointer-events-auto z-10'
                : 'opacity-0 pointer-events-none z-0'
            }`}
          >
            <ProyeccionDashboard data={payload.dashboard} />
          </div>

          {/* DAILY PLANNING VIEW */}
          <div
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              currentView === 'daily'
                ? 'opacity-100 pointer-events-auto z-10'
                : 'opacity-0 pointer-events-none z-0'
            }`}
          >
            <ProyeccionDaily data={payload.daily} />
          </div>
        </div>
      </KioskAutoFit>

      {/* ── FLOATING HUD CONTROLS (AUTO-HIDES ON IDLE) ── */}
      <div
        className={`absolute bottom-5 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 transform ${
          showHud ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-4 py-2 rounded-2xl shadow-2xl text-slate-200 text-xs">
          {/* Current view indicator & quick switch buttons */}
          <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setCurrentView('dashboard');
                setTimeLeft(CYCLE_DURATION);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all ${
                currentView === 'dashboard'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => {
                setCurrentView('daily');
                setTimeLeft(CYCLE_DURATION);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all ${
                currentView === 'daily'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <CalendarCheck2 className="w-3.5 h-3.5" />
              <span>Planificación</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          {/* Countdown & Pause/Play */}
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={() => setIsPaused(p => !p)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
              title={isPaused ? 'Reanudar rotación (Espacio)' : 'Pausar rotación (Espacio)'}
            >
              {isPaused ? <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
            </button>
            <span className="font-mono text-xs font-bold text-slate-300 w-12 text-center">
              {isPaused ? 'PAUSA' : `${timeLeft}s`}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          {/* Manual switch next */}
          <button
            onClick={toggleView}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Cambiar a la siguiente vista (Flechas)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Force Refresh */}
          <button
            onClick={refreshData}
            disabled={isRefreshing}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            title="Actualizar datos ahora"
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-orange-400' : ''}`} />
          </button>

          {/* Fullscreen */}
          <button
            onClick={handleToggleFullscreen}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Pantalla Completa (F)"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
