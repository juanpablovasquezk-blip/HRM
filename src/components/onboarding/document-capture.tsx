'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Check, Trash2, ZoomIn, AlertCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface DocumentCaptureProps {
  id: string;
  label: string;
  description: string;
  type: 'card' | 'vertical_card' | 'selfie' | 'pdf';
  value: string | null; // Base64 del documento / PDF
  onChange: (value: string | null) => void;
  orientation?: 'landscape' | 'portrait';
}

export default function DocumentCapture({
  id,
  label,
  description,
  type,
  value,
  onChange,
  orientation,
}: DocumentCaptureProps) {
  const isInitiallyVertical = type === 'vertical_card' || 
    orientation === 'portrait' || 
    label.toLowerCase().includes('tica') || 
    label.toLowerCase().includes('pcp');

  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isVertical, setIsVertical] = useState<boolean>(isInitiallyVertical);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Aspect ratios: 0.630 for vertical cards (TICA/PCP), 1.586 for horizontal cards (ID/License), 1.0 for selfie
  const isCardType = type === 'card' || type === 'vertical_card';
  const targetRatio = type === 'selfie' ? 1.0 : (isVertical ? 0.630 : 1.586);

  // Reset editor states
  const resetEditor = () => {
    setSourceImage(null);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'pdf') {
      if (file.type !== 'application/pdf') {
        toast.error('Este documento solo acepta archivos en formato PDF.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Read PDF file as Base64
      const reader = new FileReader();
      reader.onload = () => {
        onChange(reader.result as string);
      };
      reader.onerror = () => {
        toast.error('Error al leer el archivo PDF');
      };
      reader.readAsDataURL(file);
    } else {
      // It's a card or selfie image
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor, selecciona un archivo de imagen válido.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setSourceImage(reader.result as string);
        setZoom(1);
        setPosition({ x: 0, y: 0 });
      };
      reader.readAsDataURL(file);
    }
  };

  // Drag handlers for cropping
  const handleStart = (clientX: number, clientY: number) => {
    if (!sourceImage) return;
    setIsDragging(true);
    dragStart.current = { x: clientX - position.x, y: clientY - position.y };
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    setPosition({
      x: clientX - dragStart.current.x,
      y: clientY - dragStart.current.y,
    });
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  // Crop image to canvas and trigger onChange
  const handleConfirmCrop = () => {
    if (!containerRef.current || !imageRef.current) return;

    const container = containerRef.current;
    const img = imageRef.current;

    // Create canvas
    // Target resolution: 600x952 for vertical card, 856x540 for horizontal card, 600x600 for selfie
    let canvasWidth = 856;
    if (type === 'selfie') {
      canvasWidth = 600;
    } else if (isVertical) {
      canvasWidth = 600;
    }
    const canvasHeight = Math.round(canvasWidth / targetRatio);

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Calculate scaling factors between viewport coordinates and canvas
    const viewWidth = container.clientWidth;
    const viewHeight = container.clientHeight;

    // Image rendered size in the viewport
    const renderWidth = viewWidth * zoom;
    const renderHeight = (viewWidth / (img.naturalWidth / img.naturalHeight)) * zoom;

    // Scale mapping factor from viewport to output canvas
    const scale = canvasWidth / viewWidth;

    // Offset in output canvas coordinates
    const dx = position.x * scale;
    const dy = position.y * scale;
    const dw = renderWidth * scale;
    const dh = renderHeight * scale;

    ctx.drawImage(img, dx, dy, dw, dh);

    // Output Base64
    const croppedBase64 = canvas.toDataURL('image/jpeg', 0.90);
    onChange(croppedBase64);
    resetEditor();
  };

  const handleRemove = () => {
    onChange(null);
    resetEditor();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{label}</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>

      {/* 1. PDF Mode File Upload View */}
      {type === 'pdf' && (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-900/30">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="application/pdf"
            className="hidden"
            id={`file-upload-${id}`}
          />

          {value ? (
            <div className="w-full flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-xl p-3">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500 text-white rounded-lg p-2">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200">Archivo PDF Cargado</p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Documento listo para envío</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-600 flex items-center justify-center">
                <Upload className="h-6 w-6" />
              </div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Selecciona tu archivo PDF (máx. 10MB)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border-orange-500/30 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 font-bold text-xs"
              >
                Seleccionar PDF
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 2. Image/Card/Selfie Selection Trigger (Hidden if file loaded or currently cropping) */}
      {type !== 'pdf' && !sourceImage && !value && (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-900/30">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
            id={`image-upload-${id}`}
          />
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-600 flex items-center justify-center">
              {type === 'selfie' ? <Camera className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
            </div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {isVertical ? 'Foto vertical de la credencial' : 'Foto frontal del documento'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border-orange-500/30 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 font-bold text-xs"
              >
                Subir o Tomar Foto
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Interactive Cropper Modal/View */}
      {sourceImage && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-950 p-4 space-y-4">
          <div className="text-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-orange-500">
              {isVertical ? 'Encuadra la Credencial Vertical (TICA / PCP)' : 'Encuadra el Documento'}
            </span>
            <p className="text-[9px] text-slate-400">Arrastra para mover la imagen y usa el deslizador para hacer zoom.</p>
            {isCardType && (
              <div className="pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsVertical(!isVertical);
                    setPosition({ x: 0, y: 0 });
                    setZoom(1);
                  }}
                  className="text-[11px] text-orange-400 hover:text-orange-300 font-semibold gap-1.5 h-6 px-2"
                >
                  <RotateCcw className="h-3 w-3" />
                  {isVertical ? 'Cambiar a Horizontal' : 'Cambiar a Vertical (TICA/PCP)'}
                </Button>
              </div>
            )}
          </div>

          {/* Viewport Box */}
          <div
            ref={containerRef}
            className="w-full bg-slate-900 relative overflow-hidden mx-auto border border-dashed border-slate-700 select-none touch-none rounded-lg"
            style={{
              aspectRatio: targetRatio,
              maxWidth: isVertical ? '260px' : '360px',
            }}
            onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
            onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchEnd={handleEnd}
          >
            <img
              ref={imageRef}
              src={sourceImage}
              alt="Source"
              draggable="false"
              className="absolute max-w-none origin-top-left pointer-events-none"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${100 * zoom}%`,
              }}
            />

            {/* Visual Guidelines */}
            <div className="absolute inset-0 border-2 border-orange-500 pointer-events-none rounded-lg"></div>
            {isCardType && (
              <div className="absolute inset-0 bg-transparent flex flex-col justify-between p-3 pointer-events-none">
                {isVertical && (
                  <div className="w-10 h-2 border border-white/40 rounded-full mx-auto mt-1"></div>
                )}
                <div className="flex justify-between w-full">
                  <div className="w-8 h-8 border-t-2 border-l-2 border-white/70"></div>
                  <div className="w-8 h-8 border-t-2 border-r-2 border-white/70"></div>
                </div>
                <div className="flex justify-between w-full">
                  <div className="w-8 h-8 border-b-2 border-l-2 border-white/70"></div>
                  <div className="w-8 h-8 border-b-2 border-r-2 border-white/70"></div>
                </div>
              </div>
            )}
            {type === 'selfie' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                <div className="w-2/3 h-2/3 border-4 border-dashed border-white rounded-full"></div>
              </div>
            )}
          </div>

          {/* Zoom Slider */}
          <div className="flex items-center gap-3 px-2">
            <ZoomIn className="h-4 w-4 text-slate-400" />
            <input
              type="range"
              min="1"
              max="4"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-orange-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-[10px] font-mono text-slate-400">{zoom.toFixed(1)}x</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetEditor}
              className="flex-1 bg-transparent border-slate-800 text-slate-400 hover:text-white rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmCrop}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold"
            >
              Recortar y Guardar
            </Button>
          </div>
        </div>
      )}

      {/* 4. Crop Confirmed / File Loaded Preview */}
      {type !== 'pdf' && value && (
        <div className="w-full flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded-2xl p-3 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center gap-3">
            <div className={`relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 flex items-center justify-center ${isVertical ? 'h-20 w-13 p-0.5' : 'h-14 w-20 p-0.5'}`}>
              <img src={value} alt="Preview" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isVertical ? 'Credencial Vertical (TICA)' : 'Foto Procesada'}
              </p>
              <p className="text-[10px] text-emerald-500 flex items-center gap-1 font-semibold">
                <Check className="h-3 w-3" /> Lista para guardar
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
