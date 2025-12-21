import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InvoiceProduct {
  id: string;
  product_name: string;
  amount: number;
  percentage: number;
  commission: number;
}

export interface Invoice {
  id: string;
  ncf: string;
  total_amount: number;
  rest_amount: number;
  rest_percentage: number;
  rest_commission: number;
  total_commission: number;
  created_at: string;
  invoice_date: string;
  client_id: string | null;
  seller_id: string | null;
  products?: InvoiceProduct[];
}

export const useInvoices = (sellerId?: string | null) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = async () => {
    setLoading(true);
    
    let query = supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });
    
    // Filtrar por vendedor si se proporciona
    if (sellerId) {
      query = query.eq('seller_id', sellerId);
    }
    
    const { data: invoicesData, error: invoicesError } = await query;
    
    if (invoicesError) {
      toast.error('Error al cargar facturas');
      console.error(invoicesError);
      setLoading(false);
      return;
    }

    // Fetch products for each invoice
    const invoicesWithProducts = await Promise.all(
      (invoicesData || []).map(async (invoice) => {
        const { data: products } = await supabase
          .from('invoice_products')
          .select('*')
          .eq('invoice_id', invoice.id);
        return { ...invoice, products: products || [] };
      })
    );

    setInvoices(invoicesWithProducts as Invoice[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchInvoices();
  }, [sellerId]);

  const saveInvoice = async (
    ncf: string,
    invoiceDate: string,
    totalAmount: number,
    restAmount: number,
    restPercentage: number,
    restCommission: number,
    totalCommission: number,
    products: { name: string; amount: number; percentage: number; commission: number }[],
    clientId?: string,
    sellerId?: string
  ) => {
    // Check if NCF already exists
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('ncf', ncf)
      .maybeSingle();
    
    if (existing) {
      toast.error('Ya existe una factura con este NCF');
      return null;
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        ncf,
        invoice_date: invoiceDate,
        total_amount: totalAmount,
        rest_amount: restAmount,
        rest_percentage: restPercentage,
        rest_commission: restCommission,
        total_commission: totalCommission,
        client_id: clientId || null,
        seller_id: sellerId || null,
      })
      .select()
      .single();
    
    if (invoiceError) {
      toast.error('Error al guardar factura');
      console.error(invoiceError);
      return null;
    }

    // Save product breakdown
    const productInserts = products
      .filter(p => p.amount > 0)
      .map(p => ({
        invoice_id: invoice.id,
        product_name: p.name,
        amount: p.amount,
        percentage: p.percentage,
        commission: p.commission,
      }));

    if (productInserts.length > 0) {
      const { error: productsError } = await supabase
        .from('invoice_products')
        .insert(productInserts);
      
      if (productsError) {
        console.error(productsError);
      }
    }

    toast.success('Factura guardada correctamente');
    fetchInvoices();
    return invoice;
  };

  const deleteInvoice = async (id: string) => {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Error al eliminar factura');
      console.error(error);
      return false;
    }
    
    setInvoices(invoices.filter(i => i.id !== id));
    toast.success('Factura eliminada');
    return true;
  };

  const updateInvoice = async (
    id: string,
    ncf: string,
    invoiceDate: string,
    totalAmount: number,
    restAmount: number,
    restPercentage: number,
    restCommission: number,
    totalCommission: number,
    products: { name: string; amount: number; percentage: number; commission: number }[],
    clientId?: string | null,
    sellerId?: string | null
  ) => {
    // Check if NCF already exists (excluding current invoice)
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('ncf', ncf)
      .neq('id', id)
      .maybeSingle();
    
    if (existing) {
      toast.error('Ya existe una factura con este NCF');
      return null;
    }

    const updates: any = {
        ncf,
        invoice_date: invoiceDate,
        total_amount: totalAmount,
        rest_amount: restAmount,
        rest_percentage: restPercentage,
        rest_commission: restCommission,
        total_commission: totalCommission,
        client_id: clientId,
    };

    if (sellerId !== undefined) {
        updates.seller_id = sellerId;
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (invoiceError) {
      toast.error('Error al actualizar factura');
      console.error(invoiceError);
      return null;
    }

    // Delete existing products and re-insert
    await supabase
      .from('invoice_products')
      .delete()
      .eq('invoice_id', id);

    const productInserts = products
      .filter(p => p.amount > 0)
      .map(p => ({
        invoice_id: id,
        product_name: p.name,
        amount: p.amount,
        percentage: p.percentage,
        commission: p.commission,
      }));

    if (productInserts.length > 0) {
      const { error: productsError } = await supabase
        .from('invoice_products')
        .insert(productInserts);
      
      if (productsError) {
        console.error(productsError);
      }
    }

    toast.success('Factura actualizada correctamente');
    fetchInvoices();
    return invoice;
  };

  const saveBulkInvoices = async (
    invoices: {
      ncf: string;
      invoiceDate: string;
      totalAmount: number;
      totalCommission: number;
      products: { name: string; amount: number; percentage: number; commission: number }[];
      clientId?: string;
      sellerId?: string;
    }[]
  ) => {
    let successCount = 0;
    let failCount = 0;

    for (const inv of invoices) {
      // Check if NCF already exists
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('ncf', inv.ncf)
        .maybeSingle();
      
      if (existing) {
        failCount++;
        continue;
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          ncf: inv.ncf,
          invoice_date: inv.invoiceDate,
          total_amount: inv.totalAmount,
          rest_amount: 0,
          rest_percentage: 0,
          rest_commission: 0,
          total_commission: inv.totalCommission,
          client_id: inv.clientId || null,
          seller_id: inv.sellerId || null,
        })
        .select()
        .single();
      
      if (invoiceError) {
        console.error(invoiceError);
        failCount++;
        continue;
      }

      // Save product breakdown
      const productInserts = inv.products
        .filter(p => p.amount > 0)
        .map(p => ({
          invoice_id: invoice.id,
          product_name: p.name,
          amount: p.amount,
          percentage: p.percentage,
          commission: p.commission,
        }));

      if (productInserts.length > 0) {
        await supabase
          .from('invoice_products')
          .insert(productInserts);
      }

      successCount++;
    }

    if (failCount > 0) {
      toast.warning(`${successCount} facturas guardadas, ${failCount} con errores o duplicadas`);
    } else {
      toast.success(`${successCount} facturas guardadas correctamente`);
    }

    fetchInvoices();
    return successCount;
  };

  return { invoices, loading, saveInvoice, updateInvoice, deleteInvoice, saveBulkInvoices, refetch: fetchInvoices };
};