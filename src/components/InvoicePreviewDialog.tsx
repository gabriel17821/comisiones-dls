import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Check, Save } from 'lucide-react';

interface Breakdown {
  name: string;
  label: string;
  amount: number;
  percentage: number;
  commission: number;
  color: string;
}

interface InvoicePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading: boolean;
  data: {
    ncf: string;
    invoiceDate: Date;
    clientName: string | null;
    totalAmount: number;
    breakdown: Breakdown[];
    restAmount: number;
    restPercentage: number;
    restCommission: number;
    totalCommission: number;
  };
}

export const InvoicePreviewDialog = ({
  open,
  onOpenChange,
  onConfirm,
  loading,
  data,
}: InvoicePreviewDialogProps) => {
  const hasProducts = data.breakdown.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-0">
        {/* Invoice Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-5 border-b border-border">
          <DialogHeader className="p-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Save className="h-5 w-5 text-primary" />
              Confirmar Factura
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Invoice Body - Real invoice format */}
        <div className="px-6 py-5 space-y-6">
          {/* Header Info Grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 pb-5 border-b border-dashed border-border">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">NCF</span>
              <p className="font-mono text-base font-bold text-foreground mt-0.5">{data.ncf}</p>
            </div>
            <div className="text-right">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Fecha</span>
              <p className="text-base font-semibold text-foreground mt-0.5">
                {format(data.invoiceDate, "d 'de' MMMM, yyyy", { locale: es })}
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Cliente</span>
              <p className="text-base font-semibold text-foreground mt-0.5">
                {data.clientName || 'Sin cliente asignado'}
              </p>
            </div>
          </div>

          {/* Products Table */}
          <div>
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 pb-2 border-b-2 border-foreground/20 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              <div className="col-span-5">Descripción</div>
              <div className="col-span-2 text-center">%</div>
              <div className="col-span-2 text-right">Monto</div>
              <div className="col-span-3 text-right">Comisión</div>
            </div>

            {/* Product Rows */}
            <div className="divide-y divide-border/50">
              {data.breakdown.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 py-3 items-center">
                  <div className="col-span-5 flex items-center gap-2">
                    <span 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-medium text-foreground text-sm">{item.name}</span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-muted text-xs font-bold text-muted-foreground">
                      {item.percentage}%
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-sm text-muted-foreground">
                    ${formatNumber(item.amount)}
                  </div>
                  <div className="col-span-3 text-right text-sm font-semibold text-success">
                    ${formatCurrency(item.commission)}
                  </div>
                </div>
              ))}

              {/* Rest Row */}
              {data.restAmount > 0 && (
                <div className="grid grid-cols-12 gap-2 py-3 items-center bg-secondary/20 -mx-6 px-6">
                  <div className="col-span-5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-secondary" />
                    <span className="font-medium text-foreground text-sm">Resto de productos</span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-secondary text-xs font-bold text-secondary-foreground">
                      {data.restPercentage}%
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-sm text-muted-foreground">
                    ${formatNumber(data.restAmount)}
                  </div>
                  <div className="col-span-3 text-right text-sm font-semibold text-success">
                    ${formatCurrency(data.restCommission)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Totals Section */}
          <div className="pt-4 border-t-2 border-foreground/20 space-y-3">
            {/* Subtotal */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Factura</span>
              <span className="font-bold text-foreground text-lg">${formatNumber(data.totalAmount)}</span>
            </div>
            
            {/* Total Commission - Highlighted */}
            <div className="flex items-center justify-between p-4 -mx-6 bg-gradient-to-r from-success/15 via-success/10 to-success/5 border-y border-success/20">
              <span className="font-semibold text-foreground">Tu Comisión Total</span>
              <span className="text-3xl font-black text-success">${formatCurrency(data.totalCommission)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 gap-2 gradient-success text-success-foreground"
          >
            <Check className="h-4 w-4" />
            {loading ? 'Guardando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
