import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RotateCcw, Calculator, Package, CalendarIcon, FileText, User, Save, RefreshCw, DollarSign, Plus, Search, X, Settings, Upload, Download } from "lucide-react";
import { BreakdownTable } from "@/components/BreakdownTable";
import { ProductCatalogDialog } from "@/components/ProductCatalogDialog";
import { ClientSearchSelect } from "@/components/ClientSearchSelect";
import { SaveSuccessAnimation } from "@/components/SaveSuccessAnimation";
import { InvoicePreviewDialog } from "@/components/InvoicePreviewDialog";
import { InvoiceLineItem } from "@/components/InvoiceLineItem";
import { CSVInvoiceImporter } from "@/components/CSVInvoiceImporter";
import { formatNumber, formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { es } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Invoice } from "@/hooks/useInvoices";
import { Client } from "@/hooks/useClients";
import { Seller } from "@/hooks/useSellers";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Product {
  id: string;
  name: string;
  percentage: number;
  color: string;
  is_default: boolean;
}

interface ProductLineData {
  productId: string;
  quantity: number;
  unitPrice: number;
}

interface Breakdown {
  name: string;
  label: string;
  amount: number;
  percentage: number;
  commission: number;
  color: string;
}

interface Calculations {
  breakdown: Breakdown[];
  restAmount: number;
  restCommission: number;
  totalCommission: number;
}

interface CalculatorViewProps {
  products: Product[];
  productAmounts: Record<string, number>;
  totalInvoice: number;
  setTotalInvoice: (value: number) => void;
  calculations: Calculations;
  isLoading: boolean;
  onProductChange: (id: string, value: number) => void;
  onReset: () => void;
  onAddProduct: (name: string, percentage: number) => Promise<any>;
  onUpdateProduct: (id: string, updates: Partial<Product>) => Promise<boolean>;
  onDeleteProduct: (id: string) => void;
  onSaveInvoice: (ncf: string, invoiceDate: string, clientId?: string) => Promise<any>;
  suggestedNcf?: number | null;
  lastInvoice?: Invoice;
  clients: Client[];
  onAddClient: (name: string, phone?: string, email?: string) => Promise<Client | null>;
  onDeleteClient?: (id: string) => Promise<boolean>;
  activeSeller?: Seller | null;
}

export const CalculatorView = ({
  products,
  productAmounts,
  totalInvoice,
  setTotalInvoice,
  isLoading,
  onProductChange,
  onReset,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onSaveInvoice,
  suggestedNcf,
  clients,
  onAddClient,
  onDeleteClient,
  activeSeller,
}: CalculatorViewProps) => {
  // Invoice header data
  const [ncfSuffix, setNcfSuffix] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  
  // Product lines with quantity and price
  const [productLines, setProductLines] = useState<ProductLineData[]>([]);
  
  // UI State
  const [showSaveAnimation, setShowSaveAnimation] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPercentage, setNewProductPercentage] = useState(15);
  const [addLoading, setAddLoading] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const ncfPrefix = 'B010000';

  useEffect(() => {
    if (suggestedNcf !== null && suggestedNcf !== undefined) {
      setNcfSuffix(String(suggestedNcf).padStart(4, '0'));
    }
  }, [suggestedNcf]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate totals from product lines (sin resto)
  const calculations = useMemo(() => {
    const breakdown: Breakdown[] = [];
    let invoiceTotal = 0;

    productLines.forEach(line => {
      const product = products.find(p => p.id === line.productId);
      if (product && line.quantity > 0 && line.unitPrice > 0) {
        const lineTotal = line.quantity * line.unitPrice;
        const commission = lineTotal * (product.percentage / 100);
        breakdown.push({
          name: product.name,
          label: product.name,
          amount: lineTotal,
          percentage: product.percentage,
          commission,
          color: product.color,
        });
        invoiceTotal += lineTotal;
      }
    });

    const totalCommission = breakdown.reduce((sum, item) => sum + item.commission, 0);

    return { breakdown, restAmount: 0, restCommission: 0, totalCommission, specialProductsTotal: invoiceTotal, invoiceTotal };
  }, [productLines, products]);

  const activeProductIds = productLines.map(l => l.productId);
  const filteredCatalog = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
    !activeProductIds.includes(p.id)
  );

  const handleAddLine = (productId: string) => {
    setProductLines(prev => [...prev, { productId, quantity: 0, unitPrice: 0 }]);
    setSearchTerm('');
    setShowSearch(false);
    toast.success("Producto agregado");
  };

  const handleRemoveLine = (productId: string) => {
    setProductLines(prev => prev.filter(l => l.productId !== productId));
    onProductChange(productId, 0);
  };

  const handleQuantityChange = (productId: string, quantity: number) => {
    setProductLines(prev => {
      const updated = prev.map(l => 
        l.productId === productId ? { ...l, quantity } : l
      );
      // Update external productAmounts
      const line = updated.find(l => l.productId === productId);
      if (line) {
        onProductChange(productId, line.quantity * line.unitPrice);
      }
      return updated;
    });
  };

  const handleUnitPriceChange = (productId: string, unitPrice: number) => {
    setProductLines(prev => {
      const updated = prev.map(l => 
        l.productId === productId ? { ...l, unitPrice } : l
      );
      // Update external productAmounts
      const line = updated.find(l => l.productId === productId);
      if (line) {
        onProductChange(productId, line.quantity * unitPrice);
      }
      return updated;
    });
  };

  const handleNcfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setNcfSuffix(value);
  };

  const handleReset = useCallback(() => {
    setNcfSuffix('');
    setInvoiceDate(new Date());
    setSelectedClient(null);
    setProductLines([]);
    setTotalInvoice(0);
    onReset();
  }, [onReset, setTotalInvoice]);

  const handleConfirmSave = async () => {
    setIsSaving(true);
    setShowPreviewDialog(false);
    setShowSaveAnimation(true);
    const fullNcf = `${ncfPrefix}${ncfSuffix.padStart(4, '0')}`;
    
    await onSaveInvoice(fullNcf, format(invoiceDate, 'yyyy-MM-dd'), selectedClient?.id);
    setIsSaving(false);
  };

  const handleAnimationComplete = useCallback(() => {
    setShowSaveAnimation(false);
    handleReset();
  }, [handleReset]);

  const handleCreateAndAdd = async () => {
    if (!newProductName.trim()) return;
    setAddLoading(true);
    const newProduct = await onAddProduct(newProductName.trim(), newProductPercentage);
    setAddLoading(false);
    if (newProduct) {
      handleAddLine(newProduct.id);
      setNewProductName('');
      setNewProductPercentage(15);
      setShowAddDialog(false);
    }
  };

  const fullNcf = `${ncfPrefix}${ncfSuffix.padStart(4, '0')}`;
  const hasProducts = productLines.length > 0;
  const actualTotal = calculations.specialProductsTotal > 0 ? calculations.specialProductsTotal : totalInvoice;
  const hasValidData = ncfSuffix.length === 4 && selectedClient && actualTotal > 0;

  return (
    <div className="animate-fade-in">
      <SaveSuccessAnimation show={showSaveAnimation} onComplete={handleAnimationComplete} />
      
      <div className="max-w-4xl mx-auto">
        <Card className="overflow-hidden card-shadow">
          {/* Header */}
          <div className="gradient-primary px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-primary-foreground">Nueva Factura</h1>
                  <p className="text-primary-foreground/70 text-sm">
                    {activeSeller ? `Vendedor: ${activeSeller.name}` : 'Registro de ventas con comisiones'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CSVInvoiceImporter 
                  products={products}
                  clients={clients}
                  onImport={(data) => {
                    setNcfSuffix(data.ncfSuffix);
                    setInvoiceDate(data.invoiceDate);
                    if (data.clientId) {
                      const client = clients.find(c => c.id === data.clientId);
                      setSelectedClient(client || null);
                    }
                    setProductLines(data.lines.map(l => ({
                      productId: l.productId,
                      quantity: l.quantity,
                      unitPrice: l.unitPrice
                    })));
                  }}
                />
                <ProductCatalogDialog 
                  products={products}
                  onUpdateProduct={onUpdateProduct}
                  onDeleteProduct={onDeleteProduct}
                  onAddProduct={onAddProduct}
                />
              </div>
            </div>
          </div>

          {/* Invoice Header Row */}
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Date */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !invoiceDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {invoiceDate ? format(invoiceDate, "dd/MM/yyyy", { locale: es }) : "Seleccionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={invoiceDate} onSelect={(date) => date && setInvoiceDate(date)} initialFocus locale={es} />
                  </PopoverContent>
                </Popover>
              </div>

              {/* NCF - Prefijo fijo + 4 dígitos editables */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">NCF</Label>
                <div className="flex items-center rounded-lg border border-input bg-background overflow-hidden h-10">
                  <span className="px-3 text-sm font-mono font-medium text-muted-foreground bg-muted border-r border-input h-full flex items-center">
                    {ncfPrefix}
                  </span>
                  <Input
                    value={ncfSuffix}
                    onChange={handleNcfChange}
                    placeholder="0000"
                    maxLength={4}
                    inputMode="numeric"
                    className="border-0 h-full text-sm font-mono font-bold text-center focus-visible:ring-0 rounded-l-none"
                  />
                </div>
              </div>
              {/* Client - Simplified with search */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cliente</Label>
                <ClientSearchSelect
                  clients={clients}
                  value={selectedClient?.id || ''}
                  onChange={(clientId) => {
                    const client = clients.find(c => c.id === clientId);
                    setSelectedClient(client || null);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Add Product Button - ARRIBA */}
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <div ref={searchRef} className="relative">
              {showSearch ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar producto..."
                      className="pl-10 pr-10"
                      autoFocus
                    />
                    <button
                      onClick={() => { setShowSearch(false); setSearchTerm(''); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {searchTerm && (
                    <div className="border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto bg-popover">
                      {filteredCatalog.length > 0 ? (
                        filteredCatalog.map(product => (
                          <button
                            key={product.id}
                            onClick={() => handleAddLine(product.id)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                          >
                            <span 
                              className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0"
                              style={{ backgroundColor: product.color }}
                            >
                              {product.percentage}%
                            </span>
                            <span className="text-sm font-medium flex-1">{product.name}</span>
                            <Plus className="h-4 w-4 text-muted-foreground" />
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-sm text-muted-foreground">
                          No encontrado
                        </div>
                      )}
                      <button
                        onClick={() => { setNewProductName(searchTerm); setShowAddDialog(true); setShowSearch(false); }}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-primary/10 border-t border-border transition-colors text-left"
                      >
                        <div className="h-6 w-6 rounded bg-primary/20 flex items-center justify-center text-primary">
                          <Plus className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-semibold text-primary">Crear "{searchTerm}"</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full border-dashed h-10"
                  onClick={() => setShowSearch(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Producto
                </Button>
              )}
            </div>
          </div>
          {/* Product Lines Header */}
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-4">Producto</div>
              <div className="col-span-2 text-center">Cantidad</div>
              <div className="col-span-2 text-center">Precio Unit.</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-2"></div>
            </div>
          </div>

          {/* Product Lines */}
          <div className="p-4 space-y-2 min-h-[200px]">
            {isLoading ? (
              <div className="h-24 bg-muted animate-pulse rounded-lg" />
            ) : (
              <>
                {productLines.map((line) => {
                  const product = products.find(p => p.id === line.productId);
                  if (!product) return null;
                  return (
                    <InvoiceLineItem
                      key={line.productId}
                      productName={product.name}
                      productColor={product.color}
                      percentage={product.percentage}
                      quantity={line.quantity}
                      unitPrice={line.unitPrice}
                      onQuantityChange={(q) => handleQuantityChange(line.productId, q)}
                      onUnitPriceChange={(p) => handleUnitPriceChange(line.productId, p)}
                      onRemove={() => handleRemoveLine(line.productId)}
                    />
                  );
                })}

                {productLines.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-muted rounded-xl bg-muted/10">
                    <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm font-medium text-muted-foreground">No hay productos en esta factura</p>
                    <p className="text-xs text-muted-foreground mt-1">Usa el botón de arriba para agregar productos</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Totals */}
          <div className="border-t border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Factura</p>
                <p className="text-2xl font-bold text-foreground">${formatNumber(actualTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Mi Comisión</p>
                <p className="text-2xl font-bold text-emerald-600">${formatCurrency(calculations.totalCommission)}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-border flex gap-3">
            <Button 
              className="flex-1 h-12 text-base gradient-primary" 
              disabled={!hasValidData}
              onClick={() => setShowPreviewDialog(true)}
            >
              <FileText className="h-5 w-5 mr-2" />
              Guardar Factura
            </Button>
            <Button variant="outline" onClick={handleReset} className="h-12 px-6">
              <RotateCcw className="h-4 w-4 mr-2" />
              Limpiar
            </Button>
          </div>
        </Card>

        {/* Breakdown Table (if has products) */}
        {hasProducts && actualTotal > 0 && (
          <div className="mt-6 animate-in slide-in-from-bottom-4">
            <BreakdownTable 
              totalInvoice={actualTotal} 
              breakdown={calculations.breakdown} 
              restAmount={0} 
              restPercentage={0} 
              restCommission={0} 
              totalCommission={calculations.totalCommission} 
            />
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <InvoicePreviewDialog
        open={showPreviewDialog}
        onOpenChange={setShowPreviewDialog}
        onConfirm={handleConfirmSave}
        loading={isSaving}
        data={{
          ncf: fullNcf,
          invoiceDate: invoiceDate,
          clientName: selectedClient?.name || null,
          totalAmount: actualTotal,
          breakdown: calculations.breakdown,
          restAmount: 0,
          restPercentage: 0,
          restCommission: 0,
          totalCommission: calculations.totalCommission,
        }}
      />

      {/* Create Product Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nuevo Producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre del Producto</Label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Ej: Vitamina C"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Porcentaje de Comisión (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={newProductPercentage}
                onChange={(e) => setNewProductPercentage(Number(e.target.value))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCreateAndAdd} 
                disabled={addLoading || !newProductName.trim()}
                className="gradient-primary"
              >
                {addLoading ? 'Guardando...' : 'Guardar y Agregar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
