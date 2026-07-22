'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateContractDocx } from '@/app/(dashboard)/personnel/generate-contract-docx';

interface ContractDownloadButtonProps {
  person: {
    first_name: string;
    last_name_father: string;
    last_name_mother?: string;
    rut: string;
    nationality?: string | null;
    marital_status?: string | null;
    birth_date?: string | null;
    address?: {
      street?: string;
      comuna?: string;
      city?: string;
    } | null;
    hire_date?: string | null;
    afp?: string | null;
    health_system?: string | null;
    isapre?: string | null;
  };
}

export function ContractDownloadButton({ person }: ContractDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      await generateContractDocx(person);
      toast.success('Contrato TICA descargado exitosamente');
    } catch (error: any) {
      console.error('Error generating contract:', error);
      toast.error('Error al generar el contrato', {
        description: error.message || 'Intente nuevamente',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1.5"
      onClick={handleDownload}
      disabled={isGenerating}
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="h-4 w-4" />
      )}
      Descargar Contrato TICA
    </Button>
  );
}
