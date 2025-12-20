import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, FileText, Package, Calendar, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CheckCircle2, Target } from 'lucide-react';
import { format, parseISO, subMonths, startOfMonth, endOfMonth, isWithinInterval, subQuarters, subYears } from 'date-fns';
import { es } from 'date-fns/locale';
import { Invoice } from '@/hooks/useInvoices';
import { Client } from '@/hooks/useClients';
import { formatNumber } from '@/lib/formatters';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

interface ClientDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  invoices: Invoice[];
}

type PeriodFilter = '1m' | '3m' | '6m' | '1y' | 'all';

export function ClientDetailView({ open, onOpenChange, client, invoices }: ClientDetailViewProps) {
  const [period, setPeriod] = useState<PeriodFilter>('6m');

  const filteredInvoices = useMemo(() => {
    const clientInvoices = invoices.filter(inv => inv.client_id === client.id);
    
    if (period === 'all') return clientInvoices;
    
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case '1m':
        startDate = subMonths(now, 1);
        break;
      case '3m':
        startDate = subQuarters(now, 1);
        break;
      case '6m':
        startDate = subMonths(now, 6);
        break;
      case '1y':
        startDate = subYears(now, 1);
        break;
      default:
        startDate = subMonths(now, 6);
    }
    
    return clientInvoices.filter(inv => {
      const date = parseISO(inv.invoice_date);
      return date >= startDate;
    });
  }, [invoices, client.id, period]);

  const analytics = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const previousMonthStart = startOfMonth(subMonths(now, 1));
    const previousMonthEnd = endOfMonth(subMonths(now, 1));
    const threeMonthsAgo = subMonths(now, 3);
    const sixMonthsAgo = subMonths(now, 6);
    const oneYearAgo = subYears(now, 1);

    // Basic totals
    const totalSales = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
    const totalCommission = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0);
    const invoiceCount = filteredInvoices.length;
    const avgTicket = invoiceCount > 0 ? totalSales / invoiceCount : 0;

    // Growth calculations for different periods
    const getGrowthForPeriod = (currentStart: Date, currentEnd: Date, prevStart: Date, prevEnd: Date) => {
      const currentInvoices = filteredInvoices.filter(inv => {
        const date = parseISO(inv.invoice_date);
        return isWithinInterval(date, { start: currentStart, end: currentEnd });
      });
      const prevInvoices = filteredInvoices.filter(inv => {
        const date = parseISO(inv.invoice_date);
        return isWithinInterval(date, { start: prevStart, end: prevEnd });
      });
      
      const currentTotal = currentInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
      const prevTotal = prevInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
      
      return {
        current: currentTotal,
        previous: prevTotal,
        growth: prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : (currentTotal > 0 ? 100 : 0)
      };
    };

    const monthlyGrowth = getGrowthForPeriod(currentMonthStart, currentMonthEnd, previousMonthStart, previousMonthEnd);
    
    const quarterlyGrowth = getGrowthForPeriod(
      subQuarters(now, 0),
      now,
      subQuarters(now, 1),
      subQuarters(now, 0)
    );
    
    const semesterGrowth = getGrowthForPeriod(
      sixMonthsAgo,
      now,
      subMonths(now, 12),
      sixMonthsAgo
    );

    // Monthly trend data
    const monthsMap = new Map<string, { month: string; label: string; sales: number; commission: number; invoices: number }>();
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthKey = format(monthDate, 'yyyy-MM');
      const label = format(monthDate, 'MMM', { locale: es });
      monthsMap.set(monthKey, { month: monthKey, label, sales: 0, commission: 0, invoices: 0 });
    }
    
    filteredInvoices.forEach(inv => {
      const monthKey = format(parseISO(inv.invoice_date), 'yyyy-MM');
      const existing = monthsMap.get(monthKey);
      if (existing) {
        existing.sales += Number(inv.total_amount);
        existing.commission += Number(inv.total_commission);
        existing.invoices += 1;
      }
    });
    
    const monthlyTrend = Array.from(monthsMap.values());

    // Product breakdown
    const productMap = new Map<string, { name: string; sales: number; commission: number; count: number }>();
    
    filteredInvoices.forEach(inv => {
      inv.products?.forEach(p => {
        if (p.amount > 0) {
          const existing = productMap.get(p.product_name) || { name: p.product_name, sales: 0, commission: 0, count: 0 };
          existing.sales += Number(p.amount);
          existing.commission += Number(p.commission);
          existing.count += 1;
          productMap.set(p.product_name, existing);
        }
      });
      
      if (inv.rest_amount > 0) {
        const existing = productMap.get('Resto General') || { name: 'Resto General', sales: 0, commission: 0, count: 0 };
        existing.sales += Number(inv.rest_amount);
        existing.commission += Number(inv.rest_commission);
        existing.count += 1;
        productMap.set('Resto General', existing);
      }
    });
    
    const productBreakdown = Array.from(productMap.values()).sort((a, b) => b.sales - a.sales);

    // Status determination
    let status: 'growing' | 'stable' | 'declining' | 'inactive';
    let statusMessage: string;
    
    if (monthlyGrowth.current === 0 && monthlyGrowth.previous === 0) {
      status = 'inactive';
      statusMessage = 'Este cliente no ha comprado en los últimos 2 meses';
    } else if (monthlyGrowth.growth > 10) {
      status = 'growing';
      statusMessage = 'Cliente en crecimiento. Mantener atención prioritaria.';
    } else if (monthlyGrowth.growth < -10) {
      status = 'declining';
      statusMessage = 'Cliente en riesgo. Requiere seguimiento urgente.';
    } else {
      status = 'stable';
      statusMessage = 'Cliente estable. Mantener relación actual.';
    }

    // Recent invoices
    const recentInvoices = [...filteredInvoices]
      .sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime())
      .slice(0, 10);

    return {
      totalSales,
      totalCommission,
      invoiceCount,
      avgTicket,
      monthlyGrowth,
      quarterlyGrowth,
      semesterGrowth,
      monthlyTrend,
      productBreakdown,
      status,
      statusMessage,
      recentInvoices
    };
  }, [filteredInvoices]);

  const renderGrowthBadge = (growth: number, size: 'sm' | 'lg' = 'sm') => {
    const sizeClass = size === 'lg' ? 'text-base px-3 py-1.5' : 'text-xs px-2 py-1';
    if (growth > 0) {
      return (
        <span className={`inline-flex items-center gap-1 ${sizeClass} rounded-full bg-emerald-500/10 text-emerald-600 font-semibold`}>
          <ArrowUpRight className="h-3.5 w-3.5" />
          +{growth.toFixed(1)}%
        </span>
      );
    } else if (growth < 0) {
      return (
        <span className={`inline-flex items-center gap-1 ${sizeClass} rounded-full bg-rose-500/10 text-rose-600 font-semibold`}>
          <ArrowDownRight className="h-3.5 w-3.5" />
          {growth.toFixed(1)}%
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClass} rounded-full bg-muted text-muted-foreground font-medium`}>
        <Minus className="h-3 w-3" />
        0%
      </span>
    );
  };

  const StatusIcon = analytics.status === 'growing' ? TrendingUp : 
                     analytics.status === 'declining' ? TrendingDown :
                     analytics.status === 'inactive' ? AlertTriangle : CheckCircle2;
  
  const statusColor = analytics.status === 'growing' ? 'text-emerald-600 bg-emerald-500/10' :
                      analytics.status === 'declining' ? 'text-rose-600 bg-rose-500/10' :
                      analytics.status === 'inactive' ? 'text-amber-600 bg-amber-500/10' : 'text-blue-600 bg-blue-500/10';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-5 border-b border-border">
          <DialogHeader className="p-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <DialogTitle className="text-xl font-bold">{client.name}</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {client.phone && `Tel: ${client.phone}`}
                    {client.email && ` · ${client.email}`}
                  </p>
                </div>
              </div>
              <Select value={period} onValueChange={(v: PeriodFilter) => setPeriod(v)}>
                <SelectTrigger className="w-36">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m">Último mes</SelectItem>
                  <SelectItem value="3m">Último trimestre</SelectItem>
                  <SelectItem value="6m">Últimos 6 meses</SelectItem>
                  <SelectItem value="1y">Último año</SelectItem>
                  <SelectItem value="all">Todo el historial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Banner */}
          <div className={`flex items-center gap-3 p-4 rounded-xl ${statusColor}`}>
            <StatusIcon className="h-6 w-6" />
            <div className="flex-1">
              <p className="font-semibold">
                {analytics.status === 'growing' && 'Cliente en Crecimiento'}
                {analytics.status === 'declining' && 'Cliente en Riesgo'}
                {analytics.status === 'inactive' && 'Cliente Inactivo'}
                {analytics.status === 'stable' && 'Cliente Estable'}
              </p>
              <p className="text-sm opacity-80">{analytics.statusMessage}</p>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Total Ventas</p>
                    <p className="text-xl font-bold">${formatNumber(analytics.totalSales)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Comisión</p>
                    <p className="text-xl font-bold text-emerald-600">${formatNumber(analytics.totalCommission)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Facturas</p>
                    <p className="text-xl font-bold">{analytics.invoiceCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                    <Target className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Promedio</p>
                    <p className="text-xl font-bold">${formatNumber(analytics.avgTicket)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Growth Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Comparativa de Crecimiento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center p-4 rounded-xl bg-muted/30">
                  <p className="text-sm text-muted-foreground mb-2">Mensual</p>
                  {renderGrowthBadge(analytics.monthlyGrowth.growth, 'lg')}
                  <div className="mt-2 text-xs text-muted-foreground">
                    <p>Este mes: ${formatNumber(analytics.monthlyGrowth.current)}</p>
                    <p>Anterior: ${formatNumber(analytics.monthlyGrowth.previous)}</p>
                  </div>
                </div>
                
                <div className="text-center p-4 rounded-xl bg-muted/30">
                  <p className="text-sm text-muted-foreground mb-2">Trimestral</p>
                  {renderGrowthBadge(analytics.quarterlyGrowth.growth, 'lg')}
                  <div className="mt-2 text-xs text-muted-foreground">
                    <p>Este trim: ${formatNumber(analytics.quarterlyGrowth.current)}</p>
                    <p>Anterior: ${formatNumber(analytics.quarterlyGrowth.previous)}</p>
                  </div>
                </div>
                
                <div className="text-center p-4 rounded-xl bg-muted/30">
                  <p className="text-sm text-muted-foreground mb-2">Semestral</p>
                  {renderGrowthBadge(analytics.semesterGrowth.growth, 'lg')}
                  <div className="mt-2 text-xs text-muted-foreground">
                    <p>6 meses: ${formatNumber(analytics.semesterGrowth.current)}</p>
                    <p>Prev 6m: ${formatNumber(analytics.semesterGrowth.previous)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for detailed views */}
          <Tabs defaultValue="trend" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="trend">Evolución</TabsTrigger>
              <TabsTrigger value="products">Productos</TabsTrigger>
              <TabsTrigger value="invoices">Facturas</TabsTrigger>
            </TabsList>

            <TabsContent value="trend">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Evolución de Ventas (12 meses)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.monthlyTrend}>
                        <defs>
                          <linearGradient id="clientSalesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                          formatter={(value: number) => [`$${formatNumber(value)}`, 'Ventas']}
                        />
                        <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" fill="url(#clientSalesGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products">
              <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Distribución por Producto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.productBreakdown.slice(0, 5)}
                            dataKey="sales"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                          >
                            {analytics.productBreakdown.slice(0, 5).map((_, idx) => (
                              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => [`$${formatNumber(value)}`, 'Ventas']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Desglose de Productos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-[200px] overflow-y-auto">
                      {analytics.productBreakdown.map((product, idx) => (
                        <div key={product.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                            <span className="font-medium text-sm">{product.name}</span>
                          </div>
                          <div className="text-right text-sm">
                            <p className="font-bold">${formatNumber(product.sales)}</p>
                            <p className="text-xs text-muted-foreground">{product.count} facturas</p>
                          </div>
                        </div>
                      ))}
                      {analytics.productBreakdown.length === 0 && (
                        <p className="text-center text-muted-foreground py-4">No hay datos de productos</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="invoices">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Últimas Facturas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">NCF</th>
                          <th className="text-left py-2 px-3 font-medium">Fecha</th>
                          <th className="text-right py-2 px-3 font-medium">Monto</th>
                          <th className="text-right py-2 px-3 font-medium">Comisión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.recentInvoices.map(inv => (
                          <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-3 px-3 font-mono text-xs">{inv.ncf}</td>
                            <td className="py-3 px-3">
                              {format(parseISO(inv.invoice_date), "d MMM yyyy", { locale: es })}
                            </td>
                            <td className="py-3 px-3 text-right font-medium">${formatNumber(Number(inv.total_amount))}</td>
                            <td className="py-3 px-3 text-right text-emerald-600">${formatNumber(Number(inv.total_commission))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {analytics.recentInvoices.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">No hay facturas en este periodo</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
