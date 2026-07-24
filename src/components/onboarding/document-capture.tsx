'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Check, Trash2, ZoomIn, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface DocumentCaptureProps {
  id: string;
  label: string;
  description: string;
  type: 'card' | 'selfie' | 'pdf';
  value: string | null; // Base64 del documento / PDF
  onChange: (value: string | null) => void;
}

export default function DocumentCapture({
  id,
  label,
  description,
  type,
  value,
  onChange,
}: DocumentCaptureProps) {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Aspect ratios: 1.586 for cards (ID/License), 1.0 for selfie
  const targetRatio = type === 'card' ? 1.586 : 1.0;

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
    const canvas = document.createElement('canvas');
    // Target resolution: 800px width for cards, 600px width for selfie
    const canvasWidth = type === 'card' ? 800 : 600;
    const canvasHeight = Math.round(canvasWidth / targetRatio);

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
    const croppedBase64 = canvas.toDataURL('image/jpeg', 0.85);
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
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Documento Cargado</p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-500">Formato PDF Validado</p>
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
            <label
              htmlFor={`file-upload-${id}`}
              className="flex flex-col items-center gap-2 cursor-pointer w-full text-center hover:opacity-80 transition"
            >
              <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <Upload className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold text-orange-500">Seleccionar Certificado PDF</span>
              <span className="text-[10px] text-slate-400">Solo archivos PDF (máx. 5MB)</span>
            </label>
          )}
        </div>
      )}

      {/* 2. Image Capture Mode (Cards & Selfie) */}
      {type !== 'pdf' && !value && !sourceImage && (
        <div className="grid grid-cols-2 gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
            id={`file-img-${id}`}
          />
          <input
            type="file"
            onChange={handleFileChange}
            accept="image/*"
            capture={type === 'selfie' ? 'user' : 'environment'}
            className="hidden"
            id={`camera-img-${id}`}
          />

          <label
            htmlFor={`camera-img-${id}`}
            className="flex flex-col items-center justify-center gap-2 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition text-center"
          >
            <div className="h-10 w-10 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-500 flex items-center justify-center">
              <Camera className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Tomar Foto</span>
          </label>

          <label
            htmlFor={`file-img-${id}`}
            className="flex flex-col items-center justify-center gap-2 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition text-center"
          >
            <div className="h-10 w-10 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
              <Upload className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Subir Archivo</span>
          </label>
        </div>
      )}

      {/* 3. Interactive Cropper Modal/View */}
      {sourceImage && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-950 p-4 space-y-4">
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-orange-500">Encuadra la Cédula/Foto</span>
            <p className="text-[9px] text-slate-400">Arrastra para mover la imagen y usa el deslizador para hacer zoom.</p>
          </div>

          {/* Viewport Box */}
          <div
            ref={containerRef}
            className="w-full bg-slate-900 relative overflow-hidden mx-auto border border-dashed border-slate-700 select-none touch-none"
            style={{
              aspectRatio: targetRatio,
              maxWidth: '360px',
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
            <div className="absolute inset-0 border-2 border-orange-500 pointer-events-none rounded-sm"></div>
            {type === 'card' && (
              <div className="absolute inset-0 bg-transparent flex flex-col justify-between p-4 pointer-events-none">
                <div className="w-12 h-12 border-t-4 border-l-4 border-white"></div>
                <div className="self-end w-12 h-12 border-b-4 border-r-4 border-white"></div>
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
            <div className="relative h-14 w-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white">
              <img src={value} alt="Preview" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Foto Procesada</p>
              <p className="text-[10px] text-emerald-500 flex items-center gap-1 font-semibold">
                <Check className="h-3 w-3" /> Lista para subir
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
