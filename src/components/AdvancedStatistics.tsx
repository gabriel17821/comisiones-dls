import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, TrendingDown, DollarSign, Receipt, ChevronLeft, ChevronRight, 
  FileText, Users, Package, ArrowUpRight, ArrowDownRight, Crown, ShoppingBag,
  BarChart3, Building2, UserCircle, Eye, ChevronDown, ChevronUp
} from 'lucide-react';
import { Invoice } from '@/hooks/useInvoices';
import { Client } from '@/hooks/useClients';
import { formatCurrency, formatNumber, parseDateSafe } from '@/lib/formatters';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, addMonths, isSameMonth, getDaysInMonth, getDate } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateMonthlyPDF } from '@/lib/pdfGenerator';
import { toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AdvancedStatisticsProps {
  invoices: Invoice[];
  sellerName?: string;
  clients?: Client[];
}

interface ProductSummary {
  name: string;
  totalAmount: number;
  totalCommission: number;
  dlsCommission: number;
  sellerCommission: number;
  percentage: number;
  invoiceCount: number;
}

interface ClientSummary {
  id: string;
  name: string;
  invoiceCount: number;
  totalAmount: number;
  totalCommission: number;
  products: Record<string, number>;
}

export const AdvancedStatistics = ({ invoices, sellerName, clients = [] }: AdvancedStatisticsProps) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const displayName = sellerName || 'NEFTALÍ';

  // DLS commission rate (configurable)
  const DLS_COMMISSION_RATE = 0.75; // 75% goes to DLS
  const SELLER_COMMISSION_RATE = 0.25; // 25% goes to seller

  const stats = useMemo(() => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    
    const monthInvoices = invoices.filter(inv => {
      const date = parseDateSafe(inv.invoice_date || inv.created_at);
      return isWithinInterval(date, { start, end });
    });

    // Products breakdown with DLS/Seller split
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
            dlsCommission: 0,
            sellerCommission: 0,
            percentage: product.percentage,
            invoiceCount: 0,
          };
        }
        productMap[key].totalAmount += Number(product.amount);
        productMap[key].totalCommission += Number(product.commission);
        productMap[key].dlsCommission += Number(product.commission) * DLS_COMMISSION_RATE;
        productMap[key].sellerCommission += Number(product.commission) * SELLER_COMMISSION_RATE;
        productMap[key].invoiceCount += 1;
      });
      restTotal += Number(inv.rest_amount);
      restCommission += Number(inv.rest_commission);
    });

    if (restTotal > 0) {
      productMap['Resto'] = {
        name: 'Resto',
        totalAmount: restTotal,
        totalCommission: restCommission,
        dlsCommission: restCommission * DLS_COMMISSION_RATE,
        sellerCommission: restCommission * SELLER_COMMISSION_RATE,
        percentage: 25,
        invoiceCount: monthInvoices.length,
      };
    }

    const productBreakdown = Object.values(productMap).sort((a, b) => b.totalCommission - a.totalCommission);

    // Client breakdown with product details
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
          products: {},
        };
      }
      clientMap[clientId].invoiceCount += 1;
      clientMap[clientId].totalAmount += Number(inv.total_amount);
      clientMap[clientId].totalCommission += Number(inv.total_commission);

      // Track products per client
      inv.products?.forEach(product => {
        if (!clientMap[clientId].products[product.product_name]) {
          clientMap[clientId].products[product.product_name] = 0;
        }
        clientMap[clientId].products[product.product_name] += Number(product.amount);
      });
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

    const bestDay = dailyData.reduce((best, current) => 
      current.comision > best.comision ? current : best
    , dailyData[0]);

    const totalCommission = monthInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0);

    return {
      totalSales: monthInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
      totalCommission,
      dlsCommission: totalCommission * DLS_COMMISSION_RATE,
      sellerCommission: totalCommission * SELLER_COMMISSION_RATE,
      invoiceCount: monthInvoices.length,
      invoices: monthInvoices,
      avgPerInvoice: monthInvoices.length > 0 ? totalCommission / monthInvoices.length : 0,
      productBreakdown,
      clientBreakdown,
      dailyData,
      bestDay,
      uniqueClients: new Set(monthInvoices.map(inv => (inv as any).client_id).filter(Boolean)).size,
      topClient: clientBreakdown[0] || null,
      topBuyer: clientBreakdown.sort((a, b) => b.totalAmount - a.totalAmount)[0] || null,
    };
  }, [invoices, selectedDate, DLS_COMMISSION_RATE, SELLER_COMMISSION_RATE]);

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
      uniqueClients: new Set(monthInvoices.map(inv => (inv as any).client_id).filter(Boolean)).size,
    };
  }, [invoices, selectedDate]);

  const getChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const commissionChange = getChange(stats.totalCommission, prevStats.totalCommission);
  const salesChange = getChange(stats.totalSales, prevStats.totalSales);
  const invoiceChange = getChange(stats.invoiceCount, prevStats.invoiceCount);
  const clientChange = getChange(stats.uniqueClients, prevStats.uniqueClients);

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

  const ChangeIndicator = ({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) => {
    const isPositive = value >= 0;
    const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
    const sizeClasses = size === 'lg' ? 'text-sm px-2.5 py-1' : 'text-xs px-2 py-0.5';
    
    if (value === 0) return null;
    
    return (
      <span className={`inline-flex items-center gap-0.5 rounded-full font-medium ${sizeClasses} ${
        isPositive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
      }`}>
        <Icon className={size === 'lg' ? 'h-4 w-4' : 'h-3 w-3'} />
        {Math.abs(value).toFixed(0)}%
      </span>
    );
  };

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
            <Button variant="ghost" size="icon" onClick={() => navigateMonth('prev')} className="h-9 w-9 rounded-xl">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-[200px] text-center">
              <h2 className="text-2xl font-bold text-foreground">{capitalizedMonth}</h2>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigateMonth('next')} 
              disabled={isSameMonth(selectedDate, new Date())} 
              className="h-9 w-9 rounded-xl"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} className="gap-2 rounded-xl">
            <FileText className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>

        {/* Main KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Commission Card - Hero */}
          <Card className="p-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white col-span-2 lg:col-span-1">
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5" />
              </div>
              <ChangeIndicator value={commissionChange} size="lg" />
            </div>
            <p className="text-sm font-medium text-white/80 mb-1">Comisión Total</p>
            <p className="text-3xl font-black">${formatCurrency(stats.totalCommission)}</p>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/20 text-xs">
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" /> DLS: ${formatCurrency(stats.dlsCommission)}
              </span>
              <span className="flex items-center gap-1">
                <UserCircle className="h-3.5 w-3.5" /> {displayName}: ${formatCurrency(stats.sellerCommission)}
              </span>
            </div>
          </Card>

          {/* Sales */}
          <Card className="p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
              <ChangeIndicator value={salesChange} />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Ventas</p>
            <p className="text-2xl font-black text-foreground">${formatNumber(stats.totalSales)}</p>
          </Card>

          {/* Invoices */}
          <Card className="p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-purple-500" />
              </div>
              <ChangeIndicator value={invoiceChange} />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Facturas</p>
            <p className="text-2xl font-black text-foreground">{stats.invoiceCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Prom: ${formatCurrency(stats.avgPerInvoice)}</p>
          </Card>

          {/* Clients */}
          <Card className="p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-amber-500" />
              </div>
              <ChangeIndicator value={clientChange} />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Clientes</p>
            <p className="text-2xl font-black text-foreground">{stats.uniqueClients}</p>
            <p className="text-xs text-muted-foreground mt-1">activos este mes</p>
          </Card>
        </div>

        {/* Top Performers Row */}
        {stats.invoiceCount > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Client by Commission */}
            {stats.topClient && (
              <Card className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200/50 dark:border-amber-800/50">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <Crown className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Mejor Rendimiento</p>
                    <p className="font-bold text-lg text-foreground">{stats.topClient.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm">
                      <span className="text-muted-foreground">{stats.topClient.invoiceCount} facturas</span>
                      <span className="font-semibold text-success">${formatCurrency(stats.topClient.totalCommission)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Top Buyer */}
            {stats.topBuyer && (
              <Card className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200/50 dark:border-blue-800/50">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <ShoppingBag className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Mayor Comprador</p>
                    <p className="font-bold text-lg text-foreground">{stats.topBuyer.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm">
                      <span className="text-muted-foreground">{stats.topBuyer.invoiceCount} facturas</span>
                      <span className="font-semibold text-foreground">${formatNumber(stats.topBuyer.totalAmount)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Performance Chart */}
        {stats.invoiceCount > 0 && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-lg text-foreground">Rendimiento Diario</h3>
                <p className="text-sm text-muted-foreground">Comisiones generadas día a día</p>
              </div>
              {stats.bestDay && stats.bestDay.comision > 0 && (
                <div className="text-right px-4 py-2 rounded-xl bg-success/10">
                  <p className="text-xs text-success font-medium">Mejor día</p>
                  <p className="font-bold text-success">{stats.bestDay.day} de {format(selectedDate, 'MMM', { locale: es })} • ${formatCurrency(stats.bestDay.comision)}</p>
                </div>
              )}
            </div>
            
            <div className="h-56">
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
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
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
                    strokeWidth={2.5}
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
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">Productos</h3>
                    <p className="text-xs text-muted-foreground">{stats.productBreakdown.length} productos vendidos</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowProductDetail(true)} className="gap-1.5 rounded-xl">
                  <Eye className="h-4 w-4" />
                  Ver Detalle
                </Button>
              </div>
              <div className="space-y-4">
                {stats.productBreakdown.slice(0, 5).map((product, index) => {
                  const percentage = totalProductCommission > 0 ? (product.totalCommission / totalProductCommission) * 100 : 0;
                  const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500'];
                  return (
                    <div key={product.name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${colors[index]}`} />
                          <span className="text-sm font-medium text-foreground">{product.name}</span>
                          <span className="text-xs text-muted-foreground">({product.percentage}%)</span>
                        </div>
                        <span className="text-sm font-bold text-success">${formatCurrency(product.totalCommission)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
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

            {/* Top Clients with expandable details */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Top Clientes</h3>
                  <p className="text-xs text-muted-foreground">Mejores clientes del mes</p>
                </div>
              </div>
              <div className="space-y-2">
                {stats.clientBreakdown.slice(0, 5).map((client, index) => {
                  const isExpanded = expandedClient === client.id;
                  return (
                    <div key={client.id}>
                      <button 
                        onClick={() => setExpandedClient(isExpanded ? null : client.id)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {index + 1}
                          </span>
                          <div className="text-left">
                            <p className="font-medium text-foreground text-sm">{client.name}</p>
                            <p className="text-xs text-muted-foreground">{client.invoiceCount} factura{client.invoiceCount !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-bold text-success text-sm">${formatCurrency(client.totalCommission)}</p>
                            <p className="text-xs text-muted-foreground">${formatNumber(client.totalAmount)}</p>
                          </div>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>
                      
                      {/* Expanded product details */}
                      {isExpanded && Object.keys(client.products).length > 0 && (
                        <div className="ml-11 mt-2 p-3 rounded-lg bg-muted/20 border border-border/50 animate-in slide-in-from-top-2">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Productos comprados:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(client.products).map(([name, amount]) => (
                              <div key={name} className="flex items-center justify-between text-xs">
                                <span className="text-foreground">{name}</span>
                                <span className="font-medium">${formatNumber(amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {stats.clientBreakdown.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay clientes este mes</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* DLS vs Seller Comparison */}
        {stats.invoiceCount > 0 && (
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Distribución de Comisiones</h3>
                <p className="text-xs text-muted-foreground">DLS vs {displayName}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              {/* DLS */}
              <div className="text-center p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-500/20">
                  <Building2 className="h-7 w-7 text-white" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">DLS</p>
                <p className="text-3xl font-black text-foreground">${formatCurrency(stats.dlsCommission)}</p>
                <p className="text-xs text-muted-foreground mt-1">75% del total</p>
              </div>
              
              {/* Seller */}
              <div className="text-center p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/20">
                  <UserCircle className="h-7 w-7 text-white" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{displayName}</p>
                <p className="text-3xl font-black text-foreground">${formatCurrency(stats.sellerCommission)}</p>
                <p className="text-xs text-muted-foreground mt-1">25% del total</p>
              </div>
            </div>
          </Card>
        )}

        {/* Product Detail Dialog */}
        <Dialog open={showProductDetail} onOpenChange={setShowProductDetail}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Detalle de Productos - {capitalizedMonth}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              {stats.productBreakdown.map((product) => (
                <div key={product.name} className="p-4 rounded-xl border border-border bg-muted/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.percentage}% comisión</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">${formatNumber(product.totalAmount)}</p>
                      <p className="text-xs text-muted-foreground">vendido</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
                    <div className="text-center p-2 rounded-lg bg-background">
                      <p className="text-xs text-muted-foreground">Total Comisión</p>
                      <p className="font-bold text-success">${formatCurrency(product.totalCommission)}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-background">
                      <p className="text-xs text-muted-foreground">DLS (75%)</p>
                      <p className="font-bold text-blue-600">${formatCurrency(product.dlsCommission)}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-background">
                      <p className="text-xs text-muted-foreground">{displayName} (25%)</p>
                      <p className="font-bold text-emerald-600">${formatCurrency(product.sellerCommission)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};
