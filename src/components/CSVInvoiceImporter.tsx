import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Upload, Download, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { parse } from 'date-fns';

interface Product {
  id: string;
  name: string;
  percentage: number;
  color: string;
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
}

export const CSVInvoiceImporter = ({ products, clients, onImport }: CSVInvoiceImporterProps) => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ImportedInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const template = `NCF_SUFFIX,FECHA,CLIENTE,PRODUCTO,CANTIDAD,PRECIO_UNITARIO
0001,2024-01-15,Farmacia Central,Producto A,10,150.00
0001,2024-01-15,Farmacia Central,Producto B,5,200.50
0002,2024-01-16,Farmacia Norte,Producto A,8,150.00`;

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_factura.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Template descargado');
  };

  const parseCSV = (text: string): ImportedInvoice | null => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      toast.error('El archivo CSV debe tener al menos una fila de datos');
      return null;
    }

    // Skip header
    const dataLines = lines.slice(1);
    const errors: string[] = [];
    const parsedLines: ImportedLine[] = [];
    
    let ncfSuffix = '';
    let invoiceDate = new Date();
    let clientName = '';
    let clientId: string | undefined;

    dataLines.forEach((line, index) => {
      const parts = line.split(',').map(p => p.trim());
      
      if (parts.length < 6) {
        errors.push(`Línea ${index + 2}: Formato incorrecto (se esperan 6 columnas)`);
        return;
      }

      const [ncf, fecha, cliente, producto, cantidad, precio] = parts;

      // Use first row for invoice header data
      if (index === 0) {
        ncfSuffix = ncf.replace(/\D/g, '').slice(-4).padStart(4, '0');
        
        // Parse date (accepts multiple formats)
        const parsedDate = parse(fecha, 'yyyy-MM-dd', new Date());
        if (isNaN(parsedDate.getTime())) {
          const parsedDate2 = parse(fecha, 'dd/MM/yyyy', new Date());
          if (isNaN(parsedDate2.getTime())) {
            errors.push(`Línea ${index + 2}: Fecha inválida "${fecha}"`);
            invoiceDate = new Date();
          } else {
            invoiceDate = parsedDate2;
          }
        } else {
          invoiceDate = parsedDate;
        }

        clientName = cliente;
        
        // Try to match client
        const matchedClient = clients.find(c => 
          c.name.toLowerCase().includes(cliente.toLowerCase()) ||
          cliente.toLowerCase().includes(c.name.toLowerCase())
        );
        clientId = matchedClient?.id;
      }

      // Parse product line
      const qty = parseFloat(cantidad);
      const price = parseFloat(precio);

      if (isNaN(qty) || qty <= 0) {
        errors.push(`Línea ${index + 2}: Cantidad inválida "${cantidad}"`);
        return;
      }

      if (isNaN(price) || price <= 0) {
        errors.push(`Línea ${index + 2}: Precio inválido "${precio}"`);
        return;
      }

      // Try to match product
      const matchedProduct = products.find(p =>
        p.name.toLowerCase().includes(producto.toLowerCase()) ||
        producto.toLowerCase().includes(p.name.toLowerCase())
      );

      parsedLines.push({
        productName: producto,
        quantity: qty,
        unitPrice: price,
        productId: matchedProduct?.id,
        error: matchedProduct ? undefined : 'Producto no encontrado en catálogo'
      });
    });

    return {
      ncfSuffix,
      invoiceDate,
      clientName,
      clientId,
      lines: parsedLines,
      errors
    };
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

  const handleImport = () => {
    if (!preview) return;

    const validLines = preview.lines
      .filter(l => l.productId)
      .map(l => ({
        productId: l.productId!,
        quantity: l.quantity,
        unitPrice: l.unitPrice
      }));

    if (validLines.length === 0) {
      toast.error('No hay productos válidos para importar');
      return;
    }

    onImport({
      ncfSuffix: preview.ncfSuffix,
      invoiceDate: preview.invoiceDate,
      clientId: preview.clientId,
      lines: validLines
    });

    toast.success(`${validLines.length} productos importados`);
    setOpen(false);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetImport = () => {
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetImport(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Importar CSV</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Importar Factura desde CSV
          </DialogTitle>
          <DialogDescription>
            Sube un archivo CSV con los datos de la factura. Descarga el template para ver el formato requerido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
            <div>
              <p className="text-sm font-medium">Template CSV</p>
              <p className="text-xs text-muted-foreground">Descarga el formato requerido</p>
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
          {preview && (
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">NCF:</span>
                  <span className="ml-2 font-mono font-medium">B010000{preview.ncfSuffix}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha:</span>
                  <span className="ml-2 font-medium">{preview.invoiceDate.toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="ml-1 font-medium truncate">{preview.clientName}</span>
                  {preview.clientId ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                </div>
              </div>

              {/* Errors */}
              {preview.errors.length > 0 && (
                <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                  {preview.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              )}

              {/* Lines preview */}
              <div className="space-y-1 max-h-48 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground uppercase">Productos ({preview.lines.length})</p>
                {preview.lines.map((line, i) => (
                  <div key={i} className={`flex items-center justify-between p-2 rounded text-sm ${line.productId ? 'bg-background' : 'bg-amber-50 dark:bg-amber-950/20'}`}>
                    <div className="flex items-center gap-2">
                      {line.productId ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      )}
                      <span className="font-medium">{line.productName}</span>
                      {line.error && <span className="text-xs text-amber-600">({line.error})</span>}
                    </div>
                    <div className="text-muted-foreground">
                      {line.quantity} × ${line.unitPrice.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          {preview && (
            <Button 
              onClick={handleImport} 
              disabled={loading || preview.lines.filter(l => l.productId).length === 0}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Importar {preview.lines.filter(l => l.productId).length} productos
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
