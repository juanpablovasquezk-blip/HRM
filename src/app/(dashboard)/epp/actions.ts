'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { addDays, parseISO, format } from 'date-fns';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (error: any) {
    if (error && error.message && error.message.includes('static generation store')) {
      return;
    }
    throw error;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  company_id: string;
  type: 'UNIFORM' | 'EPP';
  name: string;
  size: string;
  price: number;
  invoice_number: string;
  stock_qty: number;
  created_at: string;
}

export interface ProductCatalogItem {
  id: string;
  product_type: 'UNIFORM' | 'EPP';
  name: string;
  uses_sizes: boolean;
  size_field: string | null;
  renewal_days: number;
  is_active: boolean;
  created_at: string;
}

export interface PositionRequirement {
  id: string;
  position_id: string;
  product_type: 'UNIFORM' | 'EPP';
  product_name: string;
  quantity: number;
  renewal_days: number;
  size_field: string | null;
  position?: {
    name: string;
    area?: {
      name: string;
    };
  };
}

export interface DeliveryItemInput {
  productName: string;
  productType: 'UNIFORM' | 'EPP';
  size: string;
  quantity: number;
  reason: 'FIRST_TIME' | 'EXPIRATION' | 'DAMAGE' | 'PAST_DELIVERY';
  renewalDays: number;
}

// ── 1. Inventory Actions ─────────────────────────────────────────────────────

export async function getEPPInventory(): Promise<{ data: InventoryItem[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('epp_inventory')
    .select('*')
    .order('name', { ascending: true })
    .order('size', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data || []) as InventoryItem[], error: null };
}

export async function addInventoryBatch(payload: {
  companyId: string;
  type: 'UNIFORM' | 'EPP';
  name: string;
  size: string;
  price: number;
  invoiceNumber: string;
  stockQty: number;
}): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('epp_inventory')
    .insert([{
      company_id: payload.companyId,
      type: payload.type,
      name: payload.name,
      size: payload.size || 'Única',
      price: payload.price || 0,
      invoice_number: payload.invoiceNumber || '',
      stock_qty: payload.stockQty || 0
    }]);

  if (error) return { success: false, error: error.message };
  safeRevalidatePath('/epp');
  return { success: true, error: null };
}

// ── 2. Position Requirements Actions ─────────────────────────────────────────

export async function getEPPRequirements(): Promise<{ data: PositionRequirement[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('epp_position_requirements')
    .select(`
      *,
      position:positions(
        name,
        area:areas(name)
      )
    `)
    .order('product_name', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data || []) as any[], error: null };
}

export async function saveEPPRequirement(payload: {
  id?: string;
  positionId: string;
  productType: 'UNIFORM' | 'EPP';
  productName: string;
  quantity: number;
  renewalDays: number;
  sizeField: string | null;
}): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  let error;

  if (payload.id) {
    const { error: err } = await supabase
      .from('epp_position_requirements')
      .update({
        product_type: payload.productType,
        product_name: payload.productName,
        quantity: payload.quantity,
        renewal_days: payload.renewalDays,
        size_field: payload.sizeField
      })
      .eq('id', payload.id);
    error = err;
  } else {
    const { error: err } = await supabase
      .from('epp_position_requirements')
      .insert([{
        position_id: payload.positionId,
        product_type: payload.productType,
        product_name: payload.productName,
        quantity: payload.quantity,
        renewal_days: payload.renewalDays,
        size_field: payload.sizeField
      }]);
    error = err;
  }

  if (error) return { success: false, error: error.message };
  safeRevalidatePath('/epp');
  return { success: true, error: null };
}

export async function deleteEPPRequirement(id: string): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('epp_position_requirements')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  safeRevalidatePath('/epp');
  return { success: true, error: null };
}

// ── 3. Personnel, Requirements & Delivery Status ─────────────────────────────

export async function getEPPPersonnelData(): Promise<{
  data: {
    personnel: any[];
    requirements: PositionRequirement[];
    inventory: InventoryItem[];
    companies: any[];
  };
  error: string | null;
}> {
  const supabase = await createClient();

  // Fetch all personnel
  const { data: personnel, error: persErr } = await supabase
    .from('personnel')
    .select(`
      *,
      company:companies(*),
      position:positions(name, area:areas(name))
    `)
    .eq('is_active', true)
    .order('last_name_father', { ascending: true });

  if (persErr) return { data: { personnel: [], requirements: [], inventory: [], companies: [] }, error: persErr.message };

  // Fetch position requirements
  const { data: requirements, error: reqsErr } = await supabase
    .from('epp_position_requirements')
    .select('*');

  if (reqsErr) console.warn('Warning fetching epp_position_requirements:', reqsErr.message);

  // Fetch inventory
  const { data: inventory, error: invErr } = await supabase
    .from('epp_inventory')
    .select('*');

  if (invErr) console.warn('Warning fetching epp_inventory:', invErr.message);

  // Fetch companies for select
  const { data: companies, error: compErr } = await supabase
    .from('companies')
    .select('*')
    .order('name', { ascending: true });

  if (compErr) return { data: { personnel: [], requirements: [], inventory: [], companies: [] }, error: compErr.message };

  // Fetch all delivery items to calculate renewal statuses
  const { data: deliveryItems, error: itemsErr } = await supabase
    .from('epp_delivery_items')
    .select(`
      *,
      event:epp_delivery_events(*)
    `);

  if (itemsErr) console.warn('Warning fetching epp_delivery_items:', itemsErr.message);

  const safeRequirements = reqsErr ? [] : (requirements || []);
  const safeInventory = invErr ? [] : (inventory || []);
  const safeDeliveryItems = itemsErr ? [] : (deliveryItems || []);

  // Assemble EPP delivery history per person
  const assembledPersonnel = personnel.map((p: any) => {
    // Requirements for this person's main_position
    const persReqs = safeRequirements.filter(r => r.position_id === p.main_position);

    // Deliveries received by this person
    const persDeliveries = safeDeliveryItems
      .filter((item: any) => item.event?.personnel_id === p.id)
      ?.map((item: any) => ({
        id: item.id,
        deliveryEventId: item.delivery_event_id,
        inventoryId: item.inventory_id,
        productName: item.product_name,
        productType: item.product_type,
        size: item.size,
        quantity: item.quantity,
        reason: item.reason,
        renewalDays: item.renewal_days,
        nextDeliveryDate: item.next_delivery_date,
        returnedQty: item.returned_qty,
        returnedAt: item.returned_at,
        deliveryDate: item.event?.delivery_date,
        signedFormUrl: item.event?.signed_form_url,
      })) || [];

    // Calculate dynamic delivery status for each requirement
    const reqStatuses = persReqs.map(req => {
      // Find deliveries of this specific product that are NOT fully returned
      const activeDeliveries = persDeliveries.filter(
        d => d.productName === req.product_name && d.quantity > d.returnedQty
      );

      // Get latest active delivery by date
      let latestDelivery = null;
      if (activeDeliveries.length > 0) {
        activeDeliveries.sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime());
        latestDelivery = activeDeliveries[0];
      }

      // Determine size from profile (checking built-in or custom_clothing_sizes jsonb)
      const sizeKey = req.size_field;
      const sizeValue = sizeKey ? (p[sizeKey] || (p.custom_clothing_sizes && p.custom_clothing_sizes[sizeKey]) || 'No ingresada') : 'Única';

      if (!latestDelivery) {
        return {
          productName: req.product_name,
          productType: req.product_type,
          quantity: req.quantity,
          renewalDays: req.renewal_days,
          size: sizeValue,
          lastDeliveryDate: null,
          nextDeliveryDate: null,
          status: 'PENDING_FIRST', // First time delivery needed
          daysRemaining: 0,
        };
      }

      // Calculate days remaining
      const nextDate = parseISO(latestDelivery.nextDeliveryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = nextDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let status: 'PENDING_RENEWAL' | 'WARNING' | 'OK' = 'OK';
      if (diffDays <= 0) {
        status = 'PENDING_RENEWAL'; // Expired
      } else if (diffDays <= 15) {
        status = 'WARNING'; // Expiring soon (within 15 days)
      }

      return {
        productName: req.product_name,
        productType: req.product_type,
        quantity: req.quantity,
        renewalDays: req.renewal_days,
        size: sizeValue,
        lastDeliveryDate: latestDelivery.deliveryDate,
        nextDeliveryDate: latestDelivery.nextDeliveryDate,
        status,
        daysRemaining: diffDays,
      };
    });

    // Overall color status for the worker list:
    // Red if any requirement is expired or pending
    // Orange if any warning and no expired
    // Green if all OK
    let overallStatus: 'RED' | 'ORANGE' | 'GREEN' = 'GREEN';
    if (reqStatuses.some(rs => rs.status === 'PENDING_FIRST' || rs.status === 'PENDING_RENEWAL')) {
      overallStatus = 'RED';
    } else if (reqStatuses.some(rs => rs.status === 'WARNING')) {
      overallStatus = 'ORANGE';
    }

    return {
      ...p,
      requirements: reqStatuses,
      deliveries: persDeliveries,
      overallStatus,
    };
  });

  return {
    data: {
      personnel: assembledPersonnel,
      requirements: safeRequirements as any[],
      inventory: safeInventory as any[],
      companies: companies || []
    },
    error: null,
  };
}

// ── 4. Delivery Actions & FIFO Stock Discount ───────────────────────────────

export async function registerDeliveryEvent(
  personnelId: string,
  deliveryDate: string,
  items: DeliveryItemInput[]
): Promise<{ success: boolean; eventId?: string; error: string | null }> {
  const supabase = await createClient();

  // Get logged-in user
  const { data: { user } } = await supabase.auth.getUser();

  // Begin database transaction simulation by doing sequential checks
  // 1. Validate stock is available for each item
  for (const item of items) {
    if (item.reason === 'PAST_DELIVERY') continue; // Past deliveries do not check or discount stock

    const { data: stockItems } = await supabase
      .from('epp_inventory')
      .select('stock_qty')
      .eq('name', item.productName)
      .eq('size', item.size);

    const totalStock = (stockItems || []).reduce((sum, current) => sum + current.stock_qty, 0);
    if (totalStock < item.quantity) {
      return {
        success: false,
        error: `Stock insuficiente para "${item.productName}" (Talla: ${item.size}). Requerido: ${item.quantity}, Disponible: ${totalStock}`,
      };
    }
  }

  // 2. Insert Delivery Event
  const { data: event, error: eventErr } = await supabase
    .from('epp_delivery_events')
    .insert([{
      personnel_id: personnelId,
      delivery_date: deliveryDate,
      created_by: user?.id || null
    }])
    .select()
    .single();

  if (eventErr || !event) {
    return { success: false, error: `Error al crear sesión de entrega: ${eventErr?.message}` };
  }

  // 3. For each item, deduct from stock (FIFO) and insert detail record
  for (const item of items) {
    let quantityToDeduct = item.quantity;
    let inventoryId = null;

    if (item.reason !== 'PAST_DELIVERY') {
      // Fetch matching inventory rows ordered by created_at ascending (FIFO)
      const { data: inventoryBatches } = await supabase
        .from('epp_inventory')
        .select('*')
        .eq('name', item.productName)
        .eq('size', item.size)
        .gt('stock_qty', 0)
        .order('created_at', { ascending: true });

      if (inventoryBatches && inventoryBatches.length > 0) {
        for (const batch of inventoryBatches) {
          if (quantityToDeduct <= 0) break;

          const deduction = Math.min(batch.stock_qty, quantityToDeduct);
          const newQty = batch.stock_qty - deduction;

          // Deduct from this batch
          const { error: updateErr } = await supabase
            .from('epp_inventory')
            .update({ stock_qty: newQty })
            .eq('id', batch.id);

          if (updateErr) {
            console.error(`Error updating inventory batch ${batch.id}:`, updateErr.message);
          }

          quantityToDeduct -= deduction;
          inventoryId = batch.id; // Link to the last affected inventory row
        }
      }
    }

    // Calculate next delivery date
    const parsedDate = parseISO(deliveryDate);
    const nextDate = addDays(parsedDate, item.renewalDays);
    const nextDeliveryDateStr = format(nextDate, 'yyyy-MM-dd');

    // Insert delivery item
    const { error: itemErr } = await supabase
      .from('epp_delivery_items')
      .insert([{
        delivery_event_id: event.id,
        inventory_id: inventoryId,
        product_name: item.productName,
        product_type: item.productType,
        size: item.size,
        quantity: item.quantity,
        reason: item.reason,
        renewal_days: item.renewalDays,
        next_delivery_date: nextDeliveryDateStr
      }]);

    if (itemErr) {
      console.error(`Error inserting delivery item:`, itemErr.message);
    }
  }

  safeRevalidatePath('/epp');
  return { success: true, eventId: event.id, error: null };
}

// ── 5. Return Item Action ────────────────────────────────────────────────────

export async function returnDeliveryItem(
  deliveryItemId: string,
  quantityToReturn: number
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  // Get delivery item details
  const { data: item, error: fetchErr } = await supabase
    .from('epp_delivery_items')
    .select('*')
    .eq('id', deliveryItemId)
    .single();

  if (fetchErr || !item) {
    return { success: false, error: `Error al encontrar la entrega: ${fetchErr?.message}` };
  }

  const newReturnedQty = item.returned_qty + quantityToReturn;
  if (newReturnedQty > item.quantity) {
    return { success: false, error: `No puedes devolver más cantidad de la que fue entregada (${item.quantity})` };
  }

  // 1. Update delivery item
  const { error: updateItemErr } = await supabase
    .from('epp_delivery_items')
    .update({
      returned_qty: newReturnedQty,
      returned_at: format(new Date(), 'yyyy-MM-dd')
    })
    .eq('id', deliveryItemId);

  if (updateItemErr) {
    return { success: false, error: `Error al registrar devolución: ${updateItemErr.message}` };
  }

  // 2. Increment stock in inventory if linked to a batch
  if (item.inventory_id) {
    const { data: inventoryBatch } = await supabase
      .from('epp_inventory')
      .select('stock_qty')
      .eq('id', item.inventory_id)
      .single();

    if (inventoryBatch) {
      const { error: invErr } = await supabase
        .from('epp_inventory')
        .update({ stock_qty: inventoryBatch.stock_qty + quantityToReturn })
        .eq('id', item.inventory_id);

      if (invErr) {
        console.error(`Error restocking inventory batch ${item.inventory_id}:`, invErr.message);
      }
    }
  }

  safeRevalidatePath('/epp');
  return { success: true, error: null };
}

// ── 6. Scanned PDF Upload Receipt ────────────────────────────────────────────

export async function uploadSignedFormUrl(
  eventId: string,
  fileUrl: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('epp_delivery_events')
    .update({ signed_form_url: fileUrl })
    .eq('id', eventId);

  if (error) return { success: false, error: error.message };
  safeRevalidatePath('/epp');
  return { success: true, error: null };
}

// ── 7. Monthly Forecast / Purchase Report ───────────────────────────────────

export interface ForecastReportItem {
  productName: string;
  productType: 'UNIFORM' | 'EPP';
  size: string;
  qtyNeeded: number;
  qtyInStock: number;
  qtyToPurchase: number;
}

export async function getMonthlyEPPForecastReport(
  monthStr: string // e.g. "2026-08"
): Promise<{ data: ForecastReportItem[]; error: string | null }> {
  const dataResult = await getEPPPersonnelData();
  if (dataResult.error || !dataResult.data) {
    return { data: [], error: dataResult.error };
  }

  const { personnel, inventory } = dataResult.data;
  const targetYearMonth = monthStr; // e.g. "2026-08"

  // We need to gather requirements that require delivery in this target month
  // E.g. nextDeliveryDate falls in targetYearMonth OR it is already expired/pending (nextDeliveryDate < monthStart and never delivered)
  const requiredGroup: Record<string, { name: string; type: 'UNIFORM' | 'EPP'; size: string; qty: number }> = {};

  personnel.forEach(p => {
    p.requirements.forEach((req: any) => {
      let isRequiredThisMonth = false;

      if (req.status === 'PENDING_FIRST') {
        isRequiredThisMonth = true; // Needs first-time delivery
      } else if (req.nextDeliveryDate) {
        const nextYM = req.nextDeliveryDate.substring(0, 7); // "yyyy-MM"
        if (nextYM === targetYearMonth || req.nextDeliveryDate < `${targetYearMonth}-01`) {
          isRequiredThisMonth = true; // Due this month or already overdue
        }
      }

      if (isRequiredThisMonth) {
        const key = `${req.productName}_${req.size}`;
        if (!requiredGroup[key]) {
          requiredGroup[key] = {
            name: req.productName,
            type: req.productType,
            size: req.size,
            qty: 0,
          };
        }
        requiredGroup[key].qty += req.quantity;
      }
    });
  });

  // Compare with current stock
  const report: ForecastReportItem[] = Object.values(requiredGroup).map(req => {
    // Find total stock currently available in inventory
    const matchingStock = inventory
      .filter(i => i.name === req.name && i.size === req.size)
      .reduce((sum, i) => sum + i.stock_qty, 0);

    const deficit = Math.max(0, req.qty - matchingStock);

    return {
      productName: req.name,
      productType: req.type,
      size: req.size,
      qtyNeeded: req.qty,
      qtyInStock: matchingStock,
      qtyToPurchase: deficit,
    };
  });

  // Sort by product name
  report.sort((a, b) => a.productName.localeCompare(b.productName, 'es'));

  return { data: report, error: null };
}

// ── 8. Product Catalog Actions ───────────────────────────────────────────────

export async function getProductCatalog(): Promise<{ data: ProductCatalogItem[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('epp_product_catalog')
    .select('*')
    .eq('is_active', true)
    .order('product_type', { ascending: true })
    .order('name', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data || []) as ProductCatalogItem[], error: null };
}

export async function saveProductCatalogItem(payload: {
  id?: string;
  productType: 'UNIFORM' | 'EPP';
  name: string;
  usesSizes: boolean;
  sizeField: string | null;
  renewalDays: number;
}): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  let error;

  if (payload.id) {
    const { error: err } = await supabase
      .from('epp_product_catalog')
      .update({
        product_type: payload.productType,
        name: payload.name,
        uses_sizes: payload.usesSizes,
        size_field: payload.usesSizes ? payload.sizeField : null,
        renewal_days: payload.renewalDays,
      })
      .eq('id', payload.id);
    error = err;
  } else {
    const { error: err } = await supabase
      .from('epp_product_catalog')
      .insert([{
        product_type: payload.productType,
        name: payload.name,
        uses_sizes: payload.usesSizes,
        size_field: payload.usesSizes ? payload.sizeField : null,
        renewal_days: payload.renewalDays,
      }]);
    error = err;
  }

  if (error) return { success: false, error: error.message };
  safeRevalidatePath('/epp');
  return { success: true, error: null };
}

export async function deleteProductCatalogItem(id: string): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('epp_product_catalog')
    .update({ is_active: false })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  safeRevalidatePath('/epp');
  return { success: true, error: null };
}

// ── 9. Positions for Matrix ─────────────────────────────────────────────────

export async function getAllPositionsWithAreas(): Promise<{ data: any[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('positions')
    .select(`
      id,
      name,
      area:areas(id, name)
    `)
    .order('name', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

// ── 10. Bulk Save Requirements Matrix ───────────────────────────────────────

// ── 10. Bulk Save Requirements Matrix ───────────────────────────────────────

export async function bulkSaveRequirementsMatrix(
  entries: { positionId: string; productCatalogId: string; quantity: number }[],
  allPositionIds: string[],
  allCatalogItemIds: string[]
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    if (allPositionIds.length === 0) {
      return { success: true, error: null };
    }

    // 1. Fetch catalog items to get denormalized fields
    const { data: catalogItems, error: catErr } = await supabase
      .from('epp_product_catalog')
      .select('*')
      .in('id', allCatalogItemIds);

    if (catErr) return { success: false, error: catErr.message };

    const catalogMap = new Map((catalogItems || []).map(c => [c.id, c]));

    // 2. Delete existing requirements for all positions in a single batch query
    const { error: delErr } = await supabase
      .from('epp_position_requirements')
      .delete()
      .in('position_id', allPositionIds);

    if (delErr) {
      console.error('Error deleting old position requirements:', delErr.message);
      return { success: false, error: delErr.message };
    }

    // 3. Insert new requirements for entries with quantity > 0
    const nonZeroEntries = entries.filter(e => e.quantity > 0);

    if (nonZeroEntries.length > 0) {
      const insertRows = nonZeroEntries.map(entry => {
        const cat = catalogMap.get(entry.productCatalogId);
        return {
          position_id: entry.positionId,
          product_catalog_id: entry.productCatalogId,
          product_type: cat?.product_type || 'EPP',
          product_name: cat?.name || '',
          quantity: entry.quantity,
          renewal_days: cat?.renewal_days || 180,
          size_field: cat?.uses_sizes ? cat?.size_field : null,
        };
      });

      const { error: insertErr } = await supabase
        .from('epp_position_requirements')
        .insert(insertRows);

      if (insertErr) {
        console.error('Error inserting position requirements:', insertErr.message);
        return { success: false, error: insertErr.message };
      }
    }

    safeRevalidatePath('/epp');
    return { success: true, error: null };
  } catch (err: any) {
    console.error('Unexpected error in bulkSaveRequirementsMatrix:', err);
    return { success: false, error: err?.message || 'Error inesperado en el servidor' };
  }
}

// ── 11. Quick Update Worker Clothing Sizes ───────────────────────────────

export async function updateWorkerClothingSizes(
  personnelId: string,
  sizes: Record<string, string>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    const standardFields = [
      'clothing_tshirt_size',
      'clothing_polar_size',
      'clothing_pants_size_letter',
      'clothing_pants_size_number',
      'clothing_shoe_size',
      'clothing_parka_size',
      'clothing_overall_size',
    ];

    const updateData: Record<string, any> = {};
    const customSizes: Record<string, string> = {};

    // Get current personnel to merge existing custom sizes
    const { data: currentPerson } = await supabase
      .from('personnel')
      .select('custom_clothing_sizes')
      .eq('id', personnelId)
      .single();

    const existingCustom = (currentPerson?.custom_clothing_sizes as Record<string, string>) || {};

    for (const [key, val] of Object.entries(sizes)) {
      const cleanVal = val ? val.trim().toUpperCase() : null;
      if (standardFields.includes(key)) {
        updateData[key] = cleanVal;
      } else if (key.startsWith('clothing_custom_')) {
        if (cleanVal) {
          customSizes[key] = cleanVal;
        } else {
          delete existingCustom[key];
        }
      }
    }

    updateData.custom_clothing_sizes = { ...existingCustom, ...customSizes };

    const { error } = await supabase
      .from('personnel')
      .update(updateData)
      .eq('id', personnelId);

    if (error) return { success: false, error: error.message };

    safeRevalidatePath('/epp');
    safeRevalidatePath('/personnel');
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al actualizar tallas' };
  }
}


