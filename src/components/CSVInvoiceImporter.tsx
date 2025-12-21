import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Upload, Download, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { parse, format } from 'date-fns';
import { formatNumber } from '@/lib/formatters';

interface Product {
  id: string;
  name: string;
  percentage: number;
}

interface Client {
  id: string;
  name: string;
}

interface ImportedLine {
  productName: string;
  quantity: number;
  unitPrice: number;
  productId?: string;
  error?: string;
}

interface ImportedInvoice {
  ncfSuffix: string;
  invoiceDate: Date;
  clientName: string;
  clientId?: string;
  lines: ImportedLine[];
  errors: string[];
  total: number;
}

interface CSVInvoiceImporterProps {
  products: Product[];
  clients: Client[];
  onImport: (data: {
    ncfSuffix: string;
    invoiceDate: Date;
    clientId?: string;
    lines: { productId: string; quantity: number; unitPrice: number }[];
  }) => void;
  onBulkImport?: (invoices: {
    ncfSuffix: string;
    invoiceDate: Date;
    clientId?: string;
    lines: { productId: string; quantity: number; unitPrice: number }[];
  }[]) => Promise<void>;
}

export const CSVInvoiceImporter = ({ products, clients, onImport, onBulkImport }: CSVInvoiceImporterProps) => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ImportedInvoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const template = `NCF_SUFFIX,FECHA,CLIENTE,PRODUCTO,CANTIDAD,PRECIO_UNITARIO
0001,2024-01-15,Farmacia Central,Producto A,10,150.00
0001,2024-01-15,Farmacia Central,Producto B,5,200.50
0002,2024-01-16,Farmacia Norte,Producto A,8,150.00
0002,2024-01-16,Farmacia Norte,Producto C,3,300.00
0003,2024-01-17,Farmacia Sur,Producto B,12,200.50`;

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_facturas.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Template descargado');
  };

  const parseCSV = (text: string): ImportedInvoice[] | null => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      toast.error('El archivo CSV debe tener al menos una fila de datos');
      return null;
    }

    // Skip header
    const dataLines = lines.slice(1);
    
    // Group lines by NCF
    const invoiceMap = new Map<string, {
      ncfSuffix: string;
      invoiceDate: Date;
      clientName: string;
      clientId?: string;
      lines: ImportedLine[];
      errors: string[];
    }>();

    dataLines.forEach((line, index) => {
      const parts = line.split(',').map(p => p.trim());
      
      if (parts.length < 6) {
        return;
      }

      const [ncf, fecha, cliente, producto, cantidad, precio] = parts;
      const ncfSuffix = ncf.replace(/\D/g, '').slice(-4).padStart(4, '0');
      
      if (!invoiceMap.has(ncfSuffix)) {
        // Parse date
        let invoiceDate = new Date();
        const parsedDate = parse(fecha, 'yyyy-MM-dd', new Date());
        if (!isNaN(parsedDate.getTime())) {
          invoiceDate = parsedDate;
        } else {
          const parsedDate2 = parse(fecha, 'dd/MM/yyyy', new Date());
          if (!isNaN(parsedDate2.getTime())) {
            invoiceDate = parsedDate2;
          }
        }

        // Match client
        const matchedClient = clients.find(c => 
          c.name.toLowerCase().includes(cliente.toLowerCase()) ||
          cliente.toLowerCase().includes(c.name.toLowerCase())
        );

        invoiceMap.set(ncfSuffix, {
          ncfSuffix,
          invoiceDate,
          clientName: cliente,
          clientId: matchedClient?.id,
          lines: [],
          errors: []
        });
      }

      const invoice = invoiceMap.get(ncfSuffix)!;

      // Parse product line
      const qty = parseFloat(cantidad);
      const price = parseFloat(precio);

      if (isNaN(qty) || qty <= 0) {
        invoice.errors.push(`Línea ${index + 2}: Cantidad inválida "${cantidad}"`);
        return;
      }

      if (isNaN(price) || price <= 0) {
        invoice.errors.push(`Línea ${index + 2}: Precio inválido "${precio}"`);
        return;
      }

      // Match product
      const matchedProduct = products.find(p =>
        p.name.toLowerCase().includes(producto.toLowerCase()) ||
        producto.toLowerCase().includes(p.name.toLowerCase())
      );

      invoice.lines.push({
        productName: producto,
        quantity: qty,
        unitPrice: price,
        productId: matchedProduct?.id,
        error: matchedProduct ? undefined : 'Producto no encontrado'
      });
    });

    // Convert to array and calculate totals
    const invoices: ImportedInvoice[] = Array.from(invoiceMap.values()).map(inv => ({
      ...inv,
      total: inv.lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice), 0)
    }));

    if (invoices.length === 0) {
      toast.error('No se encontraron facturas válidas en el archivo');
      return null;
    }

    return invoices;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setPreview(parsed);
      setLoading(false);
    };

    reader.onerror = () => {
      toast.error('Error al leer el archivo');
      setLoading(false);
    };

    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview || preview.length === 0) return;

    setImporting(true);

    // If only one invoice, use single import
    if (preview.length === 1) {
      const inv = preview[0];
      const validLines = inv.lines
        .filter(l => l.productId)
        .map(l => ({
          productId: l.productId!,
          quantity: l.quantity,
          unitPrice: l.unitPrice
        }));

      if (validLines.length === 0) {
        toast.error('No hay productos válidos para importar');
        setImporting(false);
        return;
      }

      onImport({
        ncfSuffix: inv.ncfSuffix,
        invoiceDate: inv.invoiceDate,
        clientId: inv.clientId,
        lines: validLines
      });

      toast.success(`Factura importada con ${validLines.length} productos`);
    } else {
      // Multiple invoices - use bulk import if available
      if (onBulkImport) {
        const invoicesToImport = preview
          .filter(inv => inv.lines.some(l => l.productId))
          .map(inv => ({
            ncfSuffix: inv.ncfSuffix,
            invoiceDate: inv.invoiceDate,
            clientId: inv.clientId,
            lines: inv.lines
              .filter(l => l.productId)
              .map(l => ({
                productId: l.productId!,
                quantity: l.quantity,
                unitPrice: l.unitPrice
              }))
          }));

        if (invoicesToImport.length === 0) {
          toast.error('No hay facturas válidas para importar');
          setImporting(false);
          return;
        }

        await onBulkImport(invoicesToImport);
        toast.success(`${invoicesToImport.length} facturas importadas correctamente`);
      } else {
        // Fall back to importing first invoice only
        const inv = preview[0];
        const validLines = inv.lines
          .filter(l => l.productId)
          .map(l => ({
            productId: l.productId!,
            quantity: l.quantity,
            unitPrice: l.unitPrice
          }));

        onImport({
          ncfSuffix: inv.ncfSuffix,
          invoiceDate: inv.invoiceDate,
          clientId: inv.clientId,
          lines: validLines
        });

        toast.success(`Primera factura importada (${preview.length - 1} pendientes)`);
      }
    }

    setImporting(false);
    setOpen(false);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetImport = () => {
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const totalValidProducts = preview?.reduce((sum, inv) => sum + inv.lines.filter(l => l.productId).length, 0) || 0;
  const totalInvoices = preview?.length || 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetImport(); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0">
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Importar CSV</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Importar Facturas desde CSV
          </DialogTitle>
          <DialogDescription>
            Sube un archivo CSV con múltiples facturas. El sistema agrupa automáticamente por NCF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
            <div>
              <p className="text-sm font-medium">Template CSV</p>
              <p className="text-xs text-muted-foreground">Formato para múltiples facturas</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" />
              Descargar
            </Button>
          </div>

          {/* File input */}
          <div className="space-y-2">
            <label 
              htmlFor="csv-file" 
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold">Haz clic para subir</span> o arrastra un archivo
                </p>
                <p className="text-xs text-muted-foreground mt-1">Archivo CSV</p>
              </div>
              <input 
                id="csv-file" 
                ref={fileInputRef}
                type="file" 
                accept=".csv" 
                className="hidden" 
                onChange={handleFileChange}
              />
            </label>
          </div>

          {/* Preview */}
          {preview && preview.length > 0 && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      {totalInvoices} factura{totalInvoices > 1 ? 's' : ''} detectada{totalInvoices > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totalValidProducts} productos válidos en total
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">
                      ${formatNumber(preview.reduce((sum, inv) => sum + inv.total, 0))}
                    </p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>

              {/* Invoice list */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {preview.map((invoice, idx) => (
                  <div key={idx} className="p-3 bg-card rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold bg-muted px-2 py-1 rounded">
                          B010000{invoice.ncfSuffix}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(invoice.invoiceDate, 'dd/MM/yyyy')}
                        </span>
                      </div>
                      <span className="text-sm font-bold">${formatNumber(invoice.total)}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Cliente:</span>
                      <span className="font-medium truncate flex-1">{invoice.clientName}</span>
                      {invoice.clientId ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {invoice.lines.map((line, i) => (
                        <span 
                          key={i} 
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            line.productId 
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}
                        >
                          {line.productName} ({line.quantity})
                        </span>
                      ))}
                    </div>

                    {invoice.errors.length > 0 && (
                      <div className="mt-2 text-xs text-destructive">
                        {invoice.errors.map((err, i) => (
                          <p key={i}>{err}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          {preview && preview.length > 0 && (
            <Button 
              onClick={handleImport} 
              disabled={importing || totalValidProducts === 0}
              className="gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Importar {totalInvoices} factura{totalInvoices > 1 ? 's' : ''}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
