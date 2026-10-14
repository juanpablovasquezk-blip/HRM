'use client';

import React, { useEffect, useRef, useState } from 'react';

interface KioskAutoFitProps {
  children: React.ReactNode;
  baseWidth?: number;
  baseHeight?: number;
  className?: string;
}

export function KioskAutoFit({
  children,
  baseWidth = 1280,
  baseHeight = 720,
  className = '',
}: KioskAutoFitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth === 0 || clientHeight === 0) return;

      const scaleX = clientWidth / baseWidth;
      const scaleY = clientHeight / baseHeight;
      const calculatedScale = Math.min(scaleX, scaleY);

      setScale(calculatedScale > 0 ? calculatedScale : 1);
      setIsReady(true);
    };

    updateScale();

    const resizeObserver = new ResizeObserver(() => {
      updateScale();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', updateScale);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [baseWidth, baseHeight]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden flex items-center justify-center select-none ${className}`}
      style={{ touchAction: 'none' }}
    >
      <div
        style={{
          width: baseWidth,
          height: baseHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          opacity: isReady ? 1 : 0,
          transition: 'opacity 0.2s ease-out',
        }}
        className="shrink-0 overflow-hidden"
      >
        {children}
      </div>
    </div>
  );
}
