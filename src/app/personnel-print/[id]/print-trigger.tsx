'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export function PrintTrigger() {
  const [hasPrinted, setHasPrinted] = useState(false);

  useEffect(() => {
    // Wait for 1.2 seconds to ensure that all fonts and styles are loaded
    const timer = setTimeout(() => {
      if (!hasPrinted) {
        window.print();
        setHasPrinted(true);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [hasPrinted]);

  return (
    <Button 
      onClick={() => window.print()}
      className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl gap-2 font-bold text-xs uppercase"
    >
      <Printer className="h-4 w-4" />
      Imprimir / PDF
    </Button>
  );
}
