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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Upload, Download, FileText, AlertCircle, CheckCircle2, Loader2, XCircle, ArrowRight, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { parse, format } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import {
  findSavedProductMatch,
  findSavedClientMatch,
  saveProductMatch,
  saveClientMatch,
} from '@/lib/matchingStore';

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
  cantidad: number;
  precioUnitario: number;
  isValid: boolean;
  errors: string[];
  // Resolved
  resolvedDate?: Date;
  resolvedProductId?: string;
  resolvedProductName?: string;
  resolvedClientId?: string;
  resolvedClientName?: string;
  needsManualProductMatch?: boolean;
  needsManualClientMatch?: boolean;
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

// Parse date - supports common formats
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

// Parse number from string
function parseNumber(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[^\d.,-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

// Extract NCF suffix (last 4 digits)
function extractNcfSuffix(ncfRaw: string): string {
  const digits = (ncfRaw || '').replace(/\D/g, '');
  return digits.slice(-4).padStart(4, '0');
}

// Normalize text for robust matching
function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const CSVInvoiceImporter = ({ products, clients, onImport, onBulkImport }: CSVInvoiceImporterProps) => {
  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [groupedInvoices, setGroupedInvoices] = useState<GroupedInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [manualMatches, setManualMatches] = useState<Record<string, { productId?: string; clientId?: string }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const template = `NCF_SUFFIX,FECHA,CLIENTE,PRODUCTO,CANTIDAD,PRECIO_UNITARIO
B0100002904,2024-10-31,FARMACIA MARIA PICHARDO SRL,PLEXGRIP JARABE ANTIGRIPAL 120 ML,6,185.0
B0100002904,2024-10-31,FARMACIA MARIA PICHARDO SRL,AMBROXOL JARABE 120 ML,6,145.0
B0100002905,2024-11-01,FARMACIA CENTRAL,CETERIPLEX CETIRIZINA TAB 1/100,3,900.0`;

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_facturas.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Template descargado');
  };

  /**
   * STRICT PARSER for format:
   * NCF_SUFFIX,FECHA,CLIENTE,PRODUCTO,CANTIDAD,PRECIO_UNITARIO
   */
  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    const rows: ParsedRow[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',').map((p) => p.trim());

      // Skip header row
      const firstCol = parts[0]?.toLowerCase() || '';
      if (firstCol.includes('ncf') || firstCol.includes('suffix') || firstCol === 'fecha') {
        continue;
      }

      // Must have exactly 6 columns
      if (parts.length !== 6) {
        rows.push({
          lineNumber: i + 1,
          ncfSuffix: '',
          fecha: '',
          cliente: '',
          producto: '',
          cantidad: 0,
          precioUnitario: 0,
          isValid: false,
          errors: [`Línea ${i + 1}: necesita 6 columnas, tiene ${parts.length}`],
        });
        continue;
      }

      const [ncfRaw, fecha, cliente, producto, cantidadStr, precioStr] = parts;
      const errors: string[] = [];

      // Parse each field
      const ncfSuffix = extractNcfSuffix(ncfRaw);
      if (!ncfSuffix || ncfSuffix === '0000') {
        errors.push('NCF inválido');
      }

      const parsedDate = parseDate(fecha);
      if (!parsedDate) {
        errors.push('Fecha inválida');
      }

      const cantidad = parseNumber(cantidadStr);
      if (cantidad === null) {
        errors.push(`Cantidad inválida: "${cantidadStr}"`);
      }

      const precioUnitario = parseNumber(precioStr);
      if (precioUnitario === null) {
        errors.push(`Precio inválido: "${precioStr}"`);
      }

      if (!producto) {
        errors.push('Producto vacío');
      }

      // Try to match product (first check saved matches, then exact match)
      let resolvedProductId: string | undefined;
      let resolvedProductName: string | undefined;
      let needsManualProductMatch = false;

      const savedProductMatch = findSavedProductMatch(producto);
      if (savedProductMatch) {
        // Verify the saved match still exists
        const productExists = products.find(p => p.id === savedProductMatch.matchedId);
        if (productExists) {
          resolvedProductId = productExists.id;
          resolvedProductName = productExists.name;
        }
      }

      if (!resolvedProductId) {
        // Try exact match (normalized)
        const normalizedProducto = normalizeText(producto);
        const exactMatch = products.find(p => normalizeText(p.name) === normalizedProducto);
        if (exactMatch) {
          resolvedProductId = exactMatch.id;
          resolvedProductName = exactMatch.name;
        } else {
          needsManualProductMatch = true;
        }
      }

      // Try to match client
      let resolvedClientId: string | undefined;
      let resolvedClientName: string | undefined;
      let needsManualClientMatch = false;

      const savedClientMatch = findSavedClientMatch(cliente);
      if (savedClientMatch) {
        const clientExists = clients.find(c => c.id === savedClientMatch.matchedId);
        if (clientExists) {
          resolvedClientId = clientExists.id;
          resolvedClientName = clientExists.name;
        }
      }

      if (!resolvedClientId && cliente) {
        const normalizedCliente = normalizeText(cliente);
        const exactMatch = clients.find(c => normalizeText(c.name) === normalizedCliente);
        if (exactMatch) {
          resolvedClientId = exactMatch.id;
          resolvedClientName = exactMatch.name;
        } else {
          needsManualClientMatch = true;
        }
      }

      rows.push({
        lineNumber: i + 1,
        ncfSuffix,
        fecha,
        cliente,
        producto,
        cantidad: cantidad || 0,
        precioUnitario: precioUnitario || 0,
        isValid: errors.length === 0,
        errors,
        resolvedDate: parsedDate || undefined,
        resolvedProductId,
        resolvedProductName,
        resolvedClientId,
        resolvedClientName,
        needsManualProductMatch,
        needsManualClientMatch,
      });
    }

    return rows;
  };

  const groupRowsByNCF = (rows: ParsedRow[]): GroupedInvoice[] => {
    const groups = new Map<string, GroupedInvoice>();

    for (const row of rows) {
      if (!row.isValid || !row.ncfSuffix || row.ncfSuffix === '0000') continue;

      if (!groups.has(row.ncfSuffix)) {
        groups.set(row.ncfSuffix, {
          ncfSuffix: row.ncfSuffix,
          date: row.resolvedDate || new Date(),
          clientName: row.cliente,
          clientId: row.resolvedClientId,
          rows: [],
          hasErrors: false,
          total: 0,
        });
      }

      const group = groups.get(row.ncfSuffix)!;
      group.rows.push(row);

      // Check if any row needs manual match
      if (row.needsManualProductMatch && !manualMatches[`p-${row.producto}`]?.productId) {
        group.hasErrors = true;
      }

      if (row.cantidad && row.precioUnitario) {
        group.total += row.cantidad * row.precioUnitario;
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.ncfSuffix.localeCompare(b.ncfSuffix));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setManualMatches({});

    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      setParsedRows(rows);

      if (rows.length === 0) {
        toast.error('No se encontraron datos en el archivo');
        setGroupedInvoices([]);
      } else {
        const groups = groupRowsByNCF(rows);
        setGroupedInvoices(groups);

        const validCount = rows.filter((r) => r.isValid).length;
        const needsMatchCount = rows.filter((r) => r.needsManualProductMatch).length;

        if (needsMatchCount > 0) {
          toast.warning(`${validCount} filas, ${needsMatchCount} necesitan matching manual`);
        } else {
          toast.success(`${validCount} filas procesadas`);
        }
      }

      setLoading(false);
    };

    reader.onerror = () => {
      toast.error('Error al leer el archivo');
      setLoading(false);
    };

    reader.readAsText(file);
  };

  const handleManualProductMatch = (csvProductName: string, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // Save to persistent storage
    saveProductMatch(csvProductName, productId, product.name);

    // Update local state
    setManualMatches(prev => ({
      ...prev,
      [`p-${csvProductName}`]: { productId }
    }));

    // Update parsed rows
    setParsedRows(prev => prev.map(row => {
      if (row.producto === csvProductName) {
        return {
          ...row,
          resolvedProductId: productId,
          resolvedProductName: product.name,
          needsManualProductMatch: false,
        };
      }
      return row;
    }));

    toast.success(`Match guardado: ${csvProductName} → ${product.name}`);
  };

  const handleManualClientMatch = (csvClientName: string, clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    // Save to persistent storage
    saveClientMatch(csvClientName, clientId, client.name);

    // Update local state
    setManualMatches(prev => ({
      ...prev,
      [`c-${csvClientName}`]: { clientId }
    }));

    // Update parsed rows
    setParsedRows(prev => prev.map(row => {
      if (row.cliente === csvClientName) {
        return {
          ...row,
          resolvedClientId: clientId,
          resolvedClientName: client.name,
          needsManualClientMatch: false,
        };
      }
      return row;
    }));

    toast.success(`Match guardado: ${csvClientName} → ${client.name}`);
  };

  const resetImport = () => {
    setParsedRows([]);
    setGroupedInvoices([]);
    setManualMatches({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    // Regroup with updated rows
    const groups = groupRowsByNCF(parsedRows);

    const validInvoices = groups
      .filter((inv) => inv.rows.every(r => r.resolvedProductId))
      .map((inv) => ({
        ncfSuffix: inv.ncfSuffix,
        invoiceDate: inv.date,
        clientId: inv.rows[0]?.resolvedClientId,
        lines: inv.rows
          .filter((r) => r.resolvedProductId && r.cantidad > 0 && r.precioUnitario > 0)
          .map((r) => ({
            productId: r.resolvedProductId!,
            quantity: r.cantidad,
            unitPrice: r.precioUnitario,
          })),
      }))
      .filter((inv) => inv.lines.length > 0);

    if (validInvoices.length === 0) {
      toast.error('No hay facturas válidas para importar. Completa el matching de productos.');
      return;
    }

    setImporting(true);

    try {
      if (validInvoices.length === 1) {
        onImport(validInvoices[0]);
        toast.success(`Factura B010000${validInvoices[0].ncfSuffix} importada`);
      } else if (onBulkImport) {
        await onBulkImport(validInvoices);
        toast.success(`${validInvoices.length} facturas importadas`);
      } else {
        onImport(validInvoices[0]);
        toast.success(`Primera factura importada`);
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

  // Get unique unmatched products
  const unmatchedProducts = Array.from(
    new Set(parsedRows.filter(r => r.needsManualProductMatch && !r.resolvedProductId).map(r => r.producto))
  );

  // Get unique unmatched clients
  const unmatchedClients = Array.from(
    new Set(parsedRows.filter(r => r.needsManualClientMatch && !r.resolvedClientId).map(r => r.cliente))
  ).filter(Boolean);

  const allProductsMatched = unmatchedProducts.length === 0;
  const validRows = parsedRows.filter(r => r.isValid);
  const canImport = validRows.length > 0 && allProductsMatched;

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

      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Importar Facturas desde CSV
          </DialogTitle>
          <DialogDescription>
            Formato: NCF_SUFFIX, FECHA, CLIENTE, PRODUCTO, CANTIDAD, PRECIO_UNITARIO
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
            <div>
              <p className="text-sm font-medium">Template CSV</p>
              <p className="text-xs text-muted-foreground">B0100002904,2024-10-31,CLIENTE,PRODUCTO,6,185.0</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" />
              Descargar
            </Button>
          </div>

          {/* File upload */}
          <label
            htmlFor="csv-invoices"
            className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer bg-muted/20 hover:bg-muted/40 transition-colors"
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

          {/* Manual matching section */}
          {unmatchedProducts.length > 0 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 space-y-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">Productos sin match ({unmatchedProducts.length})</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Selecciona el producto correcto del catálogo. El match se guardará para futuras importaciones.
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {unmatchedProducts.map((csvName) => (
                  <div key={csvName} className="flex items-center gap-2 p-2 bg-background rounded border">
                    <span className="text-sm font-medium flex-1 truncate">{csvName}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <ProductSearchSelect
                      products={products}
                      onSelect={(productId) => handleManualProductMatch(csvName, productId)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unmatched clients */}
          {unmatchedClients.length > 0 && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">Clientes sin match ({unmatchedClients.length})</span>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {unmatchedClients.map((csvName) => (
                  <div key={csvName} className="flex items-center gap-2 p-2 bg-background rounded border">
                    <span className="text-sm font-medium flex-1 truncate">{csvName}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select onValueChange={(value) => handleManualClientMatch(csvName, value)}>
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Seleccionar cliente..." />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">
                    {validRows.length} líneas válidas
                  </p>
                  {!allProductsMatched && (
                    <p className="text-xs text-amber-600">
                      {unmatchedProducts.length} productos pendientes de match
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={resetImport}>
                  Limpiar
                </Button>
              </div>

              <div className="max-h-60 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">NCF</th>
                      <th className="px-2 py-1.5 text-left font-medium">Fecha</th>
                      <th className="px-2 py-1.5 text-left font-medium">Producto</th>
                      <th className="px-2 py-1.5 text-right font-medium">Cant</th>
                      <th className="px-2 py-1.5 text-right font-medium">Precio</th>
                      <th className="px-2 py-1.5 text-right font-medium">Total</th>
                      <th className="px-2 py-1.5 text-center font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? '' : 'bg-destructive/5'}>
                        <td className="px-2 py-1.5 font-mono">{row.ncfSuffix}</td>
                        <td className="px-2 py-1.5">{row.fecha}</td>
                        <td className="px-2 py-1.5">
                          {row.resolvedProductName ? (
                            <div>
                              <span className="text-primary font-medium">{row.resolvedProductName}</span>
                              {row.resolvedProductName !== row.producto && (
                                <span className="block text-[10px] text-muted-foreground italic">← {row.producto}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-amber-600">{row.producto}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">{row.cantidad}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(row.precioUnitario)}</td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          {formatCurrency(row.cantidad * row.precioUnitario)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {row.isValid && row.resolvedProductId ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                          ) : row.isValid ? (
                            <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={importing || !canImport}>
            {importing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Importando...
              </span>
            ) : (
              `Importar${validRows.length > 0 ? ` (${validRows.length} líneas)` : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Componente para buscar productos
const ProductSearchSelect = ({
  products,
  onSelect,
}: {
  products: Product[];
  onSelect: (productId: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-64 justify-between"
        >
          {value
            ? products.find((p) => p.id === value)?.name
            : 'Seleccionar producto...'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar producto..." />
          <CommandList>
            <CommandEmpty>No se encontraron productos.</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => {
                    setValue(p.id);
                    onSelect(p.id);
                    setOpen(false);
                  }}
                >
                  {p.name} ({p.percentage}%)
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
