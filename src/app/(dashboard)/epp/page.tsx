'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { jsPDF } from 'jspdf';
import { 
  Shirt, 
  Users, 
  Boxes, 
  ChevronRight, 
  ChevronDown, 
  Calendar, 
  Building, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Plus, 
  Search, 
  Download, 
  Upload, 
  History, 
  X, 
  ExternalLink, 
  Trash2,
  Undo2,
  FileDown,
  Settings2,
  Save,
  Edit,
  Grid3X3
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { createClient } from '@/lib/supabase/client';
import { 
  getEPPPersonnelData, 
  addInventoryBatch, 
  registerDeliveryEvent, 
  returnDeliveryItem, 
  uploadSignedFormUrl,
  getMonthlyEPPForecastReport,
  ForecastReportItem,
  getProductCatalog,
  saveProductCatalogItem,
  deleteProductCatalogItem,
  getAllPositionsWithAreas,
  bulkSaveRequirementsMatrix,
  ProductCatalogItem
} from './actions';
import { generateDeliveryFormPDF } from './generate-delivery-pdf';

export default function EPPPage() {
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // Data States
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('all');
  
  // Expanded workers list
  const [expandedWorkers, setExpandedWorkers] = useState<Record<string, boolean>>({});

  // Dialog States
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [isCatalogDialogOpen, setIsCatalogDialogOpen] = useState(false);
  const [isDeliverOpen, setIsDeliverOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);

  // Form States - Add Stock
  const [stockType, setStockType] = useState<'UNIFORM' | 'EPP'>('EPP');
  const [stockName, setStockName] = useState('');
  const [stockSize, setStockSize] = useState('');
  const [stockPrice, setStockPrice] = useState(0);
  const [stockInvoice, setStockInvoice] = useState('');
  const [stockQty, setStockQty] = useState(0);
  const [stockCompany, setStockCompany] = useState('');

  // Form States - Catalog Item
  const [editingCatalogItem, setEditingCatalogItem] = useState<ProductCatalogItem | null>(null);
  const [catType, setCatType] = useState<'UNIFORM' | 'EPP'>('EPP');
  const [catName, setCatName] = useState('');
  const [catUsesSizes, setCatUsesSizes] = useState(false);
  const [catSizeField, setCatSizeField] = useState('');
  const [catRenewalDays, setCatRenewalDays] = useState(180);

  // Catalog & Matrix Data
  const [catalog, setCatalog] = useState<ProductCatalogItem[]>([]);
  const [allPositions, setAllPositions] = useState<any[]>([]);
  const [matrixData, setMatrixData] = useState<Record<string, Record<string, number>>>({});
  const [originalMatrixData, setOriginalMatrixData] = useState<Record<string, Record<string, number>>>({});
  const [savingMatrix, setSavingMatrix] = useState(false);

  // Form States - Deliver Items
  const [activeWorker, setActiveWorker] = useState<any | null>(null);
  const [deliverDate, setDeliverDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDeliverItems, setSelectedDeliverItems] = useState<Record<string, {
    selected: boolean;
    reason: 'FIRST_TIME' | 'EXPIRATION' | 'DAMAGE';
    quantity: number;
    renewalDays: number;
    size: string;
  }>>({});

  // Form States - Return Item
  const [activeReturnItem, setActiveReturnItem] = useState<any | null>(null);
  const [returnQty, setReturnQty] = useState(1);

  // Form States - Past Delivery (Bootstrap)
  const [pastWorkerId, setPastWorkerId] = useState('');
  const [pastProductName, setPastProductName] = useState('');
  const [pastQty, setPastQty] = useState(1);
  const [pastSize, setPastSize] = useState('');
  const [pastDate, setPastDate] = useState('');
  const [pastRenewal, setPastRenewal] = useState(180);

  // Forecast Report States
  const [forecastMonth, setForecastMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [forecastData, setForecastData] = useState<ForecastReportItem[]>([]);
  const [generatingForecast, setGeneratingForecast] = useState(false);

  // File Upload State
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);

  // Fetch initial data
  const fetchData = async () => {
    const [res, catRes, posRes] = await Promise.all([
      getEPPPersonnelData(),
      getProductCatalog(),
      getAllPositionsWithAreas(),
    ]);

    if (res.error) {
      toast.error('Error al cargar datos: ' + res.error);
    } else if (res.data) {
      setPersonnel(res.data.personnel);
      setRequirements(res.data.requirements);
      setInventory(res.data.inventory);
      setCompanies(res.data.companies);
      
      // Auto-set default company for forms
      if (res.data.companies.length > 0) {
        setStockCompany(res.data.companies[0].id);
      }

      // Build matrix data from existing requirements
      if (catRes.data && posRes.data) {
        const matrix: Record<string, Record<string, number>> = {};
        posRes.data.forEach((pos: any) => {
          matrix[pos.id] = {};
          catRes.data!.forEach(cat => {
            matrix[pos.id][cat.id] = 0;
          });
        });
        // Populate from existing requirements
        (res.data.requirements || []).forEach((req: any) => {
          if (req.product_catalog_id && matrix[req.position_id]) {
            matrix[req.position_id][req.product_catalog_id] = req.quantity || 0;
          }
        });
        setMatrixData(matrix);
        setOriginalMatrixData(JSON.parse(JSON.stringify(matrix)));
      }
    }

    if (catRes.data) setCatalog(catRes.data);
    if (posRes.data) setAllPositions(posRes.data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleWorker = (id: string) => {
    setExpandedWorkers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Filtered workers list
  const filteredPersonnel = personnel.filter(p => {
    const fullName = `${p.first_name} ${p.last_name_father} ${p.last_name_mother || ''}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase()) || p.rut.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCompany = selectedCompanyId === 'all' || p.company_id === selectedCompanyId;
    return matchesSearch && matchesCompany;
  });

  // Calculate unique list of products currently in requirements/inventory to auto-suggest
  const uniqueProducts = Array.from(new Set([
    ...requirements.map(r => r.product_name),
    ...inventory.map(i => i.name)
  ])).sort();

  const uniquePositions = Array.from(new Map(
    personnel.filter(p => p.position).map(p => [p.main_position, p.position])
  ).values());

  // Size field list options
  const sizeFieldOptions = [
    { label: 'Talla de Polera (Letra)', value: 'clothing_tshirt_size' },
    { label: 'Talla de Polar (Letra)', value: 'clothing_polar_size' },
    { label: 'Talla de Pantalón (Letra)', value: 'clothing_pants_size_letter' },
    { label: 'Talla de Pantalón (Número)', value: 'clothing_pants_size_number' },
    { label: 'Talla de Zapatos (Número)', value: 'clothing_shoe_size' },
    { label: 'Talla de Parka (Letra)', value: 'clothing_parka_size' },
    { label: 'Talla de Jardinera Térmica (Letra)', value: 'clothing_overall_size' },
    { label: 'Ninguno (Talla Única)', value: '' }
  ];

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Add Stock handler
  const handleAddStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockName || !stockQty) {
      toast.error('Faltan campos obligatorios');
      return;
    }

    startTransition(async () => {
      const res = await addInventoryBatch({
        companyId: stockCompany,
        type: stockType,
        name: stockName,
        size: stockSize || 'Única',
        price: stockPrice,
        invoiceNumber: stockInvoice,
        stockQty: stockQty
      });

      if (res.success) {
        toast.success('Lote de stock ingresado correctamente');
        setIsAddStockOpen(false);
        setStockName('');
        setStockSize('');
        setStockPrice(0);
        setStockInvoice('');
        setStockQty(0);
        fetchData();
      } else {
        toast.error('Error: ' + res.error);
      }
    });
  };

  // Add Catalog Item handler
  const handleCatalogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName) {
      toast.error('El nombre del implemento es obligatorio');
      return;
    }

    startTransition(async () => {
      const res = await saveProductCatalogItem({
        id: editingCatalogItem?.id,
        productType: catType,
        name: catName,
        usesSizes: catUsesSizes,
        sizeField: catUsesSizes ? catSizeField || null : null,
        renewalDays: catRenewalDays,
      });

      if (res.success) {
        toast.success(editingCatalogItem ? 'Implemento actualizado' : 'Implemento creado correctamente');
        setIsCatalogDialogOpen(false);
        resetCatalogForm();
        fetchData();
      } else {
        toast.error('Error: ' + res.error);
      }
    });
  };

  const resetCatalogForm = () => {
    setEditingCatalogItem(null);
    setCatType('EPP');
    setCatName('');
    setCatUsesSizes(false);
    setCatSizeField('');
    setCatRenewalDays(180);
  };

  const openEditCatalog = (item: ProductCatalogItem) => {
    setEditingCatalogItem(item);
    setCatType(item.product_type);
    setCatName(item.name);
    setCatUsesSizes(item.uses_sizes);
    setCatSizeField(item.size_field || '');
    setCatRenewalDays(item.renewal_days);
    setIsCatalogDialogOpen(true);
  };

  // Delete Catalog Item
  const handleDeleteCatalog = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este implemento del catálogo?')) return;
    startTransition(async () => {
      const res = await deleteProductCatalogItem(id);
      if (res.success) {
        toast.success('Implemento eliminado del catálogo');
        fetchData();
      } else {
        toast.error('Error: ' + res.error);
      }
    });
  };

  // Matrix cell change
  const handleMatrixChange = (positionId: string, catalogId: string, value: number) => {
    setMatrixData(prev => ({
      ...prev,
      [positionId]: {
        ...prev[positionId],
        [catalogId]: value,
      },
    }));
  };

  // Check if matrix has unsaved changes
  const matrixHasChanges = JSON.stringify(matrixData) !== JSON.stringify(originalMatrixData);

  // Save Matrix
  const handleSaveMatrix = async () => {
    setSavingMatrix(true);
    try {
      const entries: { positionId: string; productCatalogId: string; quantity: number }[] = [];
      const allPosIds = allPositions.map(p => p.id);
      const allCatIds = catalog.map(c => c.id);

      for (const posId of allPosIds) {
        for (const catId of allCatIds) {
          const qty = matrixData[posId]?.[catId] || 0;
          if (qty > 0) {
            entries.push({ positionId: posId, productCatalogId: catId, quantity: qty });
          }
        }
      }

      const res = await bulkSaveRequirementsMatrix(entries, allPosIds, allCatIds);
      if (res.success) {
        toast.success('Matriz de requerimientos guardada exitosamente');
        setOriginalMatrixData(JSON.parse(JSON.stringify(matrixData)));
        fetchData();
      } else {
        toast.error('Error al guardar: ' + res.error);
      }
    } catch (err: any) {
      toast.error('Error al guardar matriz: ' + (err?.message || err));
    } finally {
      setSavingMatrix(false);
    }
  };

  // Group positions by area for matrix display
  const positionsByArea = allPositions.reduce((acc: Record<string, any[]>, pos: any) => {
    const areaName = pos.area?.name || 'Sin Área';
    if (!acc[areaName]) acc[areaName] = [];
    acc[areaName].push(pos);
    return acc;
  }, {} as Record<string, any[]>);

  // Open Delivery Dialog
  const openDeliverDialog = (worker: any) => {
    setActiveWorker(worker);
    setDeliverDate(format(new Date(), 'yyyy-MM-dd'));

    // Populate checklist with requirements of their position
    const checklist: Record<string, any> = {};
    worker.requirements.forEach((req: any) => {
      checklist[req.productName] = {
        selected: false,
        reason: req.status === 'PENDING_FIRST' ? 'FIRST_TIME' : 'EXPIRATION',
        quantity: req.quantity,
        renewalDays: req.renewalDays,
        size: req.size,
      };
    });
    setSelectedDeliverItems(checklist);
    setIsDeliverOpen(true);
  };

  // Check current stock quantity for product + size helper
  const checkStock = (name: string, size: string) => {
    return inventory
      .filter(i => i.name === name && i.size === size)
      .reduce((sum, current) => sum + current.stock_qty, 0);
  };

  // Deliver Items Submit
  const handleDeliverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorker) return;

    // Filter selected items
    const selectedItemsInput = Object.entries(selectedDeliverItems)
      .filter(([_, value]) => value.selected)
      .map(([name, value]) => ({
        productName: name,
        productType: (requirements.find(r => r.product_name === name)?.product_type || 'EPP') as 'UNIFORM' | 'EPP',
        size: value.size,
        quantity: value.quantity,
        reason: value.reason,
        renewalDays: value.renewalDays,
      }));

    if (selectedItemsInput.length === 0) {
      toast.error('Selecciona al menos un implemento para entregar');
      return;
    }

    startTransition(async () => {
      const res = await registerDeliveryEvent(
        activeWorker.id,
        deliverDate,
        selectedItemsInput
      );

      if (res.success && res.eventId) {
        toast.success('Entrega registrada exitosamente');
        setIsDeliverOpen(false);

        // Generate PDF Receipt Client-Side automatically
        toast.loading('Generando Acta de Entrega en PDF...');
        
        const workerCompany = companies.find(c => c.id === activeWorker.company_id) || {
          name: activeWorker.company?.name || 'Grupo Minerquim',
          rut: activeWorker.company?.rut,
          giro: activeWorker.company?.giro,
        };

        const { data: { user } } = await supabase.auth.getUser();
        const deliverer = user?.user_metadata?.full_name || user?.email || 'Administrador';

        await generateDeliveryFormPDF({
          company: {
            name: workerCompany.name,
            rut: workerCompany.rut,
            giro: workerCompany.giro,
          },
          worker: {
            first_name: activeWorker.first_name,
            last_name_father: activeWorker.last_name_father,
            last_name_mother: activeWorker.last_name_mother,
            rut: activeWorker.rut,
            positionName: activeWorker.position?.name || 'Operario',
            areaName: activeWorker.position?.area?.name || 'Operaciones',
          },
          deliveryDate: deliverDate,
          items: selectedItemsInput.map(i => ({
            productName: i.productName,
            productType: i.productType,
            size: i.size,
            quantity: i.quantity,
            reason: i.reason,
          })),
          delivererName: deliverer,
        });

        toast.dismiss();
        toast.success('Acta PDF generada e iniciada la descarga. Imprímela y súbela firmada.');
        fetchData();
      } else {
        toast.error('Error de registro: ' + res.error);
      }
    });
  };

  // Open Return Dialog
  const openReturnDialog = (item: any) => {
    setActiveReturnItem(item);
    setReturnQty(1);
    setIsReturnOpen(true);
  };

  // Return Item Submit
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReturnItem) return;

    startTransition(async () => {
      const res = await returnDeliveryItem(activeReturnItem.id, returnQty);
      if (res.success) {
        toast.success('Devolución registrada e ingresada al stock');
        setIsReturnOpen(false);
        fetchData();
      } else {
        toast.error('Error: ' + res.error);
      }
    });
  };

  // Upload Scanned Form
  const handleFileUpload = async (eventId: string, file: File) => {
    setUploadingEventId(eventId);
    const loadingToast = toast.loading('Subiendo acta firmada al sistema...');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `signed-receipt-${eventId}-${Date.now()}.${fileExt}`;
      const filePath = `signed-epp-receipts/${fileName}`;

      // Upload file directly to Supabase storage bucket 'documents'
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Link URL to delivery event
      const res = await uploadSignedFormUrl(eventId, publicUrl);
      if (res.success) {
        toast.success('¡Acta firmada subida y respaldada exitosamente!', { id: loadingToast });
        fetchData();
      } else {
        toast.error(res.error || 'Error al vincular el documento', { id: loadingToast });
      }
    } catch (e: any) {
      toast.error(e.message || 'Error en la subida', { id: loadingToast });
    } finally {
      setUploadingEventId(null);
    }
  };

  // Past Delivery Bootstrap handler
  const handlePastDeliverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastWorkerId || !pastProductName || !pastQty || !pastDate) {
      toast.error('Faltan campos obligatorios');
      return;
    }

    startTransition(async () => {
      const selectedWorker = personnel.find(p => p.id === pastWorkerId);
      const requirement = requirements.find(
        r => r.position_id === selectedWorker?.main_position && r.product_name === pastProductName
      );

      const itemsInput = [{
        productName: pastProductName,
        productType: (requirement?.product_type || 'EPP') as 'UNIFORM' | 'EPP',
        size: pastSize || 'Única',
        quantity: pastQty,
        reason: 'PAST_DELIVERY' as const,
        renewalDays: pastRenewal,
      }];

      const res = await registerDeliveryEvent(
        pastWorkerId,
        pastDate,
        itemsInput
      );

      if (res.success) {
        toast.success('Carga histórica registrada con éxito');
        setPastDate('');
        setPastQty(1);
        setPastSize('');
        fetchData();
      } else {
        toast.error('Error al registrar carga histórica: ' + res.error);
      }
    });
  };

  // Get Monthly Forecast report helper
  const handleGenerateForecast = async () => {
    setGeneratingForecast(true);
    const res = await getMonthlyEPPForecastReport(forecastMonth);
    if (res.error) {
      toast.error('Error: ' + res.error);
    } else if (res.data) {
      setForecastData(res.data);
    }
    setGeneratingForecast(false);
  };

  // Generate PDF of forecast
  const downloadForecastPDF = () => {
    if (forecastData.length === 0) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    const usableW = pageW - margin * 2;

    let y = 15;

    // Header
    doc.setFillColor(26, 54, 93);
    doc.rect(margin, y, usableW, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORME MENSUAL DE REQUERIMIENTOS Y COMPRAS EPP', margin + usableW / 2, y + 6, { align: 'center' });

    y += 13;
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Mes de Consulta: ${forecastMonth}`, margin, y);
    doc.text(`Fecha Emisión: ${format(new Date(), 'dd/MM/yyyy')}`, pageW - margin, y, { align: 'right' });

    y += 5;

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, usableW, 7, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, y, usableW, 7);
    
    doc.setTextColor(26, 54, 93);
    doc.setFont('helvetica', 'bold');
    
    doc.text('IMPLEMENTO', margin + 3, y + 4.5);
    doc.text('TALLA', margin + 70, y + 4.5);
    doc.text('CANT. REQUERIDA', margin + 95, y + 4.5, { align: 'center' });
    doc.text('CANT. STOCK', margin + 125, y + 4.5, { align: 'center' });
    doc.text('A COMPRAR', margin + 155, y + 4.5, { align: 'center' });

    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);

    forecastData.forEach((item, index) => {
      if (y > 270) {
        doc.addPage();
        y = 15;
      }

      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, usableW, 6, 'F');
      }
      doc.rect(margin, y, usableW, 6);

      doc.text(item.productName, margin + 3, y + 4);
      doc.text(item.size, margin + 70, y + 4);
      doc.text(item.qtyNeeded.toString(), margin + 95, y + 4, { align: 'center' });
      doc.text(item.qtyInStock.toString(), margin + 125, y + 4, { align: 'center' });

      if (item.qtyToPurchase > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 38, 38); // red text
      }
      doc.text(item.qtyToPurchase.toString(), margin + 155, y + 4, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);

      y += 6;
    });

    const parsedMonth = parseISO(`${forecastMonth}-01`);
    const monthName = format(parsedMonth, 'MMMM_yyyy', { locale: es });
    doc.save(`Informe_EPP_${monthName}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Shirt className="h-6 w-6 text-orange-600" />
            Control de EPP y Uniformes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de stock, asignaciones por cargo y actas de entrega legales (Ley 16.744 / D.S. 594).
          </p>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={() => setIsAddStockOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white shadow-sm flex items-center gap-1.5"
          >
            <Boxes className="h-4 w-4" />
            Ingresar Stock
          </Button>
        </div>
      </div>

      {/* Tabs Layout */}
      <Tabs defaultValue="deliveries" className="space-y-4">
        <TabsList className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl">
          <TabsTrigger value="deliveries" className="flex items-center gap-1.5 rounded-lg px-4 py-2">
            <Users className="h-4 w-4" />
            Entregas a Personal
          </TabsTrigger>
          <TabsTrigger value="stock" className="flex items-center gap-1.5 rounded-lg px-4 py-2">
            <Boxes className="h-4 w-4" />
            Stock de Inventario
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-1.5 rounded-lg px-4 py-2">
            <Shirt className="h-4 w-4" />
            Requerimientos de Cargos
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1.5 rounded-lg px-4 py-2">
            <History className="h-4 w-4" />
            Informes e Historial
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: DELIVERIES ──────────────────────────────────────────────── */}
        <TabsContent value="deliveries" className="space-y-4">
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Entregas de Uniforme y EPP por Trabajador</CardTitle>
              <CardDescription>
                Revisa el estado de vigencia de los implementos de los trabajadores de acuerdo a su cargo y talla.
              </CardDescription>
              <div className="flex flex-col md:flex-row gap-3 mt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar trabajador por nombre o RUT..." 
                    className="pl-9"
                    value={searchQuery}
                    onChange={handleSearchChange}
                  />
                </div>
                <div className="w-full md:w-[220px]">
                  <select 
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="all">Todas las empresas</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredPersonnel.map((worker) => {
                  const isExpanded = !!expandedWorkers[worker.id];
                  const overallStatusBadge = {
                    RED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400',
                    ORANGE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400',
                    GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400',
                  }[worker.overallStatus as 'RED' | 'ORANGE' | 'GREEN'];

                  return (
                    <div 
                      key={worker.id}
                      className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 hover:shadow-sm transition-all duration-200"
                    >
                      {/* Header block of worker */}
                      <div 
                        onClick={() => toggleWorker(worker.id)}
                        className="flex items-center justify-between p-4 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full ${
                            worker.overallStatus === 'RED' ? 'bg-red-500 animate-pulse' :
                            worker.overallStatus === 'ORANGE' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`} />
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-white">
                              {worker.first_name} {worker.last_name_father} {worker.last_name_mother || ''}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground font-medium">
                              <span className="font-mono">{worker.rut}</span>
                              <span>•</span>
                              <span>{worker.position?.name || 'Sin Cargo'}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Building className="h-3 w-3" />
                                {worker.company?.name || 'Sin Empresa'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={overallStatusBadge}>
                            {worker.overallStatus === 'RED' ? 'Pendiente / Vencido' :
                             worker.overallStatus === 'ORANGE' ? 'Por Vencer' : 'Al Día'}
                          </Badge>
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                        </div>
                      </div>

                      {/* Expansion block */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-950/20 space-y-4">
                          {/* Sizing profile details */}
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-black">Polera</p>
                              <p className="text-sm font-semibold">{worker.clothing_tshirt_size || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-black">Polar</p>
                              <p className="text-sm font-semibold">{worker.clothing_polar_size || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-black">Pantalón (L)</p>
                              <p className="text-sm font-semibold">{worker.clothing_pants_size_letter || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-black">Pantalón (N)</p>
                              <p className="text-sm font-semibold">{worker.clothing_pants_size_number || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-black">Calzado</p>
                              <p className="text-sm font-semibold">{worker.clothing_shoe_size || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-black">Parka</p>
                              <p className="text-sm font-semibold">{worker.clothing_parka_size || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-black">Jardinera</p>
                              <p className="text-sm font-semibold">{worker.clothing_overall_size || '—'}</p>
                            </div>
                          </div>

                          {/* Requirements list for their position */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Implementos Obligatorios por Cargo</h4>
                              <Button 
                                size="sm" 
                                className="bg-orange-600 hover:bg-orange-700 text-white h-7 text-xs"
                                onClick={() => openDeliverDialog(worker)}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Entregar EPP / Uniformes
                              </Button>
                            </div>

                            {worker.requirements.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic p-3 bg-white dark:bg-slate-900 border rounded-lg">
                                No hay requerimientos de EPP o uniformes configurados para el cargo de este trabajador.
                              </p>
                            ) : (
                              <Table className="bg-white dark:bg-slate-900 border rounded-lg">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="h-9">Implemento</TableHead>
                                    <TableHead className="h-9">Talla Ficha</TableHead>
                                    <TableHead className="h-9 text-center">Cant.</TableHead>
                                    <TableHead className="h-9 text-center">Período</TableHead>
                                    <TableHead className="h-9">Última Entrega</TableHead>
                                    <TableHead className="h-9">Próxima Renovación</TableHead>
                                    <TableHead className="h-9">Estado</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {worker.requirements.map((req: any, ri: number) => {
                                    const reqBadgeColor = {
                                      PENDING_FIRST: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400',
                                      PENDING_RENEWAL: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400',
                                      WARNING: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
                                      OK: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400',
                                    }[req.status as 'PENDING_FIRST' | 'PENDING_RENEWAL' | 'WARNING' | 'OK'];

                                    const reqStatusText = {
                                      PENDING_FIRST: 'Pendiente (1ra vez)',
                                      PENDING_RENEWAL: 'Vencido',
                                      WARNING: `Por vencer (${req.daysRemaining} d)`,
                                      OK: 'Vigente',
                                    }[req.status as 'PENDING_FIRST' | 'PENDING_RENEWAL' | 'WARNING' | 'OK'];

                                    return (
                                      <TableRow key={ri}>
                                        <TableCell className="font-semibold text-xs py-2">{req.productName}</TableCell>
                                        <TableCell className="text-xs py-2">{req.size}</TableCell>
                                        <TableCell className="text-xs text-center py-2">{req.quantity}</TableCell>
                                        <TableCell className="text-xs text-center py-2">{req.renewalDays} días</TableCell>
                                        <TableCell className="text-xs py-2">
                                          {req.lastDeliveryDate ? format(parseISO(req.lastDeliveryDate), 'dd/MM/yyyy') : 'Nunca'}
                                        </TableCell>
                                        <TableCell className="text-xs py-2 font-semibold">
                                          {req.nextDeliveryDate ? format(parseISO(req.nextDeliveryDate), 'dd/MM/yyyy') : '—'}
                                        </TableCell>
                                        <TableCell className="py-2">
                                          <Badge className={reqBadgeColor}>
                                            {reqStatusText}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </div>

                          {/* Historical delivery records */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Historial de Entregas y Respaldos</h4>
                            {worker.deliveries.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic p-3 bg-white dark:bg-slate-900 border rounded-lg">
                                Sin registros de entregas para este trabajador.
                              </p>
                            ) : (
                              <Table className="bg-white dark:bg-slate-900 border rounded-lg">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="h-9">Fecha</TableHead>
                                    <TableHead className="h-9">Implemento</TableHead>
                                    <TableHead className="h-9">Talla</TableHead>
                                    <TableHead className="h-9 text-center">Entregado</TableHead>
                                    <TableHead className="h-9 text-center">Devuelto</TableHead>
                                    <TableHead className="h-9">Motivo</TableHead>
                                    <TableHead className="h-9 text-center">Acta Firmada</TableHead>
                                    <TableHead className="h-9 text-right">Acción</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {worker.deliveries.map((item: any) => (
                                    <TableRow key={item.id}>
                                      <TableCell className="text-xs py-2">{format(parseISO(item.deliveryDate), 'dd/MM/yyyy')}</TableCell>
                                      <TableCell className="font-semibold text-xs py-2">{item.productName}</TableCell>
                                      <TableCell className="text-xs py-2">{item.size}</TableCell>
                                      <TableCell className="text-xs text-center py-2">{item.quantity}</TableCell>
                                      <TableCell className="text-xs text-center py-2 text-orange-600 font-semibold">{item.returnedQty || 0}</TableCell>
                                      <TableCell className="text-xs py-2">
                                        {item.reason === 'FIRST_TIME' && 'Primera Vez'}
                                        {item.reason === 'EXPIRATION' && 'Renovación'}
                                        {item.reason === 'DAMAGE' && 'Deterioro'}
                                        {item.reason === 'PAST_DELIVERY' && 'Histórico'}
                                      </TableCell>
                                      <TableCell className="text-center py-2">
                                        {item.signedFormUrl ? (
                                          <a 
                                            href={item.signedFormUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 hover:underline gap-0.5"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                            Ver PDF
                                          </a>
                                        ) : (
                                          <div className="flex items-center justify-center gap-1.5">
                                            <Label 
                                              htmlFor={`file-upload-${item.deliveryEventId}`}
                                              className="inline-flex items-center justify-center rounded-md text-[10px] font-bold border border-slate-300 dark:border-slate-800 h-6 px-2 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer gap-1 text-slate-600"
                                            >
                                              {uploadingEventId === item.deliveryEventId ? (
                                                <span className="animate-spin text-xs">🌀</span>
                                              ) : (
                                                <Upload className="h-3 w-3" />
                                              )}
                                              Subir
                                            </Label>
                                            <input 
                                              id={`file-upload-${item.deliveryEventId}`}
                                              type="file" 
                                              accept=".pdf,image/*"
                                              className="hidden" 
                                              onChange={(e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                  handleFileUpload(item.deliveryEventId, e.target.files[0]);
                                                }
                                              }}
                                            />
                                          </div>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right py-2">
                                        {item.quantity > item.returnedQty && (
                                          <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="h-6 text-[10px] text-orange-600 hover:text-orange-800 gap-0.5"
                                            onClick={() => openReturnDialog(item)}
                                          >
                                            <Undo2 className="h-3 w-3" />
                                            Devolver
                                          </Button>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredPersonnel.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg bg-slate-50/50">
                    No se encontraron trabajadores que coincidan con la búsqueda.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: INVENTORY ───────────────────────────────────────────────── */}
        <TabsContent value="stock" className="space-y-4">
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Stock de Uniformes y EPP</span>
                <Button 
                  onClick={() => setIsAddStockOpen(true)}
                  className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-1.5 h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ingresar Nuevo Lote
                </Button>
              </CardTitle>
              <CardDescription>
                Inventario de EPP y vestuario en bodega. El stock se deduce automáticamente al entregar a un trabajador.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="border rounded-xl">
                <TableHeader className="bg-slate-50 dark:bg-slate-900">
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Producto / Implemento</TableHead>
                    <TableHead>Talla</TableHead>
                    <TableHead className="text-center">Stock Actual</TableHead>
                    <TableHead className="text-right">Precio Unitario</TableHead>
                    <TableHead>Nro Factura</TableHead>
                    <TableHead>Empresa Propietaria</TableHead>
                    <TableHead>Fecha Ingreso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.map((item) => {
                    const compName = companies.find(c => c.id === item.company_id)?.name || 'Sin Asignar';
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Badge variant="outline" className={
                            item.type === 'UNIFORM' 
                              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400'
                              : 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-400'
                          }>
                            {item.type === 'UNIFORM' ? 'Uniforme' : 'EPP'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{item.name}</TableCell>
                        <TableCell>{item.size}</TableCell>
                        <TableCell className="text-center font-bold">
                          <span className={item.stock_qty <= 2 ? 'text-red-600 font-black' : 'text-slate-800 dark:text-white'}>
                            {item.stock_qty}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">${Number(item.price).toLocaleString('es-CL')}</TableCell>
                        <TableCell className="font-mono text-xs">{item.invoice_number || 'S/N'}</TableCell>
                        <TableCell className="text-xs">{compName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(parseISO(item.created_at), 'dd/MM/yyyy')}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {inventory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground italic">
                        Bodega de productos vacía. Haz clic en "Ingresar Nuevo Lote" para comenzar a ingresar stock.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: CATALOG + MATRIX ─────────────────────────────────────── */}
        <TabsContent value="config" className="space-y-6">

          {/* ── Section 1: Product Catalog ──────────────────────────────────── */}
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-orange-600" />
                  Catálogo de Implementos
                </span>
                <Button 
                  onClick={() => { resetCatalogForm(); setIsCatalogDialogOpen(true); }}
                  className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-1.5 h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar Implemento
                </Button>
              </CardTitle>
              <CardDescription>
                Define los implementos disponibles (EPP y Uniformes), si usan tallas y su duración de renovación planificada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="border rounded-xl">
                <TableHeader className="bg-slate-50 dark:bg-slate-900">
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nombre del Implemento</TableHead>
                    <TableHead className="text-center">Usa Tallas</TableHead>
                    <TableHead>Campo Talla</TableHead>
                    <TableHead className="text-center">Renovación</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.map((item) => {
                    const sizeLabel = item.uses_sizes
                      ? (sizeFieldOptions.find(o => o.value === item.size_field)?.label || item.size_field || 'No definido')
                      : '—';
                    const renewalLabel = item.renewal_days >= 30
                      ? `${Math.round(item.renewal_days / 30)} mes${Math.round(item.renewal_days / 30) !== 1 ? 'es' : ''}`
                      : `${item.renewal_days} días`;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Badge variant="outline" className={
                            item.product_type === 'UNIFORM' 
                              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400'
                              : 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-400'
                          }>
                            {item.product_type === 'UNIFORM' ? 'Uniforme' : 'EPP'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{item.name}</TableCell>
                        <TableCell className="text-center">
                          {item.uses_sizes 
                            ? <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-400">Sí</Badge>
                            : <Badge variant="outline" className="text-slate-400 border-slate-200">Única</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{sizeLabel}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="border-orange-200 text-orange-700 dark:text-orange-400">
                            {renewalLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-slate-500 hover:text-orange-600"
                              onClick={() => openEditCatalog(item)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteCatalog(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {catalog.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
                        No hay implementos creados. Haz clic en "Agregar Implemento" para crear el primer elemento del catálogo.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Section 2: Requirements Matrix ─────────────────────────────── */}
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-md relative">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Grid3X3 className="h-5 w-5 text-orange-600" />
                Matriz de Asignación: Cargos × Implementos
              </CardTitle>
              <CardDescription>
                Define la cantidad de cada implemento que debe entregarse a cada cargo. Modifica las celdas y guarda los cambios.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-20">
              {catalog.length === 0 || allPositions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg bg-slate-50/50 dark:bg-slate-950/20">
                  {catalog.length === 0 
                    ? 'Primero crea implementos en el catálogo de arriba para poder asignarlos a los cargos.'
                    : 'No hay cargos registrados en el sistema. Crea cargos en la configuración de áreas y posiciones.'}
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 border-b">
                        <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 text-left px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-300 min-w-[200px] border-r">
                          Cargo / Función
                        </th>
                        {catalog.map(cat => (
                          <th key={cat.id} className="px-2 py-2.5 text-center min-w-[90px] max-w-[120px]">
                            <div className="flex flex-col items-center gap-0.5">
                              <Badge variant="outline" className={
                                `text-[10px] px-1.5 py-0 ${
                                  cat.product_type === 'UNIFORM' 
                                    ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400'
                                    : 'bg-teal-50 text-teal-600 border-teal-200 dark:bg-teal-950/30 dark:text-teal-400'
                                }`
                              }>
                                {cat.product_type === 'UNIFORM' ? 'UNI' : 'EPP'}
                              </Badge>
                              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 leading-tight text-center">
                                {cat.name}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(positionsByArea).map(([areaName, positions]) => (
                        <React.Fragment key={areaName}>
                          {/* Area group header */}
                          <tr className="bg-slate-100/70 dark:bg-slate-800/50">
                            <td 
                              colSpan={catalog.length + 1} 
                              className="sticky left-0 z-10 bg-slate-100/70 dark:bg-slate-800/50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-r"
                            >
                              {areaName}
                            </td>
                          </tr>
                          {/* Position rows */}
                          {(positions as any[]).map((pos: any) => (
                            <tr key={pos.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-orange-50/30 dark:hover:bg-orange-950/10 transition-colors">
                              <td className="sticky left-0 z-10 bg-white dark:bg-slate-950 px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200 border-r text-xs">
                                {pos.name}
                              </td>
                              {catalog.map(cat => {
                                const currentVal = matrixData[pos.id]?.[cat.id] || 0;
                                const originalVal = originalMatrixData[pos.id]?.[cat.id] || 0;
                                const isChanged = currentVal !== originalVal;
                                return (
                                  <td key={cat.id} className="px-1 py-1 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      max="99"
                                      value={currentVal || ''}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        handleMatrixChange(pos.id, cat.id, Math.max(0, Math.min(99, val)));
                                      }}
                                      className={`w-14 h-8 text-center text-xs font-semibold rounded-md border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-orange-500/50 ${
                                        isChanged
                                          ? 'border-orange-400 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-600 ring-1 ring-orange-300'
                                          : currentVal > 0
                                            ? 'border-slate-300 bg-white text-slate-800 dark:bg-slate-900 dark:text-white dark:border-slate-700'
                                            : 'border-slate-200 bg-slate-50/50 text-slate-400 dark:bg-slate-950 dark:text-slate-600 dark:border-slate-800'
                                      }`}
                                      placeholder="0"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>

            {/* Sticky Save Button — always visible at bottom */}
            {catalog.length > 0 && allPositions.length > 0 && (
              <div className="sticky bottom-0 left-0 right-0 z-20 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between rounded-b-xl">
                <div className="text-xs text-muted-foreground">
                  {matrixHasChanges ? (
                    <span className="flex items-center gap-1.5 text-orange-600 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Hay cambios sin guardar en la matriz
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Todos los cambios guardados
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleSaveMatrix}
                  disabled={!matrixHasChanges || savingMatrix}
                  className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {savingMatrix ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── TAB 4: REPORTS & HISTORY ───────────────────────────────────────── */}
        <TabsContent value="reports" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Purchase Forecast report */}
            <Card className="border-slate-200/60 dark:border-slate-800 shadow-md flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">Previsión Mensual de Entregas y Compras</CardTitle>
                <CardDescription>
                  Calcula qué elementos vencen o deben entregarse por primera vez en un mes para estimar compras requeridas.
                </CardDescription>
                <div className="flex gap-3 mt-4">
                  <div className="flex-1">
                    <Input 
                      type="month" 
                      value={forecastMonth}
                      onChange={(e) => setForecastMonth(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={handleGenerateForecast}
                    disabled={generatingForecast}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    {generatingForecast ? 'Calculando...' : 'Calcular'}
                  </Button>
                  {forecastData.length > 0 && (
                    <Button 
                      variant="outline" 
                      onClick={downloadForecastPDF}
                      className="border-slate-300 dark:border-slate-800 gap-1.5"
                    >
                      <FileDown className="h-4 w-4" />
                      PDF
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {forecastData.length > 0 ? (
                  <Table className="border rounded-lg">
                    <TableHeader className="bg-slate-50 dark:bg-slate-900">
                      <TableRow>
                        <TableHead>Implemento</TableHead>
                        <TableHead>Talla</TableHead>
                        <TableHead className="text-center">Requerido</TableHead>
                        <TableHead className="text-center">En Stock</TableHead>
                        <TableHead className="text-center">Comprar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {forecastData.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-semibold text-xs py-1.5">{item.productName}</TableCell>
                          <TableCell className="text-xs py-1.5">{item.size}</TableCell>
                          <TableCell className="text-center text-xs py-1.5">{item.qtyNeeded}</TableCell>
                          <TableCell className="text-center text-xs py-1.5">{item.qtyInStock}</TableCell>
                          <TableCell className="text-center text-xs py-1.5 font-bold">
                            <span className={item.qtyToPurchase > 0 ? 'text-red-500 font-black' : 'text-slate-500'}>
                              {item.qtyToPurchase}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg bg-slate-50/50">
                    Selecciona un mes y haz clic en "Calcular" para ver las compras sugeridas de EPP/Uniformes.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Historical Upload Bootstrap Form */}
            <Card className="border-slate-200/60 dark:border-slate-800 shadow-md">
              <CardHeader>
                <CardTitle className="text-lg">Carga Histórica de Entregas Pasadas</CardTitle>
                <CardDescription>
                  Ingresa las entregas anteriores que ya fueron entregadas físicamente para inicializar el cálculo de renovaciones (esto no altera el stock de inventario).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePastDeliverySubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="past_worker">Trabajador *</Label>
                      <select 
                        id="past_worker"
                        required
                        value={pastWorkerId}
                        onChange={(e) => {
                          setPastWorkerId(e.target.value);
                          setPastProductName(''); // reset
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Seleccionar trabajador</option>
                        {personnel.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.first_name} {p.last_name_father} ({p.position?.name || 'Sin Cargo'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="past_product">Implemento / Prenda *</Label>
                      <select 
                        id="past_product"
                        required
                        disabled={!pastWorkerId}
                        value={pastProductName}
                        onChange={(e) => {
                          setPastProductName(e.target.value);
                          // Auto fill suggested sizing
                          const worker = personnel.find(p => p.id === pastWorkerId);
                          const req = worker?.requirements?.find((r: any) => r.productName === e.target.value);
                          if (req) {
                            setPastSize(req.size !== 'Única' && req.size !== 'No ingresada' ? req.size : '');
                            setPastRenewal(req.renewalDays);
                            setPastQty(req.quantity);
                          }
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Seleccionar implemento</option>
                        {pastWorkerId && personnel.find(p => p.id === pastWorkerId)?.requirements?.map((req: any) => (
                          <option key={req.productName} value={req.productName}>{req.productName}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="past_qty">Cantidad Entregada *</Label>
                      <Input 
                        id="past_qty" 
                        type="number" 
                        min="1" 
                        required
                        value={pastQty}
                        onChange={(e) => setPastQty(Number(e.target.value))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="past_size">Talla / Detalles</Label>
                      <Input 
                        id="past_size" 
                        placeholder="Ej: M, L, 42..." 
                        value={pastSize}
                        onChange={(e) => setPastSize(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="past_date">Fecha de Entrega Pasada *</Label>
                      <Input 
                        id="past_date" 
                        type="date" 
                        required
                        value={pastDate}
                        onChange={(e) => setPastDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="past_renewal">Días de Renovación *</Label>
                      <Input 
                        id="past_renewal" 
                        type="number" 
                        min="1"
                        required
                        value={pastRenewal}
                        onChange={(e) => setPastRenewal(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isPending}
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white mt-2"
                  >
                    {isPending ? 'Cargando...' : 'Registrar Entrega Histórica'}
                  </Button>
                </form>
              </CardContent>
            </Card>

          </div>
        </TabsContent>
      </Tabs>

      {/* ── DIALOG 1: ADD STOCK ────────────────────────────────────────────── */}
      <Dialog open={isAddStockOpen} onOpenChange={setIsAddStockOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Ingreso de Mercadería a Bodega</DialogTitle>
            <DialogDescription>
              Añade un lote de uniformes o equipos de protección personal (EPP) indicando factura, talla y precio.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddStockSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="stock_company">Empresa Propietaria *</Label>
                <select 
                  id="stock_company"
                  required
                  value={stockCompany}
                  onChange={(e) => setStockCompany(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label>Tipo de Producto *</Label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                    <input 
                      type="radio" 
                      name="stock_type" 
                      checked={stockType === 'EPP'}
                      onChange={() => setStockType('EPP')}
                      className="h-4 w-4 accent-orange-600"
                    />
                    Equipo de Protección (EPP)
                  </label>
                  <label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                    <input 
                      type="radio" 
                      name="stock_type" 
                      checked={stockType === 'UNIFORM'}
                      onChange={() => setStockType('UNIFORM')}
                      className="h-4 w-4 accent-orange-600"
                    />
                    Vestuario / Uniforme
                  </label>
                </div>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="stock_name">Nombre del Implemento *</Label>
                <Input 
                  id="stock_name" 
                  placeholder="Ej: Calzado de Seguridad (Con puntera)" 
                  required
                  value={stockName}
                  onChange={(e) => setStockName(e.target.value)}
                  list="suggested-products"
                />
                <datalist id="suggested-products">
                  {uniqueProducts.map(name => <option key={name} value={name} />)}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock_size">Talla / Medida</Label>
                <Input 
                  id="stock_size" 
                  placeholder="Ej: M, L, 42..." 
                  value={stockSize}
                  onChange={(e) => setStockSize(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock_qty">Cantidad *</Label>
                <Input 
                  id="stock_qty" 
                  type="number" 
                  min="1"
                  required
                  value={stockQty}
                  onChange={(e) => setStockQty(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock_price">Precio Unitario ($)*</Label>
                <Input 
                  id="stock_price" 
                  type="number" 
                  min="0"
                  required
                  value={stockPrice}
                  onChange={(e) => setStockPrice(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock_invoice">Nro Factura</Label>
                <Input 
                  id="stock_invoice" 
                  placeholder="Ej: FACT-1234" 
                  value={stockInvoice}
                  onChange={(e) => setStockInvoice(e.target.value)}
                />
              </div>
            </div>
            
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setIsAddStockOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
                {isPending ? 'Guardando...' : 'Ingresar a Bodega'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG 2: ADD/EDIT CATALOG ITEM ────────────────────────────────── */}
      <Dialog open={isCatalogDialogOpen} onOpenChange={(open) => { if (!open) resetCatalogForm(); setIsCatalogDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingCatalogItem ? 'Editar Implemento' : 'Agregar Implemento al Catálogo'}</DialogTitle>
            <DialogDescription>
              {editingCatalogItem 
                ? 'Modifica las propiedades de este implemento. Los cambios se reflejarán en todas las asignaciones.'
                : 'Define un nuevo implemento (EPP o Uniforme) con sus propiedades de talla y renovación.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCatalogSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="cat_name">Nombre del Implemento *</Label>
                <Input 
                  id="cat_name" 
                  placeholder="Ej: Protector Auditivo (Fonos)" 
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label>Tipo de Producto *</Label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                    <input 
                      type="radio" 
                      name="cat_type" 
                      checked={catType === 'EPP'}
                      onChange={() => setCatType('EPP')}
                      className="h-4 w-4 accent-orange-600"
                    />
                    Equipo de Protección (EPP)
                  </label>
                  <label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                    <input 
                      type="radio" 
                      name="cat_type" 
                      checked={catType === 'UNIFORM'}
                      onChange={() => setCatType('UNIFORM')}
                      className="h-4 w-4 accent-orange-600"
                    />
                    Vestuario / Uniforme
                  </label>
                </div>
              </div>

              <div className="space-y-2 col-span-2">
                <Label>¿Este implemento usa tallas?</Label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                    <input 
                      type="radio" 
                      name="cat_sizes" 
                      checked={!catUsesSizes}
                      onChange={() => setCatUsesSizes(false)}
                      className="h-4 w-4 accent-orange-600"
                    />
                    Talla Única
                  </label>
                  <label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                    <input 
                      type="radio" 
                      name="cat_sizes" 
                      checked={catUsesSizes}
                      onChange={() => setCatUsesSizes(true)}
                      className="h-4 w-4 accent-orange-600"
                    />
                    Usa Tallas (se lee de la ficha del trabajador)
                  </label>
                </div>
              </div>

              {catUsesSizes && (
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="cat_size_field">Campo de Talla de la Ficha Personal</Label>
                  <select 
                    id="cat_size_field"
                    value={catSizeField}
                    onChange={(e) => setCatSizeField(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Seleccionar campo de talla</option>
                    {sizeFieldOptions.filter(o => o.value !== '').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              <div className="space-y-2 col-span-2">
                <Label htmlFor="cat_renewal">Duración Planificada (Renovación) *</Label>
                <select 
                  id="cat_renewal"
                  value={catRenewalDays}
                  onChange={(e) => setCatRenewalDays(Number(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value={30}>1 mes (30 días)</option>
                  <option value={60}>2 meses (60 días)</option>
                  <option value={90}>3 meses (90 días)</option>
                  <option value={180}>6 meses (180 días)</option>
                  <option value={365}>12 meses (365 días)</option>
                  <option value={730}>24 meses (730 días)</option>
                </select>
                {![30, 60, 90, 180, 365, 730].includes(catRenewalDays) && (
                  <div className="flex items-center gap-2 mt-1">
                    <Label htmlFor="cat_renewal_custom" className="text-xs text-muted-foreground whitespace-nowrap">Personalizado (días):</Label>
                    <Input 
                      id="cat_renewal_custom"
                      type="number" 
                      min="1"
                      value={catRenewalDays}
                      onChange={(e) => setCatRenewalDays(Number(e.target.value))}
                      className="h-8 w-24"
                    />
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => { resetCatalogForm(); setIsCatalogDialogOpen(false); }}>Cancelar</Button>
              <Button type="submit" disabled={isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
                {isPending ? 'Guardando...' : (editingCatalogItem ? 'Guardar Cambios' : 'Crear Implemento')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG 3: DELIVER ITEMS ───────────────────────────────────────── */}
      <Dialog open={isDeliverOpen} onOpenChange={setIsDeliverOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Entrega de EPP y Uniformes</DialogTitle>
            <DialogDescription>
              Selecciona los elementos que vas a entregar físicamente a <strong>{activeWorker?.first_name} {activeWorker?.last_name_father}</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeliverSubmit} className="space-y-4">
            <div className="space-y-3">
              <div className="w-full md:w-[200px]">
                <Label htmlFor="deliver_date">Fecha de Entrega *</Label>
                <Input 
                  id="deliver_date"
                  type="date" 
                  required
                  value={deliverDate}
                  onChange={(e) => setDeliverDate(e.target.value)}
                />
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900">
                    <TableRow>
                      <TableHead className="w-12 text-center">Entregar</TableHead>
                      <TableHead>Implemento</TableHead>
                      <TableHead>Talla</TableHead>
                      <TableHead className="text-center">Cant.</TableHead>
                      <TableHead className="text-center">En Bodega</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(selectedDeliverItems).map(([name, item]) => {
                      const stockQtyInBodega = checkStock(name, item.size);
                      const isOutOfStock = stockQtyInBodega < item.quantity;
                      
                      return (
                        <TableRow key={name} className={isOutOfStock ? 'opacity-60 bg-red-50/10' : ''}>
                          <TableCell className="text-center">
                            <input 
                              type="checkbox" 
                              checked={item.selected}
                              disabled={isOutOfStock}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSelectedDeliverItems(prev => ({
                                  ...prev,
                                  [name]: { ...prev[name], selected: checked }
                                }));
                              }}
                              className="h-4.5 w-4.5 accent-orange-600 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </TableCell>
                          <TableCell className="font-semibold text-xs">{name}</TableCell>
                          <TableCell className="text-xs">{item.size}</TableCell>
                          <TableCell className="text-center text-xs font-bold">{item.quantity}</TableCell>
                          <TableCell className="text-center text-xs">
                            <span className={`font-bold ${isOutOfStock ? 'text-red-500' : 'text-slate-600'}`}>
                              {stockQtyInBodega}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <select 
                              value={item.reason}
                              onChange={(e) => {
                                const val = e.target.value as any;
                                setSelectedDeliverItems(prev => ({
                                  ...prev,
                                  [name]: { ...prev[name], reason: val }
                                }));
                              }}
                              className="h-8 rounded border border-slate-300 dark:border-slate-800 bg-white px-2 py-0 text-xs w-full focus:outline-none"
                            >
                              <option value="FIRST_TIME">Primera Vez</option>
                              <option value="EXPIRATION">Renovación</option>
                              <option value="DAMAGE">Deterioro</option>
                            </select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setIsDeliverOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending} className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-1">
                {isPending ? 'Procesando...' : (
                  <>
                    <Download className="h-4 w-4" />
                    Registrar y Descargar Acta
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG 4: RETURN ITEM ─────────────────────────────────────────── */}
      <Dialog open={isReturnOpen} onOpenChange={setIsReturnOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Devolución de Implemento a Bodega</DialogTitle>
            <DialogDescription>
              Registra la devolución del implemento para regresarlo al stock disponible de bodega.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReturnSubmit} className="space-y-4">
            {activeReturnItem && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-black">Producto</p>
                  <p className="font-semibold">{activeReturnItem.productName} (Talla: {activeReturnItem.size})</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-black">Cantidad Pendiente de Devolución</p>
                  <p className="font-semibold">{activeReturnItem.quantity - activeReturnItem.returnedQty}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="return_qty">Cantidad a Devolver *</Label>
                  <Input 
                    id="return_qty" 
                    type="number" 
                    min="1" 
                    max={activeReturnItem.quantity - activeReturnItem.returnedQty}
                    required
                    value={returnQty}
                    onChange={(e) => setReturnQty(Number(e.target.value))}
                  />
                </div>
              </div>
            )}
            
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setIsReturnOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
                {isPending ? 'Guardando...' : 'Confirmar Devolución'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
