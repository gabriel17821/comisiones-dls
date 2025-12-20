import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, FileText, Package, Calendar, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CheckCircle2, Target, Download, Receipt, ShoppingCart, Percent, Info, XCircle, Sparkles, Activity, BarChart3, Zap, Clock, Award, Users } from 'lucide-react';
import { format, parseISO, subMonths, startOfMonth, endOfMonth, isWithinInterval, subQuarters, subYears, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Invoice } from '@/hooks/useInvoices';
import { Client } from '@/hooks/useClients';
import { formatNumber } from '@/lib/formatters';
import { ClientPDFGenerator } from './ClientPDFGenerator';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', '#10b981', '#f59e0b', '#ef4444'];

interface ClientDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  invoices: Invoice[];
}

type PeriodFilter = '1m' | '3m' | '6m' | '1y' | 'all';

interface ProductAnalysis {
  name: string;
  totalSales: number;
  totalCommission: number;
  totalQuantity: number;
  invoiceCount: number;
  avgPerInvoice: number;
  lastMonthSales: number;
  prevMonthSales: number;
  growth: number;
  percentOfTotal: number;
  lastPurchaseDate: string | null;
  isGrowing: boolean;
  isDeclining: boolean;
  isStopped: boolean;
  recommendation: string;
}

export function ClientDetailView({ open, onOpenChange, client, invoices }: ClientDetailViewProps) {
  const [period, setPeriod] = useState<PeriodFilter>('6m');
  const [showPDFDialog, setShowPDFDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Filter invoices for this client within the selected period
  const filteredInvoices = useMemo(() => {
    const clientInvoices = invoices.filter(inv => inv.client_id === client.id);
    
    if (period === 'all') return clientInvoices;
    
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case '1m': startDate = subMonths(now, 1); break;
      case '3m': startDate = subQuarters(now, 1); break;
      case '6m': startDate = subMonths(now, 6); break;
      case '1y': startDate = subYears(now, 1); break;
      default: startDate = subMonths(now, 6);
    }
    
    return clientInvoices.filter(inv => {
      const date = parseISO(inv.invoice_date);
      return date >= startDate;
    });
  }, [invoices, client.id, period]);

  // Comprehensive analytics calculation
  const analytics = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const previousMonthStart = startOfMonth(subMonths(now, 1));
    const previousMonthEnd = endOfMonth(subMonths(now, 1));
    const twoMonthsAgoStart = startOfMonth(subMonths(now, 2));
    const twoMonthsAgoEnd = endOfMonth(subMonths(now, 2));
    const sixMonthsAgo = subMonths(now, 6);
    const threeMonthsAgo = subMonths(now, 3);

    // Basic totals
    const totalSales = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
    const totalCommission = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0);
    const invoiceCount = filteredInvoices.length;
    const avgTicket = invoiceCount > 0 ? totalSales / invoiceCount : 0;

    // Calculate purchase frequency
    const sortedInvoices = [...filteredInvoices].sort((a, b) => 
      new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime()
    );
    
    let avgDaysBetweenPurchases = 0;
    if (sortedInvoices.length >= 2) {
      let totalDays = 0;
      for (let i = 1; i < sortedInvoices.length; i++) {
        totalDays += differenceInDays(
          parseISO(sortedInvoices[i].invoice_date),
          parseISO(sortedInvoices[i - 1].invoice_date)
        );
      }
      avgDaysBetweenPurchases = Math.round(totalDays / (sortedInvoices.length - 1));
    }

    // Last purchase info
    const lastInvoice = sortedInvoices.length > 0 ? sortedInvoices[sortedInvoices.length - 1] : null;
    const daysSinceLastPurchase = lastInvoice 
      ? differenceInDays(now, parseISO(lastInvoice.invoice_date)) 
      : null;

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
      const currentCommission = currentInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0);
      const prevCommission = prevInvoices.reduce((sum, inv) => sum + Number(inv.total_commission), 0);
      
      return {
        currentSales: currentTotal,
        previousSales: prevTotal,
        currentCommission,
        prevCommission,
        salesGrowth: prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : (currentTotal > 0 ? 100 : 0),
        commissionGrowth: prevCommission > 0 ? ((currentCommission - prevCommission) / prevCommission) * 100 : (currentCommission > 0 ? 100 : 0),
        invoiceCount: currentInvoices.length,
        prevInvoiceCount: prevInvoices.length
      };
    };

    const monthlyGrowth = getGrowthForPeriod(currentMonthStart, currentMonthEnd, previousMonthStart, previousMonthEnd);
    const quarterlyGrowth = getGrowthForPeriod(subMonths(now, 3), now, subMonths(now, 6), subMonths(now, 3));
    const semesterGrowth = getGrowthForPeriod(sixMonthsAgo, now, subMonths(now, 12), sixMonthsAgo);

    // Monthly trend data (12 months)
    const monthsMap = new Map<string, { month: string; label: string; sales: number; commission: number; invoices: number }>();
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthKey = format(monthDate, 'yyyy-MM');
      const label = format(monthDate, 'MMM', { locale: es });
      monthsMap.set(monthKey, { month: monthKey, label, sales: 0, commission: 0, invoices: 0 });
    }
    
    // Use ALL client invoices for the trend (not just filtered)
    const allClientInvoices = invoices.filter(inv => inv.client_id === client.id);
    allClientInvoices.forEach(inv => {
      const monthKey = format(parseISO(inv.invoice_date), 'yyyy-MM');
      const existing = monthsMap.get(monthKey);
      if (existing) {
        existing.sales += Number(inv.total_amount);
        existing.commission += Number(inv.total_commission);
        existing.invoices += 1;
      }
    });
    
    const monthlyTrend = Array.from(monthsMap.values());

    // DETAILED PRODUCT ANALYSIS
    const productMap = new Map<string, ProductAnalysis>();
    
    filteredInvoices.forEach(inv => {
      const invDate = parseISO(inv.invoice_date);
      const isCurrentMonth = isWithinInterval(invDate, { start: currentMonthStart, end: currentMonthEnd });
      const isPrevMonth = isWithinInterval(invDate, { start: previousMonthStart, end: previousMonthEnd });
      
      inv.products?.forEach(p => {
        if (p.amount > 0) {
          const existing = productMap.get(p.product_name) || {
            name: p.product_name,
            totalSales: 0,
            totalCommission: 0,
            totalQuantity: 0,
            invoiceCount: 0,
            avgPerInvoice: 0,
            lastMonthSales: 0,
            prevMonthSales: 0,
            growth: 0,
            percentOfTotal: 0,
            lastPurchaseDate: null as string | null,
            isGrowing: false,
            isDeclining: false,
            isStopped: false,
            recommendation: ''
          };
          
          existing.totalSales += Number(p.amount);
          existing.totalCommission += Number(p.commission);
          existing.totalQuantity += 1; // Each line counts as 1 purchase occurrence
          existing.invoiceCount += 1;
          if (isCurrentMonth) existing.lastMonthSales += Number(p.amount);
          if (isPrevMonth) existing.prevMonthSales += Number(p.amount);
          
          // Track last purchase date
          if (!existing.lastPurchaseDate || invDate > parseISO(existing.lastPurchaseDate)) {
            existing.lastPurchaseDate = inv.invoice_date;
          }
          
          productMap.set(p.product_name, existing);
        }
      });
      
      // Include rest amount
      if (inv.rest_amount > 0) {
        const existing = productMap.get('Resto General') || {
          name: 'Resto General',
          totalSales: 0,
          totalCommission: 0,
          totalQuantity: 0,
          invoiceCount: 0,
          avgPerInvoice: 0,
          lastMonthSales: 0,
          prevMonthSales: 0,
          growth: 0,
          percentOfTotal: 0,
          lastPurchaseDate: null,
          isGrowing: false,
          isDeclining: false,
          isStopped: false,
          recommendation: ''
        };
        
        existing.totalSales += Number(inv.rest_amount);
        existing.totalCommission += Number(inv.rest_commission);
        existing.totalQuantity += 1;
        existing.invoiceCount += 1;
        if (isCurrentMonth) existing.lastMonthSales += Number(inv.rest_amount);
        if (isPrevMonth) existing.prevMonthSales += Number(inv.rest_amount);
        if (!existing.lastPurchaseDate || invDate > parseISO(existing.lastPurchaseDate)) {
          existing.lastPurchaseDate = inv.invoice_date;
        }
        
        productMap.set('Resto General', existing);
      }
    });
    
    // Calculate product analytics and recommendations
    const productAnalysis: ProductAnalysis[] = Array.from(productMap.values())
      .map(p => {
        const growth = p.prevMonthSales > 0 
          ? ((p.lastMonthSales - p.prevMonthSales) / p.prevMonthSales) * 100 
          : (p.lastMonthSales > 0 ? 100 : -100);
        
        const isGrowing = growth > 15;
        const isDeclining = growth < -15;
        const isStopped = p.lastMonthSales === 0 && p.prevMonthSales > 0;
        
        let recommendation = '';
        if (isStopped) {
          recommendation = '⚠️ Dejó de comprar este producto. Verificar disponibilidad o competencia.';
        } else if (isDeclining) {
          recommendation = '📉 Ventas en declive. Considerar promoción o revisar precio.';
        } else if (isGrowing) {
          recommendation = '📈 Excelente crecimiento. Mantener stock y considerar upselling.';
        } else if (p.lastMonthSales > 0) {
          recommendation = '✅ Ventas estables. Mantener seguimiento regular.';
        } else {
          recommendation = '💡 Sin actividad reciente. Recordar producto al cliente.';
        }
        
        return {
          ...p,
          avgPerInvoice: p.invoiceCount > 0 ? p.totalSales / p.invoiceCount : 0,
          growth,
          percentOfTotal: totalSales > 0 ? (p.totalSales / totalSales) * 100 : 0,
          isGrowing,
          isDeclining,
          isStopped,
          recommendation
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);

    // Categorize products
    const topProducts = productAnalysis.slice(0, 5);
    const growingProducts = productAnalysis.filter(p => p.isGrowing);
    const decliningProducts = productAnalysis.filter(p => p.isDeclining);
    const stoppedProducts = productAnalysis.filter(p => p.isStopped);
    
    // Critical alerts
    const criticalAlerts: string[] = [];
    
    if (daysSinceLastPurchase && daysSinceLastPurchase > avgDaysBetweenPurchases * 1.5 && avgDaysBetweenPurchases > 0) {
      criticalAlerts.push(`⏰ Han pasado ${daysSinceLastPurchase} días desde la última compra (promedio: ${avgDaysBetweenPurchases} días)`);
    }
    
    if (stoppedProducts.length > 0) {
      criticalAlerts.push(`🛑 ${stoppedProducts.length} producto(s) dejaron de comprarse: ${stoppedProducts.map(p => p.name).join(', ')}`);
    }
    
    if (monthlyGrowth.salesGrowth < -20) {
      criticalAlerts.push(`📉 Caída significativa de ventas este mes (-${Math.abs(monthlyGrowth.salesGrowth).toFixed(0)}%)`);
    }

    // Status determination
    let status: 'growing' | 'stable' | 'declining' | 'inactive' | 'at_risk';
    let statusMessage: string;
    let statusActions: string[];
    
    if (daysSinceLastPurchase && daysSinceLastPurchase > 60) {
      status = 'inactive';
      statusMessage = `Sin actividad en ${daysSinceLastPurchase} días`;
      statusActions = ['Llamar para reactivación', 'Ofrecer promoción especial', 'Verificar si cambió de proveedor'];
    } else if (monthlyGrowth.salesGrowth < -20 || stoppedProducts.length >= 2) {
      status = 'at_risk';
      statusMessage = 'Cliente en riesgo de pérdida';
      statusActions = ['Agendar visita urgente', 'Revisar productos que dejó de comprar', 'Analizar competencia'];
    } else if (monthlyGrowth.salesGrowth < -5) {
      status = 'declining';
      statusMessage = 'Ventas en declive moderado';
      statusActions = ['Programar seguimiento', 'Revisar catálogo ofrecido', 'Identificar nuevas necesidades'];
    } else if (monthlyGrowth.salesGrowth > 15) {
      status = 'growing';
      statusMessage = 'Cliente en crecimiento sostenido';
      statusActions = ['Mantener atención prioritaria', 'Explorar nuevos productos', 'Considerar mejores condiciones'];
    } else {
      status = 'stable';
      statusMessage = 'Cliente estable y recurrente';
      statusActions = ['Mantener relación actual', 'Ofrecer novedades periódicamente'];
    }

    // Recent invoices
    const recentInvoices = [...filteredInvoices]
      .sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime())
      .slice(0, 15);

    // Why is this client growing/declining analysis
    const whyGrowing: string[] = [];
    const whyDeclining: string[] = [];
    
    if (growingProducts.length > 0) {
      whyGrowing.push(`Aumento en: ${growingProducts.slice(0, 3).map(p => `${p.name} (+${p.growth.toFixed(0)}%)`).join(', ')}`);
    }
    if (monthlyGrowth.invoiceCount > monthlyGrowth.prevInvoiceCount) {
      whyGrowing.push(`Mayor frecuencia de compra: ${monthlyGrowth.invoiceCount} facturas vs ${monthlyGrowth.prevInvoiceCount} mes anterior`);
    }
    if (avgTicket > (quarterlyGrowth.currentSales / Math.max(1, quarterlyGrowth.invoiceCount))) {
      whyGrowing.push('Ticket promedio superior al trimestre');
    }
    
    if (decliningProducts.length > 0) {
      whyDeclining.push(`Disminución en: ${decliningProducts.slice(0, 3).map(p => `${p.name} (${p.growth.toFixed(0)}%)`).join(', ')}`);
    }
    if (stoppedProducts.length > 0) {
      whyDeclining.push(`Productos sin compra este mes: ${stoppedProducts.map(p => p.name).join(', ')}`);
    }
    if (monthlyGrowth.invoiceCount < monthlyGrowth.prevInvoiceCount) {
      whyDeclining.push(`Menor frecuencia: ${monthlyGrowth.invoiceCount} facturas vs ${monthlyGrowth.prevInvoiceCount}`);
    }

    return {
      totalSales,
      totalCommission,
      invoiceCount,
      avgTicket,
      avgDaysBetweenPurchases,
      daysSinceLastPurchase,
      lastInvoice,
      monthlyGrowth,
      quarterlyGrowth,
      semesterGrowth,
      monthlyTrend,
      productAnalysis,
      topProducts,
      growingProducts,
      decliningProducts,
      stoppedProducts,
      criticalAlerts,
      status,
      statusMessage,
      statusActions,
      recentInvoices,
      whyGrowing,
      whyDeclining
    };
  }, [filteredInvoices, invoices, client.id]);

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
                     analytics.status === 'at_risk' ? AlertTriangle :
                     analytics.status === 'inactive' ? XCircle : CheckCircle2;
  
  const statusColors: Record<string, string> = {
    growing: 'text-emerald-600 bg-emerald-500/10 border-emerald-200',
    stable: 'text-blue-600 bg-blue-500/10 border-blue-200',
    declining: 'text-amber-600 bg-amber-500/10 border-amber-200',
    at_risk: 'text-rose-600 bg-rose-500/10 border-rose-200',
    inactive: 'text-gray-600 bg-gray-500/10 border-gray-200'
  };

  const statusLabels: Record<string, string> = {
    growing: 'En Crecimiento',
    stable: 'Estable',
    declining: 'En Declive',
    at_risk: 'En Riesgo',
    inactive: 'Inactivo'
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-5 border-b border-border shrink-0">
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
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowPDFDialog(true)}>
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
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
              </div>
            </DialogHeader>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Status Banner */}
              <div className={`flex items-start gap-4 p-4 rounded-xl border ${statusColors[analytics.status]}`}>
                <StatusIcon className="h-6 w-6 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-lg">{statusLabels[analytics.status]}</p>
                    {renderGrowthBadge(analytics.monthlyGrowth.salesGrowth, 'sm')}
                  </div>
                  <p className="text-sm opacity-80 mt-1">{analytics.statusMessage}</p>
                  {analytics.statusActions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {analytics.statusActions.map((action, idx) => (
                        <span key={idx} className="text-xs px-2 py-1 rounded-full bg-background/50 font-medium">
                          {action}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Critical Alerts */}
              {analytics.criticalAlerts.length > 0 && (
                <Card className="border-rose-200 bg-rose-50/50 dark:bg-rose-950/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-rose-700 dark:text-rose-400">
                      <AlertTriangle className="h-5 w-5" />
                      Alertas Críticas ({analytics.criticalAlerts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analytics.criticalAlerts.map((alert, idx) => (
                        <li key={idx} className="text-sm font-medium text-rose-800 dark:text-rose-300">
                          {alert}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <DollarSign className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase">Ventas</p>
                        <p className="text-lg font-bold truncate">${formatNumber(analytics.totalSales)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase">Mi Comisión</p>
                        <p className="text-lg font-bold text-emerald-600 truncate">${formatNumber(analytics.totalCommission)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase">Facturas</p>
                        <p className="text-lg font-bold">{analytics.invoiceCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                        <Target className="h-4 w-4 text-violet-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase">Prom. Factura</p>
                        <p className="text-lg font-bold truncate">${formatNumber(analytics.avgTicket)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase">Frecuencia</p>
                        <p className="text-lg font-bold">
                          {analytics.avgDaysBetweenPurchases > 0 ? `${analytics.avgDaysBetweenPurchases}d` : '-'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid w-full grid-cols-4 h-12">
                  <TabsTrigger value="overview" className="gap-2">
                    <Activity className="h-4 w-4" />
                    <span className="hidden sm:inline">Resumen</span>
                  </TabsTrigger>
                  <TabsTrigger value="products" className="gap-2">
                    <Package className="h-4 w-4" />
                    <span className="hidden sm:inline">Productos</span>
                  </TabsTrigger>
                  <TabsTrigger value="trend" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Evolución</span>
                  </TabsTrigger>
                  <TabsTrigger value="invoices" className="gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="hidden sm:inline">Facturas</span>
                  </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                  {/* Growth Comparison */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        Comparativa de Crecimiento
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 rounded-xl bg-muted/30">
                          <p className="text-sm text-muted-foreground mb-2">Mensual</p>
                          {renderGrowthBadge(analytics.monthlyGrowth.salesGrowth, 'lg')}
                          <div className="mt-2 text-xs text-muted-foreground">
                            <p>Este mes: ${formatNumber(analytics.monthlyGrowth.currentSales)}</p>
                            <p>Anterior: ${formatNumber(analytics.monthlyGrowth.previousSales)}</p>
                          </div>
                        </div>
                        
                        <div className="text-center p-4 rounded-xl bg-muted/30">
                          <p className="text-sm text-muted-foreground mb-2">Trimestral</p>
                          {renderGrowthBadge(analytics.quarterlyGrowth.salesGrowth, 'lg')}
                          <div className="mt-2 text-xs text-muted-foreground">
                            <p>Este trim: ${formatNumber(analytics.quarterlyGrowth.currentSales)}</p>
                            <p>Anterior: ${formatNumber(analytics.quarterlyGrowth.previousSales)}</p>
                          </div>
                        </div>
                        
                        <div className="text-center p-4 rounded-xl bg-muted/30">
                          <p className="text-sm text-muted-foreground mb-2">Semestral</p>
                          {renderGrowthBadge(analytics.semesterGrowth.salesGrowth, 'lg')}
                          <div className="mt-2 text-xs text-muted-foreground">
                            <p>6 meses: ${formatNumber(analytics.semesterGrowth.currentSales)}</p>
                            <p>Prev 6m: ${formatNumber(analytics.semesterGrowth.previousSales)}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Why Growing / Declining Analysis */}
                  <div className="grid lg:grid-cols-2 gap-4">
                    {analytics.whyGrowing.length > 0 && (
                      <Card className="border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
                            <Sparkles className="h-4 w-4" />
                            ¿Por qué está creciendo?
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {analytics.whyGrowing.map((reason, idx) => (
                              <li key={idx} className="text-sm flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {analytics.whyDeclining.length > 0 && (
                      <Card className="border-rose-200 bg-rose-50/30 dark:bg-rose-950/10">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2 text-rose-700">
                            <AlertTriangle className="h-4 w-4" />
                            ¿Por qué está bajando?
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {analytics.whyDeclining.map((reason, idx) => (
                              <li key={idx} className="text-sm flex items-start gap-2">
                                <XCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Quick Product Summary */}
                  <div className="grid lg:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Award className="h-4 w-4 text-amber-500" />
                          Top 3 Productos
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {analytics.topProducts.slice(0, 3).map((p, idx) => (
                            <div key={p.name} className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-bold text-muted-foreground w-4">#{idx + 1}</span>
                                <span className="text-sm font-medium truncate">{p.name}</span>
                              </div>
                              <span className="text-sm font-bold shrink-0">${formatNumber(p.totalSales)}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-emerald-200/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-emerald-600">
                          <ArrowUpRight className="h-4 w-4" />
                          En Crecimiento ({analytics.growingProducts.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {analytics.growingProducts.slice(0, 3).map((p) => (
                            <div key={p.name} className="flex items-center justify-between">
                              <span className="text-sm font-medium truncate max-w-[140px]">{p.name}</span>
                              {renderGrowthBadge(p.growth)}
                            </div>
                          ))}
                          {analytics.growingProducts.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-2">Sin datos</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-rose-200/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-rose-600">
                          <ArrowDownRight className="h-4 w-4" />
                          En Declive ({analytics.decliningProducts.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {analytics.decliningProducts.slice(0, 3).map((p) => (
                            <div key={p.name} className="flex items-center justify-between">
                              <span className="text-sm font-medium truncate max-w-[140px]">{p.name}</span>
                              {renderGrowthBadge(p.growth)}
                            </div>
                          ))}
                          {analytics.decliningProducts.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-2">Sin datos</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Products Tab - EXHAUSTIVE ANALYSIS */}
                <TabsContent value="products" className="space-y-4">
                  {/* Stopped Products Alert */}
                  {analytics.stoppedProducts.length > 0 && (
                    <Card className="border-rose-200 bg-rose-50/50 dark:bg-rose-950/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 text-rose-700">
                          <XCircle className="h-5 w-5" />
                          Productos que dejó de comprar ({analytics.stoppedProducts.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {analytics.stoppedProducts.map(p => (
                            <div key={p.name} className="p-3 rounded-lg bg-background border border-rose-200">
                              <p className="font-semibold text-sm">{p.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Última compra: {p.lastPurchaseDate ? format(parseISO(p.lastPurchaseDate), "dd MMM", { locale: es }) : 'N/A'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Mes anterior: ${formatNumber(p.prevMonthSales)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Product Distribution */}
                  <div className="grid lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Distribución de Ventas</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analytics.productAnalysis.length > 0 ? (
                          <div className="h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={analytics.productAnalysis.slice(0, 6)}
                                  dataKey="totalSales"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={50}
                                  outerRadius={90}
                                  paddingAngle={2}
                                  label={({ name, percent }) => `${name.substring(0, 10)}${name.length > 10 ? '...' : ''} ${(percent * 100).toFixed(0)}%`}
                                  labelLine={false}
                                >
                                  {analytics.productAnalysis.slice(0, 6).map((_, idx) => (
                                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => [`$${formatNumber(value)}`, 'Ventas']} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <p className="text-center text-muted-foreground py-8">No hay datos de productos</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Comparativa Mensual</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analytics.productAnalysis.length > 0 ? (
                          <div className="h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={analytics.productAnalysis.slice(0, 5)} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(value: number) => [`$${formatNumber(value)}`, '']} />
                                <Bar dataKey="prevMonthSales" name="Mes anterior" fill="hsl(var(--muted-foreground))" opacity={0.5} />
                                <Bar dataKey="lastMonthSales" name="Este mes" fill="hsl(var(--primary))" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <p className="text-center text-muted-foreground py-8">No hay datos</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detailed Product Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Análisis Detallado por Producto ({analytics.productAnalysis.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left py-3 px-3 font-semibold">Producto</th>
                              <th className="text-right py-3 px-3 font-semibold">Total Ventas</th>
                              <th className="text-right py-3 px-3 font-semibold">Comisión</th>
                              <th className="text-center py-3 px-3 font-semibold">Facturas</th>
                              <th className="text-right py-3 px-3 font-semibold">Prom/Factura</th>
                              <th className="text-right py-3 px-3 font-semibold">% del Total</th>
                              <th className="text-center py-3 px-3 font-semibold">Tendencia</th>
                              <th className="text-left py-3 px-3 font-semibold">Recomendación</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.productAnalysis.map((product, idx) => (
                              <tr key={product.name} className={`border-b last:border-0 hover:bg-muted/20 ${product.isStopped ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''}`}>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                    <span className="font-medium">{product.name}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-right font-bold">${formatNumber(product.totalSales)}</td>
                                <td className="py-3 px-3 text-right text-emerald-600">${formatNumber(product.totalCommission)}</td>
                                <td className="py-3 px-3 text-center">{product.invoiceCount}</td>
                                <td className="py-3 px-3 text-right">${formatNumber(product.avgPerInvoice)}</td>
                                <td className="py-3 px-3 text-right">{product.percentOfTotal.toFixed(1)}%</td>
                                <td className="py-3 px-3 text-center">{renderGrowthBadge(product.growth)}</td>
                                <td className="py-3 px-3 text-xs max-w-[200px]">{product.recommendation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Trend Tab */}
                <TabsContent value="trend">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Evolución de Ventas (12 meses)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[320px]">
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
                              formatter={(value: number, name: string) => [
                                `$${formatNumber(value)}`, 
                                name === 'sales' ? 'Ventas' : 'Comisión'
                              ]}
                            />
                            <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" fill="url(#clientSalesGradient)" strokeWidth={2} name="sales" />
                            <Area type="monotone" dataKey="commission" stroke="hsl(var(--chart-2))" fill="none" strokeWidth={2} strokeDasharray="5 5" name="commission" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Invoices Tab */}
                <TabsContent value="invoices">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Historial de Facturas ({analytics.recentInvoices.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left py-3 px-3 font-semibold">NCF</th>
                              <th className="text-left py-3 px-3 font-semibold">Fecha</th>
                              <th className="text-right py-3 px-3 font-semibold">Monto</th>
                              <th className="text-right py-3 px-3 font-semibold">Comisión</th>
                              <th className="text-left py-3 px-3 font-semibold">Productos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.recentInvoices.map(inv => (
                              <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="py-3 px-3 font-mono text-xs">{inv.ncf}</td>
                                <td className="py-3 px-3">
                                  {format(parseISO(inv.invoice_date), "dd MMM yyyy", { locale: es })}
                                </td>
                                <td className="py-3 px-3 text-right font-bold">${formatNumber(Number(inv.total_amount))}</td>
                                <td className="py-3 px-3 text-right text-emerald-600">${formatNumber(Number(inv.total_commission))}</td>
                                <td className="py-3 px-3">
                                  <div className="flex flex-wrap gap-1">
                                    {inv.products?.slice(0, 3).map((p, idx) => (
                                      <span key={idx} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                        {p.product_name}
                                      </span>
                                    ))}
                                    {(inv.products?.length || 0) > 3 && (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                        +{(inv.products?.length || 0) - 3}
                                      </span>
                                    )}
                                  </div>
                                </td>
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
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Client PDF Generator */}
      <ClientPDFGenerator
        open={showPDFDialog}
        onOpenChange={setShowPDFDialog}
        client={client}
        invoices={invoices}
        analytics={analytics}
      />
    </>
  );
}
