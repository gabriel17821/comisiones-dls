import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Upload, Download, FileText, AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { parse, format } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import { normalizeText, bestFuzzyMatch } from '@/lib/textMatch';

interface Product {
  id: string;
  name: string;
  percentage: number;
}

interface Client {
  id: string;
  name: string;
}

interface ParsedRow {
  lineNumber: number;
  ncfSuffix: string;
  fecha: string;
  cliente: string;
  producto: string;
  cantidad: string;
  precioUnitario: string;
  isValid: boolean;
  errors: string[];
  // Resolved values (only if valid)
  resolvedDate?: Date;
  resolvedQuantity?: number;
  resolvedUnitPrice?: number;
  resolvedProductId?: string;
  resolvedProductName?: string; // Nombre del producto matcheado
  resolvedClientId?: string;
  resolvedClientName?: string; // Nombre del cliente matcheado
}

interface GroupedInvoice {
  ncfSuffix: string;
  date: Date;
  clientName: string;
  clientId?: string;
  rows: ParsedRow[];
  hasErrors: boolean;
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

// Simple date parser - tries common formats
function parseDate(str: string): Date | null {
  const trimmed = str.trim();
  if (!trimmed) return null;

  const formats = ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'd/M/yyyy', 'dd-MM-yyyy'];

  for (const fmt of formats) {
    try {
      const d = parse(trimmed, fmt, new Date());
      if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
        return d;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function matchProduct(name: string, products: Product[]): Product | undefined {
  const input = normalizeText(name);
  if (!input) return undefined;

  const exact = products.find((p) => normalizeText(p.name) === input);
  if (exact) return exact;

  const { match } = bestFuzzyMatch(name, products, { minScore: 0.62 });
  return match;
}

function matchClient(name: string, clients: Client[]): Client | undefined {
  const input = normalizeText(name);
  if (!input) return undefined;

  const exact = clients.find((c) => normalizeText(c.name) === input);
  if (exact) return exact;

  const { match } = bestFuzzyMatch(name, clients, { minScore: 0.68 });
  return match;
}

export const CSVInvoiceImporter = ({ products, clients, onImport, onBulkImport }: CSVInvoiceImporterProps) => {
  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [groupedInvoices, setGroupedInvoices] = useState<GroupedInvoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const template = `NCF_SUFFIX,FECHA,CLIENTE,PRODUCTO,CANTIDAD,PRECIO_UNITARIO
0001,2024-01-15,Farmacia Central,Azetabio Repelente antimosquitos organico 100ml,10,150.00
0001,2024-01-15,Farmacia Central,Otro Producto,5,200.50
0002,2024-01-16,Farmacia Norte,AZETABIO REPELENTE ANTIMOSQUITOS,8,150.00
0002,2024-01-16,Farmacia Norte,Producto C,3,300.00`;

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_facturas.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Template descargado');
  };

  /**
   * STRICT PARSER: 6 columnas exactas por fila. No infiere totales ni concatena.
   * La “inteligencia” ocurre únicamente al hacer matching de producto/cliente.
   */
  const parseCSVStrict = (text: string): ParsedRow[] => {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    const rows: ParsedRow[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',').map((p) => p.trim());

      // Skip header row (check first column)
      const firstCol = parts[0]?.toLowerCase() || '';
      if (firstCol.includes('ncf') || firstCol.includes('suffix') || firstCol === 'fecha') {
        continue;
      }

      const errors: string[] = [];

      if (parts.length !== 6) {
        errors.push(`Columnas inválidas (tiene ${parts.length}, necesita 6)`);
      }

      const [ncfRaw, fecha, cliente, producto, cantidad, precioUnitario] = parts;

      // Extraer últimos 4 dígitos del NCF (soporta "B0100002904" o "2904")
      const ncfDigits = (ncfRaw || '').replace(/\D/g, '');
      const ncfSuffix = ncfDigits.slice(-4).padStart(4, '0');

      if (!ncfDigits) errors.push('NCF vacío');
      if (!fecha) errors.push('Fecha vacía');
      if (!producto) errors.push('Producto vacío');
      if (!cantidad) errors.push('Cantidad vacía');
      if (!precioUnitario) errors.push('Precio vacío');

      const row: ParsedRow = {
        lineNumber: i + 1,
        ncfSuffix,
        fecha: fecha || '',
        cliente: cliente || '',
        producto: producto || '',
        cantidad: cantidad || '',
        precioUnitario: precioUnitario || '',
        isValid: errors.length === 0,
        errors,
      };

      if (row.isValid) {
        // Parse date
        const parsedDate = parseDate(row.fecha);
        if (!parsedDate) {
          row.errors.push('Fecha inválida');
          row.isValid = false;
        } else {
          row.resolvedDate = parsedDate;
        }

        // Parse quantity
        const qtyStr = row.cantidad.replace(/[^\d.,-]/g, '').replace(',', '.');
        const qty = parseFloat(qtyStr);
        if (isNaN(qty) || qty <= 0) {
          row.errors.push(`Cantidad inválida: "${row.cantidad}"`);
          row.isValid = false;
        } else {
          row.resolvedQuantity = qty;
        }

        // Parse price
        const priceStr = row.precioUnitario.replace(/[^\d.,-]/g, '').replace(',', '.');
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) {
          row.errors.push(`Precio inválido: "${row.precioUnitario}"`);
          row.isValid = false;
        } else {
          row.resolvedUnitPrice = price;
        }

        // Match product with fuzzy logic
        const matchedProduct = matchProduct(row.producto, products);
        if (!matchedProduct) {
          row.errors.push(`Producto no encontrado: "${row.producto}"`);
          row.isValid = false;
        } else {
          row.resolvedProductId = matchedProduct.id;
          row.resolvedProductName = matchedProduct.name;
        }

        // Match client with fuzzy logic
        const matchedClient = matchClient(row.cliente, clients);
        if (matchedClient) {
          row.resolvedClientId = matchedClient.id;
          row.resolvedClientName = matchedClient.name;
        }
      }

      rows.push(row);
    }

    return rows;
  };

  const groupRowsByNCF = (rows: ParsedRow[]): GroupedInvoice[] => {
    const groups = new Map<string, GroupedInvoice>();

    for (const row of rows) {
      const ncf = row.ncfSuffix.replace(/\D/g, '').slice(-4).padStart(4, '0');
      if (!ncf || ncf === '0000') continue;

      if (!groups.has(ncf)) {
        groups.set(ncf, {
          ncfSuffix: ncf,
          date: row.resolvedDate || new Date(),
          clientName: row.cliente,
          clientId: row.resolvedClientId,
          rows: [],
          hasErrors: false,
          total: 0,
        });
      }

      const group = groups.get(ncf)!;
      group.rows.push(row);

      if (!row.isValid) {
        group.hasErrors = true;
      } else if (row.resolvedQuantity && row.resolvedUnitPrice) {
        group.total += row.resolvedQuantity * row.resolvedUnitPrice;
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.ncfSuffix.localeCompare(b.ncfSuffix));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSVStrict(text);
      setParsedRows(rows);

      if (rows.length === 0) {
        toast.error('No se encontraron datos en el archivo');
        setGroupedInvoices(null);
      } else {
        const groups = groupRowsByNCF(rows);
        setGroupedInvoices(groups);

        const validCount = rows.filter((r) => r.isValid).length;
        const invalidCount = rows.filter((r) => !r.isValid).length;

        if (invalidCount > 0) toast.warning(`${validCount} filas válidas, ${invalidCount} con errores`);
        else toast.success(`${validCount} filas procesadas correctamente`);
      }

      setLoading(false);
    };

    reader.onerror = () => {
      toast.error('Error al leer el archivo');
      setLoading(false);
    };

    reader.readAsText(file);
  };

  const resetImport = () => {
    setParsedRows(null);
    setGroupedInvoices(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (!groupedInvoices || groupedInvoices.length === 0) return;

    const validInvoices = groupedInvoices
      .filter((inv) => !inv.hasErrors && inv.rows.some((r) => r.isValid && r.resolvedProductId))
      .map((inv) => ({
        ncfSuffix: inv.ncfSuffix,
        invoiceDate: inv.date,
        clientId: inv.clientId,
        lines: inv.rows
          .filter((r) => r.isValid && r.resolvedProductId && r.resolvedQuantity && r.resolvedUnitPrice)
          .map((r) => ({
            productId: r.resolvedProductId!,
            quantity: r.resolvedQuantity!,
            unitPrice: r.resolvedUnitPrice!,
          })),
      }))
      .filter((inv) => inv.lines.length > 0);

    if (validInvoices.length === 0) {
      toast.error('No hay facturas válidas para importar');
      return;
    }

    setImporting(true);

    try {
      if (validInvoices.length === 1) {
        const inv = validInvoices[0];
        onImport({
          ncfSuffix: inv.ncfSuffix,
          invoiceDate: inv.invoiceDate,
          clientId: inv.clientId,
          lines: inv.lines,
        });
        toast.success(`Factura B010000${inv.ncfSuffix} importada`);
      } else if (onBulkImport) {
        await onBulkImport(validInvoices);
        toast.success(`${validInvoices.length} facturas importadas`);
      } else {
        const inv = validInvoices[0];
        onImport({
          ncfSuffix: inv.ncfSuffix,
          invoiceDate: inv.invoiceDate,
          clientId: inv.clientId,
          lines: inv.lines,
        });
        toast.success(`Primera factura importada (${validInvoices.length - 1} pendientes)`);
      }

      setOpen(false);
      resetImport();
    } catch (error) {
      toast.error('Error al importar');
      console.error(error);
    } finally {
      setImporting(false);
    }
  };

  const validInvoicesCount = groupedInvoices?.filter((inv) => !inv.hasErrors && inv.rows.some((r) => r.isValid)).length || 0;
  const totalRowsValid = parsedRows?.filter((r) => r.isValid).length || 0;
  const totalRowsInvalid = parsedRows?.filter((r) => !r.isValid).length || 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetImport();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2">
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Importar CSV</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Importar Facturas desde CSV
          </DialogTitle>
          <DialogDescription>
            6 columnas exactas: NCF_SUFFIX, FECHA, CLIENTE, PRODUCTO, CANTIDAD, PRECIO_UNITARIO
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
            <div>
              <p className="text-sm font-medium">Template CSV</p>
              <p className="text-xs text-muted-foreground">NCF_SUFFIX, FECHA, CLIENTE, PRODUCTO, CANTIDAD, PRECIO_UNITARIO</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" />
              Descargar
            </Button>
          </div>

          <label
            htmlFor="csv-invoices"
            className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer bg-muted/20 hover:bg-muted/40 transition-colors"
          >
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Procesando...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4">
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold">Haz clic para subir</span> archivo CSV
                </p>
              </div>
            )}
            <input
              id="csv-invoices"
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileChange}
              disabled={loading}
            />
          </label>

          {groupedInvoices && groupedInvoices.length > 0 && (
            <div className="space-y-3">
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">
                    {validInvoicesCount} factura{validInvoicesCount !== 1 ? 's' : ''} lista{validInvoicesCount !== 1 ? 's' : ''} para importar
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {totalRowsValid} filas válidas
                    {totalRowsInvalid > 0 && <span className="text-destructive"> · {totalRowsInvalid} con errores</span>}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={resetImport}>
                  Limpiar
                </Button>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-3 border rounded-lg p-3">
                {groupedInvoices.map((inv) => (
                  <div
                    key={inv.ncfSuffix}
                    className={`p-3 rounded-lg border ${inv.hasErrors ? 'bg-destructive/5 border-destructive/30' : 'bg-card'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {inv.hasErrors ? (
                          <XCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        )}
                        <span className="font-mono font-bold">B010000{inv.ncfSuffix}</span>
                        <span className="text-xs text-muted-foreground">{format(inv.date, 'dd/MM/yyyy')}</span>
                      </div>
                      <span className="text-sm font-semibold">{formatCurrency(inv.total)}</span>
                    </div>

                    {/* Show matched client */}
                    {inv.rows[0]?.resolvedClientName && (
                      <div className="text-xs mb-2 flex items-center gap-1">
                        <span className="text-muted-foreground">Cliente:</span>
                        <span className="font-medium text-primary">{inv.rows[0].resolvedClientName}</span>
                        {inv.rows[0].resolvedClientName !== inv.clientName && (
                          <span className="text-muted-foreground/60 italic">← {inv.clientName}</span>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      {inv.rows.map((r) => (
                        <div key={`${inv.ncfSuffix}-${r.lineNumber}`} className="text-xs">
                          {r.isValid ? (
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground shrink-0">L{r.lineNumber}</span>
                                  <span className="font-medium text-primary truncate">{r.resolvedProductName}</span>
                                </div>
                                {r.resolvedProductName !== r.producto && (
                                  <div className="text-[10px] text-muted-foreground/60 italic pl-5 truncate">
                                    ← {r.producto}
                                  </div>
                                )}
                              </div>
                              <span className="text-muted-foreground shrink-0">
                                {r.resolvedQuantity} × {formatCurrency(r.resolvedUnitPrice || 0)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2 text-destructive">
                              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium truncate">L{r.lineNumber}: {r.producto || '(sin producto)'}</p>
                                <p className="text-[11px] opacity-90">{r.errors.join(' · ')}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={importing || !groupedInvoices || validInvoicesCount === 0}>
            {importing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Importando...
              </span>
            ) : (
              'Importar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
