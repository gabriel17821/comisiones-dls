import { useMemo, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, DollarSign, Receipt, ChevronLeft, ChevronRight, FileText, ArrowUpRight, Award, Trophy, BarChart3, Calendar, Wallet } from 'lucide-react';
import { Invoice } from '@/hooks/useInvoices';
import { Client } from '@/hooks/useClients';
import { formatCurrency, formatNumber, parseDateSafe } from '@/lib/formatters';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, addMonths, isSameMonth, getDaysInMonth, getDate } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateMonthlyPDF } from '@/lib/pdfGenerator';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AdvancedStatisticsProps {
  invoices: Invoice[];
  sellerName?: string;
  clients?: Client[];
}

interface ProductSummary {
  name: string;
  totalAmount: number;
  totalCommission: number;
  percentage: number;
}

export const AdvancedStatistics = ({ invoices, sellerName, clients }: AdvancedStatisticsProps) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'monthly' | 'annual'>('monthly');
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const displayName = sellerName || 'NEFTALÍ';

  // Stats for selected month
  const selectedMonthStats = useMemo(() => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    
    const monthInvoices = invoices.filter(inv => {
      const date = parseDateSafe(inv.invoice_date || inv.created_at);
      return isWithinInterval(date, { start, end });
    });

    const productMap: Record<string, ProductSummary> = {};
    let restTotal = 0;
    let restCommission = 0;

    monthInvoices.forEach(inv => {
      inv.products?.forEach(product => {
        const key = product.product_name;
        if (!productMap[key]) {
          productMap[key] = {
            name: product.product_name,
            totalAmount: 0,
            totalCommission: 0,
            percentage: product.percentage,
          };
        }
        productMap[key].totalAmount += Number(product.amount);
        productMap[key].totalCommission += Number(product.commission);
      });
      restTotal += Number(inv.rest_amount);
      restCommission += Number(inv.rest_commission);
    });

    if (restTotal > 0) {
      productMap['Resto de productos'] = {
        name: 'Resto de productos',
        totalAmount: restTotal,
        totalCommission: restCommission,
        percentage: 25,
      };
    }

    const productBreakdown = Object.values(productMap).sort((a, b) => b.totalCommission - a.totalCommission);

    const bestSale = monthInvoices.reduce((best, inv) => 
      Number(inv.total_amount) > Number(best?.total_amount || 0) ? inv : best
    , monthInvoices[0]);

    const daysInMonth = getDaysInMonth(selectedDate);
    const dailyData: { day: number; sales: number; commission: number; invoiceCount: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayInvoices = monthInvoices.filter(inv => {
        const date = parseDateSafe(inv.invoice_date || inv.created_at);
        return getDate(date) === day;
      });
      dailyData.push({
        day,
        sales: dayInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
        commission: dayInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0),
        invoiceCount: dayInvoices.length,
      });
    }

    const bestDay = dailyData.reduce((best, current) => 
      current.commission > best.commission ? current : best
    , dailyData[0]);

    return {
      totalSales: monthInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
      totalCommission: monthInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0),
      invoiceCount: monthInvoices.length,
      invoices: monthInvoices,
      avgPerInvoice: monthInvoices.length > 0 
        ? monthInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0) / monthInvoices.length
        : 0,
      productBreakdown,
      bestSale,
      dailyData,
      bestDay,
    };
  }, [invoices, selectedDate]);

  const previousMonthStats = useMemo(() => {
    const prevDate = subMonths(selectedDate, 1);
    const start = startOfMonth(prevDate);
    const end = endOfMonth(prevDate);
    
    const monthInvoices = invoices.filter(inv => {
      const date = parseDateSafe(inv.invoice_date || inv.created_at);
      return isWithinInterval(date, { start, end });
    });

    return {
      totalSales: monthInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
      totalCommission: monthInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0),
      invoiceCount: monthInvoices.length,
    };
  }, [invoices, selectedDate]);

  const commissionChange = previousMonthStats.totalCommission > 0 
    ? ((selectedMonthStats.totalCommission - previousMonthStats.totalCommission) / previousMonthStats.totalCommission) * 100 
    : 0;

  const salesChange = previousMonthStats.totalSales > 0 
    ? ((selectedMonthStats.totalSales - previousMonthStats.totalSales) / previousMonthStats.totalSales) * 100 
    : 0;

  const invoiceCountChange = previousMonthStats.invoiceCount > 0
    ? ((selectedMonthStats.invoiceCount - previousMonthStats.invoiceCount) / previousMonthStats.invoiceCount) * 100
    : 0;

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const monthLabel = format(selectedDate, "MMMM yyyy", { locale: es });
  const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const executiveSummary = useMemo(() => {
    if (selectedMonthStats.invoiceCount === 0) {
      return `No hay facturas registradas para ${capitalizedMonth}.`;
    }

    const topProduct = selectedMonthStats.productBreakdown[0];
    const secondProduct = selectedMonthStats.productBreakdown[1];
    
    let summary = `En el mes de ${capitalizedMonth.split(' ')[0].toLowerCase()}, se logró un total de ventas para DLS de $${formatNumber(selectedMonthStats.totalSales)}. `;
    
    if (topProduct) {
      summary += `El mayor rendimiento provino de "${topProduct.name}", que generó $${formatCurrency(topProduct.totalCommission)} en comisiones para ${displayName}. `;
    }
    
    if (secondProduct) {
      summary += `Le sigue "${secondProduct.name}" con $${formatNumber(secondProduct.totalAmount)} en ventas.`;
    }
    
    return summary;
  }, [selectedMonthStats, capitalizedMonth, displayName]);

  useEffect(() => {
    if (viewMode === 'monthly' && selectedMonthStats.invoiceCount > 0) {
      setTypingText('');
      setIsTyping(true);
      let index = 0;
      const interval = setInterval(() => {
        if (index < executiveSummary.length) {
          setTypingText(executiveSummary.slice(0, index + 1));
          index++;
        } else {
          setIsTyping(false);
          clearInterval(interval);
        }
      }, 6);
      return () => clearInterval(interval);
    }
  }, [executiveSummary, viewMode, selectedMonthStats.invoiceCount]);

  const getChangeLabel = (change: number) => {
    if (change === 0) return '0%';
    return `${change > 0 ? '↗' : '↘'} ${Math.abs(change).toFixed(0)}%`;
  };

  const maxDailyCommission = Math.max(...selectedMonthStats.dailyData.map(d => d.commission), 1);
  const totalCommission = selectedMonthStats.productBreakdown.reduce((sum, p) => sum + p.totalCommission, 0);

  const years = useMemo(() => {
    const yearsSet = new Set<number>();
    yearsSet.add(new Date().getFullYear());
    invoices.forEach(inv => {
      const date = parseDateSafe(inv.invoice_date || inv.created_at);
      yearsSet.add(date.getFullYear());
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [invoices]);

  const handleDownloadPdf = () => {
    generateMonthlyPDF(selectedMonthStats.invoices, capitalizedMonth);
    toast.success('PDF generado');
  };

  if (invoices.length === 0) {
    return (
      <Card className="p-12 text-center bg-card border-border">
        <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground mb-1">Sin datos</h3>
        <p className="text-sm text-muted-foreground">Guarda facturas para ver estadísticas</p>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-1">
            <Button variant={viewMode === 'monthly' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('monthly')}>Mensual</Button>
            <Button variant={viewMode === 'annual' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('annual')}>Anual</Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf} className="gap-2">
              <FileText className="h-4 w-4" />PDF
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigateMonth('prev')} className="h-9 w-9">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-lg font-bold text-foreground">{capitalizedMonth}</span>
            <Button variant="ghost" size="icon" onClick={() => navigateMonth('next')} disabled={isSameMonth(selectedDate, new Date())} className="h-9 w-9">
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1 p-6 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white relative overflow-hidden">
            <div className="absolute top-4 right-4"><ArrowUpRight className="h-6 w-6 opacity-50" /></div>
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-5 w-5 opacity-80" />
              <span className="text-sm opacity-80">COMISIONES DE {displayName.toUpperCase()}</span>
            </div>
            <p className="text-4xl font-bold mb-2">${formatCurrency(selectedMonthStats.totalCommission)}</p>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${commissionChange >= 0 ? 'bg-white/20' : 'bg-red-400/30'}`}>
                {getChangeLabel(commissionChange)}
              </span>
              <span className="text-sm opacity-70">vs mes anterior</span>
            </div>
          </Card>

          <Card className="p-5 hover-lift">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-blue-500" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">VENTAS TOTALES</span>
            </div>
            <p className="text-3xl font-bold text-foreground">${formatNumber(selectedMonthStats.totalSales)}</p>
            {salesChange !== 0 && <span className={`text-sm ${salesChange >= 0 ? 'text-success' : 'text-destructive'}`}>{getChangeLabel(salesChange)}</span>}
          </Card>

          <Card className="p-5 hover-lift">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-purple-500" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">FACTURAS</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{selectedMonthStats.invoiceCount}</p>
            {invoiceCountChange !== 0 && <span className={`text-sm ${invoiceCountChange >= 0 ? 'text-success' : 'text-destructive'}`}>{getChangeLabel(invoiceCountChange)}</span>}
          </Card>
        </div>

        {/* Executive Summary */}
        {selectedMonthStats.invoiceCount > 0 && (
          <Card className="p-5 bg-gradient-to-r from-muted/30 to-muted/10 border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-500 text-sm">💡</span>
              <h3 className="font-semibold text-foreground">Resumen Ejecutivo</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {typingText}{isTyping && <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />}
            </p>
          </Card>
        )}

        {/* Strategic + Origin */}
        {selectedMonthStats.productBreakdown.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Resumen Estratégico</h3>
              </div>
              <div className="space-y-3">
                {selectedMonthStats.productBreakdown[0] && (
                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <span className="text-xs font-semibold text-amber-600 uppercase">Ganador #1</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-foreground">{selectedMonthStats.productBreakdown[0].name}</p>
                        <p className="text-xs text-muted-foreground">Venta: ${formatNumber(selectedMonthStats.productBreakdown[0].totalAmount)}</p>
                      </div>
                      <p className="text-xl font-bold text-success">${formatCurrency(selectedMonthStats.productBreakdown[0].totalCommission)}</p>
                    </div>
                  </div>
                )}
                {selectedMonthStats.productBreakdown[1] && (
                  <div className="p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <Award className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase">#2 Segundo Lugar</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-foreground">{selectedMonthStats.productBreakdown[1].name}</p>
                      <p className="text-lg font-bold text-success">${formatCurrency(selectedMonthStats.productBreakdown[1].totalCommission)}</p>
                    </div>
                  </div>
                )}
                {selectedMonthStats.bestSale && (
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-primary uppercase">Venta Récord</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-2xl text-foreground">${formatNumber(selectedMonthStats.bestSale.total_amount)}</p>
                        <p className="text-xs text-muted-foreground font-mono">{selectedMonthStats.bestSale.ncf}</p>
                      </div>
                      <p className="text-lg font-bold text-success">${formatCurrency(selectedMonthStats.bestSale.total_commission)}</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Origen de los ingresos</h3>
              </div>
              <div className="space-y-3">
                {selectedMonthStats.productBreakdown.slice(0, 4).map((product, index) => {
                  const percentage = totalCommission > 0 ? (product.totalCommission / totalCommission) * 100 : 0;
                  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500'];
                  return (
                    <div key={product.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`h-5 w-5 rounded flex items-center justify-center text-[10px] font-bold text-white ${colors[index]}`}>{index + 1}</span>
                          <span className="font-medium text-foreground">{product.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-success">${formatCurrency(product.totalCommission)}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${colors[index]} transition-all duration-500`} style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* Daily Activity */}
        {selectedMonthStats.invoiceCount > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground">Actividad Diaria</h3>
              </div>
              {selectedMonthStats.bestDay && selectedMonthStats.bestDay.commission > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium text-amber-600">
                    El mejor día fue el {selectedMonthStats.bestDay.day} de {format(selectedDate, 'MMMM', { locale: es })}.
                  </span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-4">Clic en una barra para ver detalle.</p>
            <div className="flex items-end gap-0.5 h-32 mt-4">
              {selectedMonthStats.dailyData.map((day) => {
                const heightPercentage = maxDailyCommission > 0 ? (day.commission / maxDailyCommission) * 100 : 0;
                const isBestDay = selectedMonthStats.bestDay?.day === day.day;
                return (
                  <Tooltip key={day.day}>
                    <TooltipTrigger asChild>
                      <div 
                        className={`flex-1 rounded-t cursor-pointer transition-all duration-200 hover:opacity-80 ${day.invoiceCount > 0 ? (isBestDay ? 'bg-emerald-500' : 'bg-blue-500') : 'bg-muted'}`}
                        style={{ height: `${Math.max(heightPercentage, day.invoiceCount > 0 ? 8 : 2)}%`, minHeight: day.invoiceCount > 0 ? '8px' : '2px' }}
                      />
                    </TooltipTrigger>
                    <TooltipContent className="p-3">
                      <p className="font-semibold mb-1">{format(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day.day), "EEEE d 'de' MMMM", { locale: es })}</p>
                      <p>Ventas: <span className="font-semibold">${formatNumber(day.sales)}</span></p>
                      <p className="text-success">Comisión: <span className="font-semibold">${formatCurrency(day.commission)}</span></p>
                      <p>Facturas: <span className="font-semibold">{day.invoiceCount}</span></p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="flex gap-0.5 mt-2">
              {selectedMonthStats.dailyData.map((day) => (
                <div key={day.day} className="flex-1 text-center text-[9px] text-muted-foreground">{day.day % 5 === 1 || day.day === 1 ? day.day : ''}</div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
};