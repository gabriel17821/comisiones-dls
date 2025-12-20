import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Download, Loader2, TrendingUp, Package, FileSpreadsheet, BarChart3 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatNumber } from '@/lib/formatters';
import { Invoice } from '@/hooks/useInvoices';
import { Client } from '@/hooks/useClients';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

interface ClientPDFGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  invoices: Invoice[];
  analytics: {
    totalSales: number;
    totalCommission: number;
    invoiceCount: number;
    avgTicket: number;
    monthlyGrowth: { current: number; previous: number; growth: number };
    quarterlyGrowth: { current: number; previous: number; growth: number };
    semesterGrowth: { current: number; previous: number; growth: number };
    monthlyTrend: Array<{ month: string; label: string; sales: number; commission: number; invoices: number }>;
    productBreakdown: Array<{ name: string; sales: number; commission: number; count: number; quantity?: number }>;
    status: 'growing' | 'stable' | 'declining' | 'inactive';
    statusMessage: string;
  };
}

export function ClientPDFGenerator({ open, onOpenChange, client, invoices, analytics }: ClientPDFGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [sections, setSections] = useState({
    summary: true,
    growth: true,
    products: true,
    invoices: true,
    trend: true,
  });

  const toggleSection = (key: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const generatePDF = async () => {
    setGenerating(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 20;

      // Modern color palette matching the web app
      const primaryColor: [number, number, number] = [99, 102, 241]; // Indigo
      const successColor: [number, number, number] = [16, 185, 129]; // Emerald
      const warningColor: [number, number, number] = [245, 158, 11]; // Amber
      const dangerColor: [number, number, number] = [239, 68, 68]; // Rose
      const textColor: [number, number, number] = [15, 23, 42]; // Slate-900
      const mutedColor: [number, number, number] = [100, 116, 139]; // Slate-500
      const lightBg: [number, number, number] = [248, 250, 252]; // Slate-50

      // Status colors
      const statusColors = {
        growing: successColor,
        stable: [59, 130, 246] as [number, number, number], // Blue
        declining: dangerColor,
        inactive: warningColor,
      };

      // ============ HEADER ============
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 50, 'F');
      
      // Client name
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text(client.name, 20, 22);
      
      // Subtitle
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Reporte Detallado de Cliente', 20, 32);
      
      // Contact info
      doc.setFontSize(9);
      const contactInfo = [
        client.phone && `Tel: ${client.phone}`,
        client.email && client.email
      ].filter(Boolean).join(' · ');
      if (contactInfo) doc.text(contactInfo, 20, 42);
      
      // Date badge
      doc.setFillColor(255, 255, 255, 0.2);
      doc.roundedRect(pageWidth - 70, 15, 55, 20, 3, 3, 'F');
      doc.setFontSize(9);
      doc.text(format(new Date(), "d MMM yyyy", { locale: es }), pageWidth - 65, 28);

      yPos = 60;

      // ============ STATUS BANNER ============
      const statusColor = statusColors[analytics.status];
      doc.setFillColor(...statusColor);
      doc.roundedRect(20, yPos, pageWidth - 40, 18, 3, 3, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      const statusLabels = {
        growing: '📈 Cliente en Crecimiento',
        stable: '✓ Cliente Estable',
        declining: '⚠ Cliente en Riesgo',
        inactive: '⏸ Cliente Inactivo'
      };
      doc.text(statusLabels[analytics.status], 28, yPos + 12);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(analytics.statusMessage, pageWidth / 2, yPos + 12, { align: 'center' });
      
      yPos += 28;

      // ============ SUMMARY KPIs ============
      if (sections.summary) {
        const boxWidth = (pageWidth - 50) / 4;
        const boxHeight = 32;
        
        const kpis = [
          { label: 'Total Ventas', value: `$${formatNumber(analytics.totalSales)}`, color: primaryColor },
          { label: 'Mi Comisión', value: `$${formatNumber(analytics.totalCommission)}`, color: successColor },
          { label: 'Facturas', value: String(analytics.invoiceCount), color: [59, 130, 246] as [number, number, number] },
          { label: 'Prom. Factura', value: `$${formatNumber(analytics.avgTicket)}`, color: [139, 92, 246] as [number, number, number] },
        ];

        kpis.forEach((kpi, idx) => {
          const x = 20 + idx * (boxWidth + 5);
          
          // Card background
          doc.setFillColor(...lightBg);
          doc.roundedRect(x, yPos, boxWidth, boxHeight, 3, 3, 'F');
          
          // Color accent bar
          doc.setFillColor(...kpi.color);
          doc.roundedRect(x, yPos, 4, boxHeight, 2, 2, 'F');
          
          // Label
          doc.setTextColor(...mutedColor);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.text(kpi.label.toUpperCase(), x + 10, yPos + 10);
          
          // Value
          doc.setTextColor(...textColor);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text(kpi.value, x + 10, yPos + 24);
        });

        yPos += boxHeight + 15;
      }

      // ============ GROWTH COMPARISON ============
      if (sections.growth) {
        doc.setTextColor(...primaryColor);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Comparativa de Crecimiento', 20, yPos);
        yPos += 10;

        const growthBoxWidth = (pageWidth - 50) / 3;
        const growthBoxHeight = 40;

        const growthData = [
          { label: 'Mensual', ...analytics.monthlyGrowth },
          { label: 'Trimestral', ...analytics.quarterlyGrowth },
          { label: 'Semestral', ...analytics.semesterGrowth },
        ];

        growthData.forEach((data, idx) => {
          const x = 20 + idx * (growthBoxWidth + 5);
          
          doc.setFillColor(...lightBg);
          doc.roundedRect(x, yPos, growthBoxWidth, growthBoxHeight, 3, 3, 'F');
          
          // Label
          doc.setTextColor(...mutedColor);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(data.label, x + growthBoxWidth / 2, yPos + 10, { align: 'center' });
          
          // Growth percentage
          const growthColor = data.growth >= 0 ? successColor : dangerColor;
          doc.setTextColor(...growthColor);
          doc.setFontSize(16);
          doc.setFont('helvetica', 'bold');
          const growthText = `${data.growth >= 0 ? '+' : ''}${data.growth.toFixed(1)}%`;
          doc.text(growthText, x + growthBoxWidth / 2, yPos + 24, { align: 'center' });
          
          // Current vs Previous
          doc.setTextColor(...mutedColor);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.text(`$${formatNumber(data.current)} vs $${formatNumber(data.previous)}`, x + growthBoxWidth / 2, yPos + 34, { align: 'center' });
        });

        yPos += growthBoxHeight + 15;
      }

      // ============ PRODUCTS TABLE ============
      if (sections.products && analytics.productBreakdown.length > 0) {
        if (yPos > pageHeight - 100) {
          doc.addPage();
          yPos = 20;
        }

        doc.setTextColor(...primaryColor);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Desglose por Producto', 20, yPos);
        yPos += 8;

        // Calculate percentages
        const totalProductSales = analytics.productBreakdown.reduce((sum, p) => sum + p.sales, 0);

        autoTable(doc, {
          startY: yPos,
          head: [['Producto', 'Ventas', '% del Total', 'Comisión', 'Facturas']],
          body: analytics.productBreakdown.map(product => {
            const percentage = totalProductSales > 0 ? (product.sales / totalProductSales) * 100 : 0;
            return [
              product.name,
              `$${formatNumber(product.sales)}`,
              `${percentage.toFixed(1)}%`,
              `$${formatNumber(product.commission)}`,
              String(product.count)
            ];
          }),
          theme: 'striped',
          headStyles: { 
            fillColor: primaryColor, 
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold',
            cellPadding: 5
          },
          bodyStyles: { 
            fontSize: 9, 
            cellPadding: 4 
          },
          alternateRowStyles: { 
            fillColor: [248, 250, 252] 
          },
          columnStyles: {
            0: { fontStyle: 'bold' },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'center' }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // ============ MONTHLY TREND ============
      if (sections.trend && analytics.monthlyTrend.length > 0) {
        if (yPos > pageHeight - 100) {
          doc.addPage();
          yPos = 20;
        }

        doc.setTextColor(...primaryColor);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Evolución Mensual (12 meses)', 20, yPos);
        yPos += 8;

        autoTable(doc, {
          startY: yPos,
          head: [['Mes', 'Ventas', 'Comisión', 'Facturas']],
          body: analytics.monthlyTrend.map(m => [
            m.label.charAt(0).toUpperCase() + m.label.slice(1),
            `$${formatNumber(m.sales)}`,
            `$${formatNumber(m.commission)}`,
            String(m.invoices)
          ]),
          theme: 'striped',
          headStyles: { 
            fillColor: primaryColor, 
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold',
            cellPadding: 4
          },
          bodyStyles: { 
            fontSize: 9, 
            cellPadding: 3 
          },
          alternateRowStyles: { 
            fillColor: [248, 250, 252] 
          },
          columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'center' }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // ============ INVOICES LIST ============
      if (sections.invoices && invoices.length > 0) {
        if (yPos > pageHeight - 100) {
          doc.addPage();
          yPos = 20;
        }

        doc.setTextColor(...primaryColor);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Historial de Facturas', 20, yPos);
        yPos += 8;

        const clientInvoices = invoices
          .filter(inv => inv.client_id === client.id)
          .sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime())
          .slice(0, 25);

        autoTable(doc, {
          startY: yPos,
          head: [['NCF', 'Fecha', 'Monto', 'Comisión', 'Productos']],
          body: clientInvoices.map(inv => [
            inv.ncf,
            format(parseISO(inv.invoice_date), "d MMM yyyy", { locale: es }),
            `$${formatNumber(Number(inv.total_amount))}`,
            `$${formatNumber(Number(inv.total_commission))}`,
            String(inv.products?.length || 0)
          ]),
          theme: 'striped',
          headStyles: { 
            fillColor: primaryColor, 
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold',
            cellPadding: 4
          },
          bodyStyles: { 
            fontSize: 8, 
            cellPadding: 3 
          },
          alternateRowStyles: { 
            fillColor: [248, 250, 252] 
          },
          columnStyles: {
            0: { fontStyle: 'bold', fontSize: 7 },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'center' }
          }
        });
      }

      // ============ FOOTER ============
      const totalPages = doc.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        
        // Footer line
        doc.setDrawColor(...lightBg);
        doc.setLineWidth(0.5);
        doc.line(20, pageHeight - 15, pageWidth - 20, pageHeight - 15);
        
        // Footer text
        doc.setTextColor(...mutedColor);
        doc.setFontSize(8);
        doc.text(
          `Reporte generado el ${format(new Date(), "d 'de' MMMM yyyy, HH:mm", { locale: es })}`,
          20,
          pageHeight - 8
        );
        doc.text(
          `Página ${i} de ${totalPages}`,
          pageWidth - 20,
          pageHeight - 8,
          { align: 'right' }
        );
      }

      // Save
      const fileName = `reporte_${client.name.toLowerCase().replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
      toast.success('Reporte de cliente generado exitosamente');
      onOpenChange(false);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el reporte');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Exportar Reporte de {client.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Selecciona las secciones a incluir en el reporte PDF:
          </p>

          <div className="space-y-2">
            {[
              { key: 'summary', icon: BarChart3, label: 'Resumen de KPIs', desc: 'Ventas, comisión, facturas y promedio' },
              { key: 'growth', icon: TrendingUp, label: 'Comparativa de Crecimiento', desc: 'Mensual, trimestral y semestral' },
              { key: 'products', icon: Package, label: 'Desglose por Producto', desc: 'Ventas y comisión por producto' },
              { key: 'trend', icon: BarChart3, label: 'Evolución Mensual', desc: 'Últimos 12 meses' },
              { key: 'invoices', icon: FileSpreadsheet, label: 'Historial de Facturas', desc: 'Lista de las últimas 25 facturas' },
            ].map(({ key, icon: Icon, label, desc }) => (
              <div
                key={key}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  sections[key as keyof typeof sections] 
                    ? 'border-primary bg-primary/5 shadow-sm' 
                    : 'border-border hover:bg-muted/50'
                }`}
                onClick={() => toggleSection(key as keyof typeof sections)}
              >
                <Checkbox checked={sections[key as keyof typeof sections]} />
                <Icon className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
          <Button 
            onClick={generatePDF} 
            disabled={generating || !Object.values(sections).some(Boolean)}
            className="flex-1 gradient-primary"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Descargar PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
