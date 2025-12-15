import { useMemo, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, DollarSign, Receipt, Calendar, ChevronLeft, ChevronRight, FileText, ArrowUpRight, ArrowDownRight, Minus, Award, Target, BarChart3, Package } from 'lucide-react';
import { Invoice } from '@/hooks/useInvoices';
import { Client } from '@/hooks/useClients';
import { formatCurrency, formatNumber, parseDateSafe } from '@/lib/formatters';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, addMonths, isSameMonth, getDaysInMonth, getDate } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateMonthlyPDF } from '@/lib/pdfGenerator';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface StatisticsProps {
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

export const Statistics = ({ invoices, sellerName, clients }: StatisticsProps) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'monthly' | 'annual' | 'pdf'>('monthly');
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const displayName = sellerName || 'Vendedor';

  // Stats for selected month
  const selectedMonthStats = useMemo(() => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    
    const monthInvoices = invoices.filter(inv => {
      const date = parseDateSafe(inv.invoice_date || inv.created_at);
      return isWithinInterval(date, { start, end });
    });

    // Calculate product breakdown
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

    // Add "Resto de productos" to the list
    if (restTotal > 0) {
      productMap['Resto de productos'] = {
        name: 'Resto de productos',
        totalAmount: restTotal,
        totalCommission: restCommission,
        percentage: 25,
      };
    }

    const productBreakdown = Object.values(productMap).sort((a, b) => b.totalCommission - a.totalCommission);

    // Find best sale
    const bestSale = monthInvoices.reduce((best, inv) => 
      Number(inv.total_amount) > Number(best?.total_amount || 0) ? inv : best
    , monthInvoices[0]);

    // Daily breakdown
    const daysInMonth = getDaysInMonth(selectedDate);
    const dailyData: { day: number; commission: number; invoiceCount: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayInvoices = monthInvoices.filter(inv => {
        const date = parseDateSafe(inv.invoice_date || inv.created_at);
        return getDate(date) === day;
      });
      dailyData.push({
        day,
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

  // Previous month stats for comparison
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

  // Generate executive summary with typing effect
  const executiveSummary = useMemo(() => {
    if (selectedMonthStats.invoiceCount === 0) {
      return `No hay facturas registradas para ${capitalizedMonth}.`;
    }

    const topProduct = selectedMonthStats.productBreakdown[0];
    const secondProduct = selectedMonthStats.productBreakdown[1];
    
    let summary = `En el mes de ${capitalizedMonth.split(' ')[0].toLowerCase()}, se logró un total de ventas para DLS de $${formatNumber(selectedMonthStats.totalSales)}. `;
    
    if (topProduct) {
      summary += `El mayor rendimiento provino de "${topProduct.name}", que generó $${formatCurrency(topProduct.totalCommission)} en comisiones para ${displayName}. `;
      if (topProduct.name === 'Resto de productos') {
        summary += `Es notable que esta categoría lidera debido a que acumula el 25% de los productos de las facturas. `;
      }
    }
    
    if (secondProduct) {
      summary += `Le sigue "${secondProduct.name}" con una sólida contribución, ya que vendió $${formatNumber(secondProduct.totalAmount)} para DLS, de los cuales ${displayName} comisionó $${formatCurrency(secondProduct.totalCommission)}. `;
    }
    
    summary += `En promedio, cada factura generó una ganancia de comisiones para ${displayName} de $${formatNumber(Math.round(selectedMonthStats.avgPerInvoice))} en este mes.`;
    
    return summary;
  }, [selectedMonthStats, capitalizedMonth, displayName]);

  // Typing effect
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
      }, 8);
      return () => clearInterval(interval);
    }
  }, [executiveSummary, viewMode, selectedMonthStats.invoiceCount]);

  const getChangeIndicator = (change: number) => {
    const isPositive = change > 0;
    const isNeutral = change === 0;
    
    if (isNeutral) {
      return { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted', label: '0%' };
    }
    
    return {
      icon: isPositive ? ArrowUpRight : ArrowDownRight,
      color: isPositive ? 'text-success' : 'text-destructive',
      bg: isPositive ? 'bg-success/10' : 'bg-destructive/10',
      label: `${isPositive ? '+' : ''}${change.toFixed(0)}%`
    };
  };

  const maxDailyCommission = Math.max(...selectedMonthStats.dailyData.map(d => d.commission), 1);

  const getClientName = (clientId?: string | null) => {
    if (!clientId || !clients) return null;
    return clients.find(c => c.id === clientId)?.name || null;
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in">
        {/* Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <TabsList className="grid w-full grid-cols-3 h-12">
            <TabsTrigger value="monthly" className="gap-2">
              <Calendar className="h-4 w-4" />
              Mensual
            </TabsTrigger>
            <TabsTrigger value="annual" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Anual
            </TabsTrigger>
            <TabsTrigger value="pdf" className="gap-2">
              <FileText className="h-4 w-4" />
              PDF
            </TabsTrigger>
          </TabsList>

          <TabsContent value="monthly" className="mt-6 space-y-6">
            {/* Month Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateMonth('prev')}
                className="h-10 w-10 hover:bg-primary/10"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-foreground">{capitalizedMonth}</span>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateMonth('next')}
                disabled={isSameMonth(selectedDate, new Date())}
                className="h-10 w-10 hover:bg-primary/10"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Year indicator */}
            <div className="text-center">
              <span className="text-sm text-muted-foreground">{format(selectedDate, 'yyyy')}</span>
            </div>

            {/* Main Commission Card */}
            <Card className="p-6 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border-primary/20">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">Comisiones de {displayName}</p>
                <p className="text-5xl font-bold text-primary">${formatCurrency(selectedMonthStats.totalCommission)}</p>
                {previousMonthStats.totalCommission > 0 && (
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${getChangeIndicator(commissionChange).bg} ${getChangeIndicator(commissionChange).color}`}>
                    {(() => {
                      const Icon = getChangeIndicator(commissionChange).icon;
                      return <Icon className="h-4 w-4" />;
                    })()}
                    {getChangeIndicator(commissionChange).label} vs mes anterior
                  </div>
                )}
              </div>
            </Card>

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4 hover-lift">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ventas Totales</p>
                    <p className="text-xl font-bold">${formatNumber(selectedMonthStats.totalSales)}</p>
                    {salesChange !== 0 && (
                      <span className={`text-xs ${getChangeIndicator(salesChange).color}`}>
                        {getChangeIndicator(salesChange).label}
                      </span>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="p-4 hover-lift">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Facturas</p>
                    <p className="text-xl font-bold">{selectedMonthStats.invoiceCount}</p>
                    {invoiceCountChange !== 0 && (
                      <span className={`text-xs ${getChangeIndicator(invoiceCountChange).color}`}>
                        {getChangeIndicator(invoiceCountChange).label}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Executive Summary */}
            {selectedMonthStats.invoiceCount > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Resumen Ejecutivo
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {typingText}
                  {isTyping && <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />}
                </p>
              </Card>
            )}

            {/* Strategic Summary */}
            {selectedMonthStats.productBreakdown.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Resumen Estratégico</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Winner #1 */}
                  {selectedMonthStats.productBreakdown[0] && (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Award className="h-5 w-5 text-amber-500" />
                        <span className="text-xs font-medium text-amber-600">Ganador #1</span>
                      </div>
                      <p className="font-bold text-foreground">{selectedMonthStats.productBreakdown[0].name}</p>
                      <p className="text-xs text-muted-foreground mt-1">Venta DLS: ${formatNumber(selectedMonthStats.productBreakdown[0].totalAmount)}</p>
                      <p className="text-sm font-semibold text-success mt-2">
                        Comisión {displayName}: ${formatCurrency(selectedMonthStats.productBreakdown[0].totalCommission)}
                      </p>
                    </div>
                  )}

                  {/* Second Place */}
                  {selectedMonthStats.productBreakdown[1] && (
                    <div className="p-4 rounded-xl bg-muted/50 border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-5 w-5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">#2 Segundo Lugar</span>
                      </div>
                      <p className="font-bold text-foreground">{selectedMonthStats.productBreakdown[1].name}</p>
                      <p className="text-xs text-muted-foreground mt-1">Venta DLS: ${formatNumber(selectedMonthStats.productBreakdown[1].totalAmount)}</p>
                      <p className="text-sm font-semibold text-success mt-2">
                        Comisión {displayName}: ${formatCurrency(selectedMonthStats.productBreakdown[1].totalCommission)}
                      </p>
                    </div>
                  )}

                  {/* Record Sale */}
                  {selectedMonthStats.bestSale && (
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        <span className="text-xs font-medium text-primary">Venta Récord</span>
                      </div>
                      <p className="font-bold text-2xl text-foreground">${formatNumber(selectedMonthStats.bestSale.total_amount)}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">{selectedMonthStats.bestSale.ncf}</p>
                      <p className="text-sm font-semibold text-success mt-2">
                        Comisión: ${formatCurrency(selectedMonthStats.bestSale.total_commission)}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Income Origin */}
            {selectedMonthStats.productBreakdown.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Origen de los ingresos
                </h3>
                <div className="space-y-3">
                  {selectedMonthStats.productBreakdown.slice(0, 6).map((product, index) => {
                    const percentage = (product.totalCommission / selectedMonthStats.totalCommission) * 100;
                    return (
                      <div key={product.name} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-foreground">{product.name}</span>
                            <span className="text-sm font-bold text-success">${formatCurrency(product.totalCommission)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-right">{percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Daily Activity */}
            {selectedMonthStats.invoiceCount > 0 && (
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground">Actividad Diaria</h3>
                  <span className="text-xs text-muted-foreground">Clic en una barra para ver detalle.</span>
                </div>
                
                {selectedMonthStats.bestDay && selectedMonthStats.bestDay.commission > 0 && (
                  <p className="text-sm text-muted-foreground mb-4">
                    El mejor día de {displayName} fue el <span className="font-semibold text-foreground">{selectedMonthStats.bestDay.day} de {format(selectedDate, 'MMMM', { locale: es })}</span>.
                  </p>
                )}

                <div className="flex items-end gap-0.5 h-32">
                  {selectedMonthStats.dailyData.map((day) => {
                    const height = day.commission > 0 ? (day.commission / maxDailyCommission) * 100 : 2;
                    const isBestDay = day.day === selectedMonthStats.bestDay?.day && day.commission > 0;
                    
                    return (
                      <Tooltip key={day.day}>
                        <TooltipTrigger asChild>
                          <div 
                            className={`flex-1 rounded-t cursor-pointer transition-all hover:opacity-80 ${
                              isBestDay ? 'bg-primary' : day.commission > 0 ? 'bg-primary/40' : 'bg-muted'
                            }`}
                            style={{ height: `${height}%`, minHeight: '4px' }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">Día {day.day}</p>
                          <p className="text-xs text-muted-foreground">{day.invoiceCount} factura{day.invoiceCount !== 1 ? 's' : ''}</p>
                          <p className="text-xs font-semibold text-success">${formatCurrency(day.commission)}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                  {[1, 5, 10, 15, 20, 25, 30].map(day => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="annual" className="mt-6">
            <Card className="p-8 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold text-foreground mb-2">Vista Anual</h3>
              <p className="text-sm text-muted-foreground">Próximamente: Resumen anual con comparativas entre meses y tendencias.</p>
            </Card>
          </TabsContent>

          <TabsContent value="pdf" className="mt-6 space-y-4">
            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-4">Generar Reporte PDF</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Genera un reporte PDF completo del mes seleccionado con todas las estadísticas y desglose.
              </p>
              {selectedMonthStats.invoiceCount > 0 ? (
                <Button
                  onClick={() => {
                    generateMonthlyPDF(selectedMonthStats.invoices, capitalizedMonth);
                    toast.success('PDF generado correctamente');
                  }}
                  className="w-full gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Generar PDF de {capitalizedMonth} ({selectedMonthStats.invoiceCount} facturas)
                </Button>
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No hay facturas para generar un reporte de {capitalizedMonth}.
                </p>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
};
