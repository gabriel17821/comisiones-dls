import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Invoice } from '@/hooks/useInvoices';
import { Client } from '@/hooks/useClients';
import { formatCurrency, formatNumber, parseDateSafe } from '@/lib/formatters';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Package, FileDown, Loader2, Pencil, User } from 'lucide-react';
import { generateBreakdownPdf } from '@/lib/pdfGenerator';
import { toast } from 'sonner';
import { EditInvoiceDialog } from '@/components/EditInvoiceDialog';
import { EditGlobalPercentageDialog } from '@/components/EditGlobalPercentageDialog';
import { supabase } from '@/integrations/supabase/client';

interface MonthlyBreakdownProps {
  invoices: Invoice[];
  clients?: Client[];
  onUpdateInvoice?: (
    id: string,
    ncf: string,
    invoiceDate: string,
    totalAmount: number,
    restAmount: number,
    restPercentage: number,
    restCommission: number,
    totalCommission: number,
    products: { name: string; amount: number; percentage: number; commission: number }[]
  ) => Promise<any>;
  onDeleteInvoice?: (id: string) => Promise<boolean>;
  onRefreshInvoices?: () => void;
  sellerName?: string;
}

interface ProductEntry {
  ncf: string;
  date: string;
  amount: number;
  clientId?: string | null;
  clientName?: string;
}

interface ProductBreakdown {
  name: string;
  percentage: number;
  entries: ProductEntry[];
  totalAmount: number;
  totalCommission: number;
}

// Helper to get month key from date
const getMonthKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export const MonthlyBreakdown = ({ invoices, clients, onUpdateInvoice, onDeleteInvoice, onRefreshInvoices, sellerName }: MonthlyBreakdownProps) => {
  // Initialize with current month
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return getMonthKey(now);
  });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const getClientName = (clientId?: string | null) => {
    if (!clientId || !clients) return undefined;
    const client = clients.find(c => c.id === clientId);
    return client?.name;
  };

  // Generate available months - always show last 4 months plus any with invoices
  const months = useMemo(() => {
    const uniqueMonths = new Set<string>();
    
    // Always add the last 4 months (current month included)
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      uniqueMonths.add(getMonthKey(date));
    }
    
    // Add months from invoices
    invoices.forEach(inv => {
      const date = parseDateSafe(inv.invoice_date || inv.created_at);
      uniqueMonths.add(getMonthKey(date));
    });
    
    return Array.from(uniqueMonths).sort().reverse();
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const start = startOfMonth(new Date(year, month - 1, 1));
    const end = endOfMonth(new Date(year, month - 1, 1));
    
    return invoices.filter(inv => {
      const invDate = parseDateSafe(inv.invoice_date || inv.created_at);
      return isWithinInterval(invDate, { start, end });
    });
  }, [invoices, selectedMonth]);

  const productsBreakdown = useMemo(() => {
    const products: Record<string, ProductBreakdown> = {};
    
    filteredInvoices.forEach(invoice => {
      const clientName = getClientName((invoice as any).client_id);
      
      invoice.products?.forEach(product => {
        if (product.amount <= 0) return;
        
        const key = product.product_name;
        if (!products[key]) {
          products[key] = {
            name: product.product_name,
            percentage: product.percentage,
            entries: [],
            totalAmount: 0,
            totalCommission: 0,
          };
        }
        
        products[key].entries.push({
          ncf: invoice.ncf,
          date: invoice.invoice_date || invoice.created_at,
          amount: Number(product.amount),
          clientId: (invoice as any).client_id,
          clientName,
        });
        products[key].totalAmount += Number(product.amount);
        products[key].totalCommission += Number(product.commission);
      });
    });
    
    return Object.values(products).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredInvoices, clients]);

  // Resto de productos (25%)
  const restBreakdown = useMemo(() => {
    const entries: ProductEntry[] = [];
    let totalAmount = 0;
    let totalCommission = 0;
    
    filteredInvoices.forEach(inv => {
      if (inv.rest_amount > 0) {
        const clientName = getClientName((inv as any).client_id);
        entries.push({
          ncf: inv.ncf,
          date: inv.invoice_date || inv.created_at,
          amount: Number(inv.rest_amount),
          clientId: (inv as any).client_id,
          clientName,
        });
        totalAmount += Number(inv.rest_amount);
        totalCommission += Number(inv.rest_commission);
      }
    });
    
    return { entries, totalAmount, totalCommission };
  }, [filteredInvoices, clients]);

  // Function to update global percentage
  const handleUpdateGlobalPercentage = async (productName: string, newPercentage: number): Promise<boolean> => {
    try {
      // Update percentage and recalculate commission for each affected invoice_product
      for (const invoice of filteredInvoices) {
        const productToUpdate = invoice.products?.find(p => p.product_name === productName);
        if (!productToUpdate) continue;
        
        const newCommission = (productToUpdate.amount * newPercentage) / 100;
        
        await supabase
          .from('invoice_products')
          .update({ 
            percentage: newPercentage,
            commission: newCommission 
          })
          .eq('invoice_id', invoice.id)
          .eq('product_name', productName);
        
        // Recalculate and update total commission for the invoice
        const otherProducts = invoice.products?.filter(p => p.product_name !== productName) || [];
        const otherCommissions = otherProducts.reduce((sum, p) => sum + Number(p.commission), 0);
        const newTotalCommission = otherCommissions + newCommission + Number(invoice.rest_commission);
        
        await supabase
          .from('invoices')
          .update({ total_commission: newTotalCommission })
          .eq('id', invoice.id);
      }
      
      toast.success(`Porcentaje de ${productName} actualizado a ${newPercentage}% en ${filteredInvoices.filter(inv => inv.products?.some(p => p.product_name === productName)).length} facturas`);
      onRefreshInvoices?.();
      return true;
    } catch (error) {
      console.error('Error updating global percentage:', error);
      toast.error('Error al actualizar el porcentaje');
      return false;
    }
  };

  const grandTotalCommission = useMemo(() => {
    return productsBreakdown.reduce((sum, p) => sum + p.totalCommission, 0) + restBreakdown.totalCommission;
  }, [productsBreakdown, restBreakdown]);

  const [year, month] = selectedMonth.split('-').map(Number);
  const monthLabel = format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: es });
  const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  
  // Check if selected month is current month
  const isCurrentMonth = selectedMonth === getMonthKey(new Date());

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await generateBreakdownPdf({
        month: capitalizedMonth,
        products: productsBreakdown,
        rest: restBreakdown,
        grandTotal: grandTotalCommission,
        sellerName,
      }, selectedMonth);
      toast.success('PDF generado correctamente');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (invoices.length === 0) {
    return (
      <Card className="p-12 text-center bg-card border-border">
        <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center animate-pulse-soft">
          <Package className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground mb-1">Sin datos</h3>
        <p className="text-sm text-muted-foreground">
          Guarda facturas para ver el desglose mensual
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-foreground">Desglose Mensual</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              isCurrentMonth 
                ? 'bg-primary/10 text-primary animate-pulse-soft' 
                : 'bg-muted text-muted-foreground'
            }`}>
              {capitalizedMonth}
              {isCurrentMonth && <span className="ml-1.5 text-xs">(Actual)</span>}
            </span>
          </div>
          <p className="text-muted-foreground">
            Resumen detallado por producto
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-56 bg-card border-border hover:bg-muted/50 transition-colors">
              <Calendar className="h-4 w-4 mr-2 text-primary" />
              <SelectValue placeholder="Seleccionar mes" />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => {
                const [y, mo] = m.split('-').map(Number);
                const label = format(new Date(y, mo - 1, 1), 'MMMM yyyy', { locale: es });
                const isCurrent = m === getMonthKey(new Date());
                return (
                  <SelectItem key={m} value={m}>
                    <span className="flex items-center gap-2">
                      {label.charAt(0).toUpperCase() + label.slice(1)}
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                          Actual
                        </span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          
          {filteredInvoices.length > 0 && (
            <Button
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf}
              className="gap-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              Exportar PDF
            </Button>
          )}
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">Sin facturas este mes</h3>
          <p className="text-sm text-muted-foreground">
            No hay facturas registradas para {capitalizedMonth}
          </p>
        </Card>
      ) : (
        <>
          {/* Product Cards Grid - 2 per row on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {productsBreakdown.map((product, index) => (
              <Card 
                key={product.name} 
                className="overflow-hidden bg-card border border-border/60 shadow-sm hover:shadow-md transition-all duration-300 animate-fade-in flex flex-col"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {/* Product Header */}
                <div className="px-4 py-3 bg-muted/30 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base text-foreground">{product.name}</h3>
                      <EditGlobalPercentageDialog
                        productName={product.name}
                        currentPercentage={product.percentage}
                        invoiceCount={product.entries.length}
                        month={capitalizedMonth}
                        onUpdate={(newPercentage) => handleUpdateGlobalPercentage(product.name, newPercentage)}
                      />
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-sm font-bold">
                      {product.percentage}%
                    </span>
                  </div>
                </div>
                
                <div className="p-4 flex-1 flex flex-col">
                  {/* Entries Table */}
                  <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto flex-1">
                    {product.entries.map((entry, i) => (
                      <div 
                        key={i} 
                        className="flex items-center justify-between text-sm py-2 px-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          {entry.clientName && (
                            <span className="text-foreground font-medium text-xs flex items-center gap-1 truncate">
                              <User className="h-3 w-3 text-primary shrink-0" />
                              {entry.clientName}
                            </span>
                          )}
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {entry.ncf}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground text-xs">
                            {format(parseDateSafe(entry.date), 'd MMM', { locale: es })}
                          </span>
                          <span className="font-semibold text-foreground text-sm">
                            ${formatNumber(entry.amount)}
                          </span>
                          {onUpdateInvoice && onDeleteInvoice && (
                            <EditInvoiceDialog
                              invoice={filteredInvoices.find(inv => inv.ncf === entry.ncf)!}
                              onUpdate={onUpdateInvoice}
                              onDelete={onDeleteInvoice}
                              trigger={
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-primary">
                                  <Pencil className="h-2.5 w-2.5" />
                                </Button>
                              }
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Línea divisoria */}
                  <div className="border-t border-dashed border-border my-2" />
                  
                  {/* Summary Row */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-muted-foreground">Subtotal</span>
                      <p className="font-bold text-base text-foreground">${formatNumber(product.totalAmount)}</p>
                    </div>
                    
                    {/* Comisión */}
                    <div className="px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-right">
                      <span className="text-[10px] text-success font-medium">Comisión ({product.percentage}%)</span>
                      <p className="font-bold text-lg text-success">${formatCurrency(product.totalCommission)}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            
            {/* Resto de Productos Card */}
            {restBreakdown.totalAmount > 0 && (
              <Card 
                className="overflow-hidden bg-card border border-border/60 shadow-sm hover:shadow-md transition-all duration-300 animate-fade-in flex flex-col"
                style={{ animationDelay: `${productsBreakdown.length * 80}ms` }}
              >
                {/* Header */}
                <div className="px-4 py-3 bg-secondary/20 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-base text-foreground">Resto de Productos</h3>
                    <span className="px-2.5 py-1 rounded-lg bg-secondary/30 text-secondary-foreground text-sm font-bold">
                      25%
                    </span>
                  </div>
                </div>
                
                <div className="p-4 flex-1 flex flex-col">
                  {/* Entries */}
                  <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto flex-1">
                    {restBreakdown.entries.map((entry, i) => (
                      <div 
                        key={i} 
                        className="flex items-center justify-between text-sm py-2 px-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          {entry.clientName && (
                            <span className="text-foreground font-medium text-xs flex items-center gap-1 truncate">
                              <User className="h-3 w-3 text-primary shrink-0" />
                              {entry.clientName}
                            </span>
                          )}
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {entry.ncf}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground text-xs">
                            {format(parseDateSafe(entry.date), 'd MMM', { locale: es })}
                          </span>
                          <span className="font-semibold text-foreground text-sm">
                            ${formatNumber(entry.amount)}
                          </span>
                          {onUpdateInvoice && onDeleteInvoice && (
                            <EditInvoiceDialog
                              invoice={filteredInvoices.find(inv => inv.ncf === entry.ncf)!}
                              onUpdate={onUpdateInvoice}
                              onDelete={onDeleteInvoice}
                              trigger={
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-primary">
                                  <Pencil className="h-2.5 w-2.5" />
                                </Button>
                              }
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Línea divisoria */}
                  <div className="border-t border-dashed border-border my-2" />
                  
                  {/* Summary */}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-muted-foreground">Subtotal</span>
                      <p className="font-bold text-base text-foreground">${formatNumber(restBreakdown.totalAmount)}</p>
                    </div>
                    
                    <div className="px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-right">
                      <span className="text-[10px] text-success font-medium">Comisión (25%)</span>
                      <p className="font-bold text-lg text-success">${formatCurrency(restBreakdown.totalCommission)}</p>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Grand Total */}
          <Card className="p-6 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/20 hover-lift">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Comisiones del Mes</p>
                <p className="text-sm text-muted-foreground">
                  {productsBreakdown.length} productos con comisiones variables + resto al 25% · {filteredInvoices.length} facturas
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium text-muted-foreground">{capitalizedMonth}</span>
                <p className="text-4xl font-bold text-success">${formatCurrency(grandTotalCommission)}</p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
