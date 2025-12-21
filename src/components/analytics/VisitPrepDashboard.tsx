import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { 
  Search, ChevronRight, TrendingUp, TrendingDown, Package, DollarSign, 
  Target, AlertTriangle, Award, Minus, Calendar, Building2, ArrowUpRight, 
  ArrowDownRight, Zap, Eye, ShoppingCart, Scale
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { Invoice } from '@/hooks/useInvoices';
import { Client } from '@/hooks/useClients';
import { Product } from '@/hooks/useProducts';
import { formatNumber, formatCurrency } from '@/lib/formatters';

type PeriodFilter = '1m' | '3m' | '6m' | '1y';

interface VisitPrepDashboardProps {
  invoices: Invoice[];
  clients: Client[];
  products: Product[];
}

interface ProductSalesData {
  productId: string;
  productName: string;
  quantity: number;
  totalAmount: number;
  invoiceCount: number;
  avgPerInvoice: number;
  percentOfClientTotal: number;
  trend: 'up' | 'down' | 'stable';
  trendPercent: number;
  color: string;
}

export function VisitPrepDashboard({ invoices, clients, products }: VisitPrepDashboardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('3m');

  // Filter clients by search
  const filteredClients = useMemo(() => {
    return clients.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [clients, searchTerm]);

  // Get period dates
  const periodDates = useMemo(() => {
    const now = new Date();
    const monthsBack = periodFilter === '1m' ? 1 : periodFilter === '3m' ? 3 : periodFilter === '6m' ? 6 : 12;
    return {
      start: startOfMonth(subMonths(now, monthsBack)),
      end: endOfMonth(now),
      previousStart: startOfMonth(subMonths(now, monthsBack * 2)),
      previousEnd: endOfMonth(subMonths(now, monthsBack + 1)),
    };
  }, [periodFilter]);

  // Get selected client
  const selectedClient = clients.find(c => c.id === selectedClientId);

  // Calculate client-specific product data
  const clientProductData = useMemo(() => {
    if (!selectedClientId) return null;

    // Get invoices for this client in period
    const clientInvoices = invoices.filter(inv => {
      if (inv.client_id !== selectedClientId) return false;
      const invDate = parseISO(inv.invoice_date);
      return isWithinInterval(invDate, { start: periodDates.start, end: periodDates.end });
    });

    // Get previous period invoices for comparison
    const previousInvoices = invoices.filter(inv => {
      if (inv.client_id !== selectedClientId) return false;
      const invDate = parseISO(inv.invoice_date);
      return isWithinInterval(invDate, { start: periodDates.previousStart, end: periodDates.previousEnd });
    });

    // Aggregate products sold
    const productMap = new Map<string, { 
      quantity: number; 
      total: number; 
      invoices: Set<string>;
      color: string;
    }>();

    const previousProductMap = new Map<string, { total: number }>();

    // Current period
    clientInvoices.forEach(inv => {
      inv.products?.forEach(prod => {
        const existing = productMap.get(prod.product_name) || { 
          quantity: 0, 
          total: 0, 
          invoices: new Set(),
          color: products.find(p => p.name === prod.product_name)?.color || '#6366f1'
        };
        existing.quantity += 1; // Each line is 1 unit (or we could parse from amount)
        existing.total += prod.amount;
        existing.invoices.add(inv.id);
        productMap.set(prod.product_name, existing);
      });
    });

    // Previous period
    previousInvoices.forEach(inv => {
      inv.products?.forEach(prod => {
        const existing = previousProductMap.get(prod.product_name) || { total: 0 };
        existing.total += prod.amount;
        previousProductMap.set(prod.product_name, existing);
      });
    });

    const totalClientSales = Array.from(productMap.values()).reduce((sum, p) => sum + p.total, 0);

    // Build product data array including ALL catalog products
    const allProductData: ProductSalesData[] = products.map(catalogProduct => {
      const soldData = productMap.get(catalogProduct.name);
      const prevData = previousProductMap.get(catalogProduct.name);

      const quantity = soldData?.quantity || 0;
      const totalAmount = soldData?.total || 0;
      const invoiceCount = soldData?.invoices.size || 0;
      const avgPerInvoice = invoiceCount > 0 ? totalAmount / invoiceCount : 0;
      const percentOfClientTotal = totalClientSales > 0 ? (totalAmount / totalClientSales) * 100 : 0;

      // Calculate trend
      const prevTotal = prevData?.total || 0;
      let trend: 'up' | 'down' | 'stable' = 'stable';
      let trendPercent = 0;
      if (prevTotal > 0 && totalAmount > 0) {
        trendPercent = ((totalAmount - prevTotal) / prevTotal) * 100;
        trend = trendPercent > 5 ? 'up' : trendPercent < -5 ? 'down' : 'stable';
      } else if (totalAmount > 0 && prevTotal === 0) {
        trend = 'up';
        trendPercent = 100;
      } else if (totalAmount === 0 && prevTotal > 0) {
        trend = 'down';
        trendPercent = -100;
      }

      return {
        productId: catalogProduct.id,
        productName: catalogProduct.name,
        quantity,
        totalAmount,
        invoiceCount,
        avgPerInvoice,
        percentOfClientTotal,
        trend,
        trendPercent,
        color: catalogProduct.color
      };
    });

    // Sort by total amount descending
    allProductData.sort((a, b) => b.totalAmount - a.totalAmount);

    // Identify key products
    const soldProducts = allProductData.filter(p => p.totalAmount > 0);
    const notSoldProducts = allProductData.filter(p => p.totalAmount === 0);
    const topProduct = soldProducts[0] || null;
    const lowestSoldProduct = soldProducts.length > 1 ? soldProducts[soldProducts.length - 1] : null;
    const decliningProducts = soldProducts.filter(p => p.trend === 'down');
    const growingProducts = soldProducts.filter(p => p.trend === 'up');

    // Products to push (not sold or very low)
    const productsToPush = notSoldProducts.slice(0, 3);
    const opportunityProducts = decliningProducts.slice(0, 3);

    // Summary stats
    const totalSales = soldProducts.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalQuantity = soldProducts.reduce((sum, p) => sum + p.quantity, 0);
    const invoicesInPeriod = clientInvoices.length;

    return {
      allProducts: allProductData,
      soldProducts,
      notSoldProducts,
      topProduct,
      lowestSoldProduct,
      decliningProducts,
      growingProducts,
      productsToPush,
      opportunityProducts,
      totalSales,
      totalQuantity,
      invoicesInPeriod,
      periodLabel: periodFilter === '1m' ? 'Último mes' : 
                   periodFilter === '3m' ? 'Últimos 3 meses' : 
                   periodFilter === '6m' ? 'Últimos 6 meses' : 'Último año'
    };
  }, [selectedClientId, invoices, products, periodDates]);

  // Client list with quick stats
  const clientsWithStats = useMemo(() => {
    return filteredClients.map(client => {
      const clientInvoices = invoices.filter(inv => {
        if (inv.client_id !== client.id) return false;
        const invDate = parseISO(inv.invoice_date);
        return isWithinInterval(invDate, { start: periodDates.start, end: periodDates.end });
      });
      const totalSales = clientInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
      const invoiceCount = clientInvoices.length;
      return { ...client, totalSales, invoiceCount };
    }).sort((a, b) => b.totalSales - a.totalSales);
  }, [filteredClients, invoices, periodDates]);

  const renderTrendBadge = (trend: 'up' | 'down' | 'stable', percent: number) => {
    if (trend === 'up') {
      return (
        <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
          <ArrowUpRight className="h-3 w-3" />
          +{percent.toFixed(0)}%
        </span>
      );
    } else if (trend === 'down') {
      return (
        <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 font-medium">
          <ArrowDownRight className="h-3 w-3" />
          {percent.toFixed(0)}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
        <Minus className="h-3 w-3" />
        Estable
      </span>
    );
  };

  if (!selectedClientId) {
    // Client List View
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Preparación de Visitas</h2>
            <p className="text-muted-foreground">Selecciona una farmacia para ver el análisis de productos</p>
          </div>
          <Select value={periodFilter} onValueChange={(v: PeriodFilter) => setPeriodFilter(v)}>
            <SelectTrigger className="w-40">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">Último mes</SelectItem>
              <SelectItem value="3m">Últimos 3 meses</SelectItem>
              <SelectItem value="6m">Últimos 6 meses</SelectItem>
              <SelectItem value="1y">Último año</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar farmacia o cliente..."
            className="pl-10 h-12"
          />
        </div>

        {/* Client Grid */}
        <div className="grid gap-3">
          {clientsWithStats.map(client => (
            <button
              key={client.id}
              onClick={() => setSelectedClientId(client.id)}
              className="w-full p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{client.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {client.invoiceCount} factura{client.invoiceCount !== 1 ? 's' : ''} • ${formatNumber(client.totalSales)}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </button>
          ))}

          {clientsWithStats.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No se encontraron clientes</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Client Detail View - Product Analysis
  return (
    <div className="space-y-6">
      {/* Back Button & Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedClientId(null)} className="shrink-0">
          ← Volver
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">{selectedClient?.name}</h2>
          <p className="text-sm text-muted-foreground">{clientProductData?.periodLabel} • {clientProductData?.invoicesInPeriod} facturas</p>
        </div>
        <Select value={periodFilter} onValueChange={(v: PeriodFilter) => setPeriodFilter(v)}>
          <SelectTrigger className="w-36">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1m">1 mes</SelectItem>
            <SelectItem value="3m">3 meses</SelectItem>
            <SelectItem value="6m">6 meses</SelectItem>
            <SelectItem value="1y">1 año</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Ventas Totales</p>
                <p className="text-xl font-bold">${formatNumber(clientProductData?.totalSales || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Unidades</p>
                <p className="text-xl font-bold">{clientProductData?.totalQuantity || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Productos Vendidos</p>
                <p className="text-xl font-bold">{clientProductData?.soldProducts.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Scale className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Sin Vender</p>
                <p className="text-xl font-bold">{clientProductData?.notSoldProducts.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top & Lowest Products */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Top Product */}
        {clientProductData?.topProduct && (
          <Card className="border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent">
            <CardContent className="pt-5">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Award className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">Producto Más Vendido</p>
                  <p className="font-bold text-lg text-foreground">{clientProductData.topProduct.productName}</p>
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">${formatNumber(clientProductData.topProduct.totalAmount)}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{clientProductData.topProduct.percentOfClientTotal.toFixed(1)}% del total</span>
                  </div>
                </div>
                {renderTrendBadge(clientProductData.topProduct.trend, clientProductData.topProduct.trendPercent)}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lowest Sold Product */}
        {clientProductData?.lowestSoldProduct && (
          <Card className="border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
            <CardContent className="pt-5">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                  <TrendingDown className="h-6 w-6 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-1">Menos Vendido (con ventas)</p>
                  <p className="font-bold text-lg text-foreground">{clientProductData.lowestSoldProduct.productName}</p>
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">${formatNumber(clientProductData.lowestSoldProduct.totalAmount)}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{clientProductData.lowestSoldProduct.percentOfClientTotal.toFixed(1)}% del total</span>
                  </div>
                </div>
                {renderTrendBadge(clientProductData.lowestSoldProduct.trend, clientProductData.lowestSoldProduct.trendPercent)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Product Ranking Chart */}
      {clientProductData && clientProductData.soldProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart className="h-5 w-5 text-primary" />
              Comparativa de Productos (Monto Vendido)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={clientProductData.soldProducts.slice(0, 10)} 
                  layout="vertical"
                  margin={{ left: 20, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    type="number" 
                    tickFormatter={(v) => `$${formatNumber(v)}`}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="productName" 
                    width={120}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tick={{ fill: 'hsl(var(--foreground))' }}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`$${formatNumber(value)}`, 'Ventas']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="totalAmount" radius={[0, 4, 4, 0]}>
                    {clientProductData.soldProducts.slice(0, 10).map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Product Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Todos los Productos del Catálogo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-3 font-medium">Producto</th>
                  <th className="text-right py-3 px-3 font-medium">Cant.</th>
                  <th className="text-right py-3 px-3 font-medium">Total Vendido</th>
                  <th className="text-right py-3 px-3 font-medium">% del Total</th>
                  <th className="text-right py-3 px-3 font-medium">Tendencia</th>
                  <th className="text-left py-3 px-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {clientProductData?.allProducts.map((product) => (
                  <tr key={product.productId} className={`border-b last:border-0 ${product.totalAmount === 0 ? 'bg-rose-500/5' : 'hover:bg-muted/30'}`}>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: product.color }}
                        />
                        <span className="font-medium">{product.productName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {product.quantity > 0 ? product.quantity : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold">
                      {product.totalAmount > 0 ? `$${formatNumber(product.totalAmount)}` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {product.percentOfClientTotal > 0 ? `${product.percentOfClientTotal.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {product.totalAmount > 0 ? renderTrendBadge(product.trend, product.trendPercent) : '-'}
                    </td>
                    <td className="py-3 px-3">
                      {product.totalAmount === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-rose-500/10 text-rose-600">
                          <AlertTriangle className="h-3 w-3" />
                          No vendido
                        </span>
                      ) : product.trend === 'down' ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-600">
                          <TrendingDown className="h-3 w-3" />
                          En declive
                        </span>
                      ) : product.trend === 'up' ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600">
                          <TrendingUp className="h-3 w-3" />
                          Creciendo
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Normal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations Section */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Recomendaciones para la Próxima Visita
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Products to Push */}
          {clientProductData && clientProductData.productsToPush.length > 0 && (
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-5 w-5 text-rose-600" />
                <p className="font-semibold text-rose-700">Productos a Empujar (Sin Ventas)</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {clientProductData.productsToPush.map(p => (
                  <span key={p.productId} className="px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-700 text-sm font-medium">
                    {p.productName}
                  </span>
                ))}
              </div>
              <p className="text-xs text-rose-600/80 mt-2">
                Estos productos no se han vendido en {clientProductData.periodLabel.toLowerCase()}. Oportunidad de introducción.
              </p>
            </div>
          )}

          {/* Declining Products */}
          {clientProductData && clientProductData.opportunityProducts.length > 0 && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <p className="font-semibold text-amber-700">Productos en Declive</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {clientProductData.opportunityProducts.map(p => (
                  <span key={p.productId} className="px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-700 text-sm font-medium">
                    {p.productName} ({p.trendPercent.toFixed(0)}%)
                  </span>
                ))}
              </div>
              <p className="text-xs text-amber-600/80 mt-2">
                Estos productos han bajado vs el período anterior. Considerar promoción o preguntar al cliente.
              </p>
            </div>
          )}

          {/* Growing Products */}
          {clientProductData && clientProductData.growingProducts.length > 0 && (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <p className="font-semibold text-emerald-700">Productos en Crecimiento</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {clientProductData.growingProducts.slice(0, 5).map(p => (
                  <span key={p.productId} className="px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-700 text-sm font-medium">
                    {p.productName} (+{p.trendPercent.toFixed(0)}%)
                  </span>
                ))}
              </div>
              <p className="text-xs text-emerald-600/80 mt-2">
                Estos productos van en aumento. Mantener disponibilidad y considerar upselling.
              </p>
            </div>
          )}

          {/* No data message */}
          {clientProductData && clientProductData.soldProducts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay ventas registradas para este cliente en el período seleccionado.</p>
              <p className="text-sm mt-1">Prueba con un período más amplio o verifica las facturas.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
