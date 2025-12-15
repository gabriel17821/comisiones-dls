import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, ChevronDown, Calendar, Receipt, Hash, TrendingUp, ArrowUpRight, ArrowDownRight, Sparkles, Pencil, User } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Invoice } from '@/hooks/useInvoices';
import { Client } from '@/hooks/useClients';
import { formatCurrency, formatNumber, parseDateSafe } from '@/lib/formatters';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EditInvoiceDialog } from '@/components/EditInvoiceDialog';

interface Product {
  id: string;
  name: string;
  percentage: number;
  color: string;
  is_default: boolean;
}

interface InvoiceHistoryProps {
  invoices: Invoice[];
  loading: boolean;
  onDelete: (id: string) => Promise<boolean>;
  onUpdateInvoice: (
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
  clients: Client[];
  products: Product[];
}

export const InvoiceHistory = ({ invoices, loading, onDelete, onUpdateInvoice, clients, products }: InvoiceHistoryProps) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  const getClientName = (clientId?: string | null) => {
    if (!clientId) return null;
    const client = clients.find(c => c.id === clientId);
    return client?.name || null;
  };

  const months = useMemo(() => {
    const uniqueMonths = new Set<string>();
    invoices.forEach(inv => {
      const date = parseDateSafe(inv.invoice_date || inv.created_at);
      uniqueMonths.add(format(date, 'yyyy-MM'));
    });
    return Array.from(uniqueMonths).sort().reverse();
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    if (selectedMonth === 'all') return invoices;
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(new Date(year, month - 1));
    
    return invoices.filter(inv => 
      isWithinInterval(parseDateSafe(inv.invoice_date || inv.created_at), { start, end })
    );
  }, [invoices, selectedMonth]);

  const totalStats = useMemo(() => {
    return {
      totalAmount: filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
      totalCommission: filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0),
    };
  }, [filteredInvoices]);

  const previousPeriodStats = useMemo(() => {
    if (selectedMonth === 'all') return null;
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const currentDate = new Date(year, month - 1);
    const prevDate = subMonths(currentDate, 1);
    const start = startOfMonth(prevDate);
    const end = endOfMonth(prevDate);
    
    const prevInvoices = invoices.filter(inv => 
      isWithinInterval(parseDateSafe(inv.invoice_date || inv.created_at), { start, end })
    );
    
    return {
      totalAmount: prevInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
      totalCommission: prevInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0),
      invoiceCount: prevInvoices.length,
    };
  }, [invoices, selectedMonth]);

  const getChangePercent = (current: number, previous: number | undefined) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  const salesChange = previousPeriodStats ? getChangePercent(totalStats.totalAmount, previousPeriodStats.totalAmount) : null;
  const commissionChange = previousPeriodStats ? getChangePercent(totalStats.totalCommission, previousPeriodStats.totalCommission) : null;

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  const prevMonthLabel = selectedMonth !== 'all' 
    ? format(subMonths(new Date(selectedMonth + '-01'), 1), 'MMMM', { locale: es })
    : '';

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in">
        {/* Header Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 bg-card border-border stat-card hover-lift">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Receipt className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Facturas</p>
                <p className="text-2xl font-bold text-foreground animate-count-up">{filteredInvoices.length}</p>
              </div>
              {filteredInvoices.length >= 30 && (
                <div className="badge-new flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                </div>
              )}
            </div>
          </Card>
          
          <Card className="p-4 bg-card border-border stat-card hover-lift">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Hash className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Total Ventas</p>
                <p className="text-2xl font-bold text-foreground animate-count-up">${formatNumber(totalStats.totalAmount)}</p>
                {salesChange !== null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`inline-flex items-center gap-1 text-xs mt-1 cursor-help ${
                        salesChange >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {salesChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {salesChange > 0 ? '+' : ''}{salesChange.toFixed(1)}%
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">vs {prevMonthLabel}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-card border-border stat-card hover-lift hover-glow">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg gradient-success flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Total Comisión</p>
                <p className="text-2xl font-bold text-success animate-count-up">${formatCurrency(totalStats.totalCommission)}</p>
                {commissionChange !== null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`inline-flex items-center gap-1 text-xs mt-1 cursor-help ${
                        commissionChange >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {commissionChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {commissionChange > 0 ? '+' : ''}{commissionChange.toFixed(1)}%
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        vs {prevMonthLabel}
                        <br />
                        <span className="text-muted-foreground">
                          {commissionChange >= 0 ? '+' : ''}${formatNumber(Math.round(totalStats.totalCommission - (previousPeriodStats?.totalCommission || 0)))}
                        </span>
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Controls */}
        <Card className="p-4 bg-card border-border hover-lift">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-52 bg-background border-border">
                  <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Filtrar por mes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las facturas</SelectItem>
                  {months.map(month => {
                    const label = format(new Date(month + '-01'), 'MMMM yyyy', { locale: es });
                    return (
                      <SelectItem key={month} value={month}>
                        {label.charAt(0).toUpperCase() + label.slice(1)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Invoice List */}
        {filteredInvoices.length === 0 ? (
          <Card className="p-12 text-center bg-card border-border">
            <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center animate-pulse-soft">
              <Receipt className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">No hay facturas</h3>
            <p className="text-sm text-muted-foreground">
              {selectedMonth === 'all' 
                ? 'Aún no has guardado ninguna factura' 
                : 'No hay facturas para este mes'}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredInvoices.map((invoice, index) => {
              const clientName = getClientName((invoice as any).client_id);
              
              return (
                <Card 
                  key={invoice.id} 
                  className={`overflow-hidden transition-all duration-300 bg-card border-border hover-lift ${
                    expandedInvoice === invoice.id ? 'ring-2 ring-primary/30 shadow-md' : 'hover:shadow-sm'
                  }`}
                  style={{ 
                    animationDelay: `${index * 30}ms`,
                    animation: 'slideUp 0.3s ease-out forwards'
                  }}
                >
                  <div 
                    className="p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex h-10 w-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 items-center justify-center">
                          <span className="text-xs font-bold text-primary">#{filteredInvoices.length - index}</span>
                        </div>
                        <div>
                          {clientName && (
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <User className="h-3 w-3 text-primary" />
                              <span className="font-semibold text-sm text-foreground">{clientName}</span>
                            </div>
                          )}
                          <span className="font-mono text-xs text-muted-foreground">{invoice.ncf}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(parseDateSafe(invoice.invoice_date || invoice.created_at), "d MMM yyyy", { locale: es })}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 sm:gap-6">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Factura</p>
                          <p className="font-semibold text-foreground">${formatNumber(invoice.total_amount)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Comisión</p>
                          <p className="font-bold text-success">${formatCurrency(invoice.total_commission)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <EditInvoiceDialog
                            invoice={invoice}
                            clients={clients}
                            onUpdate={onUpdateInvoice}
                            onDelete={onDelete}
                            trigger={
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar factura?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción eliminará la factura {invoice.ncf} permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => onDelete(invoice.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <div className={`h-8 w-8 flex items-center justify-center transition-transform duration-200 ${
                            expandedInvoice === invoice.id ? 'rotate-180' : ''
                          }`}>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={`overflow-hidden transition-all duration-300 ease-out ${
                    expandedInvoice === invoice.id ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <div className="px-4 pb-4 pt-2 border-t border-border">
                      <div className="space-y-2 mb-4">
                        {invoice.products?.map((p, pIndex) => (
                          <div 
                            key={p.id} 
                            className="flex justify-between items-center text-sm p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                            style={{ animationDelay: `${pIndex * 50}ms` }}
                          >
                            <div className="flex items-center gap-3">
                              <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-bold">{p.percentage}%</span>
                              <span className="text-foreground">{p.product_name}</span>
                            </div>
                            <div className="text-right flex items-center gap-2">
                              <span className="text-muted-foreground">${formatNumber(p.amount)}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-success font-semibold">${formatCurrency(p.commission)}</span>
                            </div>
                          </div>
                        ))}
                        {invoice.rest_amount > 0 && (
                          <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-3">
                              <span className="px-2 py-1 rounded bg-muted text-muted-foreground text-xs font-bold">{invoice.rest_percentage}%</span>
                              <span className="text-foreground">Resto de productos</span>
                            </div>
                            <div className="text-right flex items-center gap-2">
                              <span className="text-muted-foreground">${formatNumber(invoice.rest_amount)}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-success font-semibold">${formatCurrency(invoice.rest_commission)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex justify-between items-center pt-3 border-t border-border">
                        <span className="font-medium text-foreground">Total Comisión</span>
                        <span className="text-xl font-bold text-success">${formatCurrency(invoice.total_commission)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
