import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, TrendingDown, DollarSign, Receipt, ChevronLeft, ChevronRight, 
  FileText, Users, Package, Calendar, ArrowUpRight, ArrowDownRight,
  BarChart3, PieChart
} from 'lucide-react';
import { Invoice } from '@/hooks/useInvoices';
import { Client } from '@/hooks/useClients';
import { formatCurrency, formatNumber, parseDateSafe } from '@/lib/formatters';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, addMonths, isSameMonth, getDaysInMonth, getDate } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateMonthlyPDF } from '@/lib/pdfGenerator';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

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

interface ClientSummary {
  id: string;
  name: string;
  invoiceCount: number;
  totalAmount: number;
  totalCommission: number;
}

export const AdvancedStatistics = ({ invoices, sellerName, clients = [] }: AdvancedStatisticsProps) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const displayName = sellerName || 'NEFTALÍ';

  // Stats for selected month
  const stats = useMemo(() => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    
    const monthInvoices = invoices.filter(inv => {
      const date = parseDateSafe(inv.invoice_date || inv.created_at);
      return isWithinInterval(date, { start, end });
    });

    // Products breakdown
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
      productMap['Resto'] = {
        name: 'Resto',
        totalAmount: restTotal,
        totalCommission: restCommission,
        percentage: 25,
      };
    }

    const productBreakdown = Object.values(productMap).sort((a, b) => b.totalCommission - a.totalCommission);

    // Client breakdown
    const clientMap: Record<string, ClientSummary> = {};
    monthInvoices.forEach(inv => {
      const invWithClient = inv as any;
      const clientId = invWithClient.client_id || 'unknown';
      const clientData = invWithClient.clients;
      const clientName = clientData?.name || 'Sin cliente';
      
      if (!clientMap[clientId]) {
        clientMap[clientId] = {
          id: clientId,
          name: clientName,
          invoiceCount: 0,
          totalAmount: 0,
          totalCommission: 0,
        };
      }
      clientMap[clientId].invoiceCount += 1;
      clientMap[clientId].totalAmount += Number(inv.total_amount);
      clientMap[clientId].totalCommission += Number(inv.total_commission);
    });

    const clientBreakdown = Object.values(clientMap).sort((a, b) => b.totalCommission - a.totalCommission);

    // Daily data for chart
    const daysInMonth = getDaysInMonth(selectedDate);
    const dailyData: { day: number; date: string; ventas: number; comision: number; facturas: number }[] = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dayInvoices = monthInvoices.filter(inv => {
        const date = parseDateSafe(inv.invoice_date || inv.created_at);
        return getDate(date) === day;
      });
      dailyData.push({
        day,
        date: `${day}`,
        ventas: dayInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
        comision: dayInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0),
        facturas: dayInvoices.length,
      });
    }

    // Best day
    const bestDay = dailyData.reduce((best, current) => 
      current.comision > best.comision ? current : best
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
      clientBreakdown,
      dailyData,
      bestDay,
      uniqueClients: new Set(monthInvoices.map(inv => (inv as any).client_id).filter(Boolean)).size,
    };
  }, [invoices, selectedDate]);

  // Previous month for comparison
  const prevStats = useMemo(() => {
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

  const commissionChange = prevStats.totalCommission > 0 
    ? ((stats.totalCommission - prevStats.totalCommission) / prevStats.totalCommission) * 100 
    : 0;

  const salesChange = prevStats.totalSales > 0 
    ? ((stats.totalSales - prevStats.totalSales) / prevStats.totalSales) * 100 
    : 0;

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const monthLabel = format(selectedDate, "MMMM yyyy", { locale: es });
  const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const handleDownloadPdf = () => {
    generateMonthlyPDF(stats.invoices, capitalizedMonth);
    toast.success('PDF generado correctamente');
  };

  const totalProductCommission = stats.productBreakdown.reduce((sum, p) => sum + p.totalCommission, 0);

  if (invoices.length === 0) {
    return (
      <Card className="p-16 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted mx-auto mb-6 flex items-center justify-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-xl text-foreground mb-2">Sin datos aún</h3>
        <p className="text-muted-foreground">Guarda tu primera factura para ver las estadísticas</p>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in">
        {/* Header with Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigateMonth('prev')} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-bold text-foreground min-w-[180px] text-center">{capitalizedMonth}</h2>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigateMonth('next')} 
              disabled={isSameMonth(selectedDate, new Date())} 
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} className="gap-2">
            <FileText className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>

        {/* KPI Cards - Clean minimal design */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Commission */}
          <Card className="p-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white/80">Comisión</span>
              <DollarSign className="h-5 w-5 text-white/60" />
            </div>
            <p className="text-3xl font-black">${formatCurrency(stats.totalCommission)}</p>
            {commissionChange !== 0 && (
              <div className={`flex items-center gap-1 mt-2 text-sm ${commissionChange >= 0 ? 'text-emerald-100' : 'text-red-200'}`}>
                {commissionChange >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                <span>{Math.abs(commissionChange).toFixed(0)}% vs anterior</span>
              </div>
            )}
          </Card>

          {/* Sales */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Ventas</span>
              <TrendingUp className="h-5 w-5 text-muted-foreground/60" />
            </div>
            <p className="text-3xl font-black text-foreground">${formatNumber(stats.totalSales)}</p>
            {salesChange !== 0 && (
              <div className={`flex items-center gap-1 mt-2 text-sm ${salesChange >= 0 ? 'text-success' : 'text-destructive'}`}>
                {salesChange >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                <span>{Math.abs(salesChange).toFixed(0)}%</span>
              </div>
            )}
          </Card>

          {/* Invoices */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Facturas</span>
              <Receipt className="h-5 w-5 text-muted-foreground/60" />
            </div>
            <p className="text-3xl font-black text-foreground">{stats.invoiceCount}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Promedio: ${formatCurrency(stats.avgPerInvoice)}
            </p>
          </Card>

          {/* Clients */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Clientes</span>
              <Users className="h-5 w-5 text-muted-foreground/60" />
            </div>
            <p className="text-3xl font-black text-foreground">{stats.uniqueClients}</p>
            <p className="text-sm text-muted-foreground mt-2">
              activos este mes
            </p>
          </Card>
        </div>

        {/* Performance Chart */}
        {stats.invoiceCount > 0 && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-foreground">Rendimiento Diario</h3>
                <p className="text-sm text-muted-foreground">Comisiones generadas día a día</p>
              </div>
              {stats.bestDay && stats.bestDay.comision > 0 && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Mejor día</p>
                  <p className="font-bold text-success">{stats.bestDay.day} de {format(selectedDate, 'MMM', { locale: es })} • ${formatCurrency(stats.bestDay.comision)}</p>
                </div>
              )}
            </div>
            
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.dailyData}>
                  <defs>
                    <linearGradient id="colorComision" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                    formatter={(value: number, name: string) => [
                      `$${name === 'comision' ? formatCurrency(value) : formatNumber(value)}`,
                      name === 'comision' ? 'Comisión' : 'Ventas'
                    ]}
                    labelFormatter={(label) => `Día ${label}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="comision" 
                    stroke="hsl(var(--success))" 
                    strokeWidth={2}
                    fill="url(#colorComision)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Products & Clients Grid */}
        {stats.invoiceCount > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Products Breakdown */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Package className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Productos</h3>
              </div>
              <div className="space-y-4">
                {stats.productBreakdown.slice(0, 5).map((product, index) => {
                  const percentage = totalProductCommission > 0 ? (product.totalCommission / totalProductCommission) * 100 : 0;
                  const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500'];
                  return (
                    <div key={product.name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${colors[index]}`} />
                          <span className="text-sm font-medium text-foreground">{product.name}</span>
                        </div>
                        <span className="text-sm font-bold text-success">${formatCurrency(product.totalCommission)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${colors[index]} transition-all duration-500`} 
                          style={{ width: `${percentage}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Top Clients */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Users className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Top Clientes</h3>
              </div>
              <div className="space-y-3">
                {stats.clientBreakdown.slice(0, 5).map((client, index) => (
                  <div key={client.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-foreground text-sm">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.invoiceCount} factura{client.invoiceCount !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-success text-sm">${formatCurrency(client.totalCommission)}</p>
                      <p className="text-xs text-muted-foreground">${formatNumber(client.totalAmount)}</p>
                    </div>
                  </div>
                ))}
                {stats.clientBreakdown.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay clientes este mes</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Quick Insights */}
        {stats.invoiceCount > 0 && stats.productBreakdown.length > 0 && (
          <Card className="p-5 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 border-primary/20">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <PieChart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">Resumen del mes</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  En {capitalizedMonth.split(' ')[0].toLowerCase()}, 
                  <span className="font-medium text-foreground"> {stats.productBreakdown[0]?.name}</span> fue el producto con mayor rendimiento, 
                  generando <span className="font-bold text-success">${formatCurrency(stats.productBreakdown[0]?.totalCommission || 0)}</span> en comisiones.
                  {stats.clientBreakdown[0] && (
                    <> Tu mejor cliente fue <span className="font-medium text-foreground">{stats.clientBreakdown[0].name}</span> con {stats.clientBreakdown[0].invoiceCount} factura{stats.clientBreakdown[0].invoiceCount !== 1 ? 's' : ''}.</>
                  )}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
};
