import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, CalendarIcon, Save, Trash2, Plus, X, User, ArrowLeft, Check } from 'lucide-react';
import { formatNumber, formatCurrency } from '@/lib/formatters';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Invoice } from '@/hooks/useInvoices';
import { Product, useProducts } from '@/hooks/useProducts';
import { Client } from '@/hooks/useClients';
import { ClientSearchSelect } from '@/components/ClientSearchSelect';

interface EditInvoiceDialogProps {
  invoice: Invoice;
  clients?: Client[];
  onUpdate: (
    id: string,
    ncf: string,
    invoiceDate: string,
    totalAmount: number,
    restAmount: number,
    restPercentage: number,
    restCommission: number,
    totalCommission: number,
    products: { name: string; amount: number; percentage: number; commission: number }[],
    clientId?: string | null
  ) => Promise<any>;
  onDelete: (id: string) => Promise<boolean>;
  trigger?: React.ReactNode;
}

const parseInvoiceDate = (dateString: string): Date => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(dateString);
};

export const EditInvoiceDialog = ({ invoice, clients, onUpdate, onDelete, trigger }: EditInvoiceDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  
  const [ncfSuffix, setNcfSuffix] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  
  const [totalAmountStr, setTotalAmountStr] = useState('');
  const [products, setProducts] = useState<{ name: string; amount: number; amountStr: string; percentage: number; commission: number }[]>([]);
  
  const [restPercentage, setRestPercentage] = useState(25);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPercentage, setNewProductPercentage] = useState(15);
  const [newProductAmountStr, setNewProductAmountStr] = useState('');
  
  const { products: catalogProducts } = useProducts();
  const ncfPrefix = 'B010000';

  useEffect(() => {
    if (open) {
      const suffix = invoice.ncf.slice(-4);
      setNcfSuffix(suffix);
      setInvoiceDate(parseInvoiceDate(invoice.invoice_date || invoice.created_at));
      setTotalAmountStr(invoice.total_amount.toString());
      setRestPercentage(invoice.rest_percentage || 25);
      setSelectedClientId((invoice as any).client_id || null);
      
      const prods = invoice.products?.map(p => ({
        name: p.product_name,
        amount: p.amount,
        amountStr: p.amount.toString(),
        percentage: p.percentage,
        commission: p.commission,
      })) || [];
      setProducts(prods);
      
      setDeleteConfirm(false);
      setShowAddProduct(false);
    }
  }, [open, invoice]);

  const handleTotalAmountChange = (val: string) => {
    const raw = val.replace(/[^0-9.]/g, '');
    if ((raw.match(/\./g) || []).length > 1) return;
    setTotalAmountStr(raw);
  };

  const handleProductAmountChange = (index: number, value: string) => {
    const raw = value.replace(/[^0-9.]/g, '');
    if ((raw.match(/\./g) || []).length > 1) return;

    const numValue = parseFloat(raw) || 0;
    const newProducts = [...products];
    newProducts[index].amountStr = raw;
    newProducts[index].amount = numValue;
    newProducts[index].commission = numValue * (newProducts[index].percentage / 100);
    setProducts(newProducts);
  };

  const handleProductPercentageChange = (index: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    const newProducts = [...products];
    newProducts[index].percentage = numValue;
    newProducts[index].commission = newProducts[index].amount * (numValue / 100);
    setProducts(newProducts);
  };

  const handleRemoveProduct = (index: number) => {
    const newProducts = [...products];
    newProducts.splice(index, 1);
    setProducts(newProducts);
  };

  const handleAddNewProduct = () => {
    if (!newProductName.trim()) return;
    
    const amount = parseFloat(newProductAmountStr) || 0;
    
    const newProduct = {
      name: newProductName.trim(),
      amount: amount,
      amountStr: newProductAmountStr,
      percentage: newProductPercentage,
      commission: amount * (newProductPercentage / 100),
    };
    
    setProducts([...products, newProduct]);
    setNewProductName('');
    setNewProductPercentage(15);
    setNewProductAmountStr('');
    setShowAddProduct(false);
  };

  const handleAddFromCatalog = (catalogProduct: Product) => {
    if (products.some(p => p.name === catalogProduct.name)) return;
    
    const newProduct = {
      name: catalogProduct.name,
      amount: 0,
      amountStr: '',
      percentage: catalogProduct.percentage,
      commission: 0,
    };
    setProducts([...products, newProduct]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ncfSuffix.length !== 4) return;
    
    setLoading(true);
    
    const fullNcf = `${ncfPrefix}${ncfSuffix.padStart(4, '0')}`;
    const totalAmount = parseFloat(totalAmountStr) || 0;
    const productsTotal = products.reduce((sum, p) => sum + p.amount, 0);
    const restAmount = Math.max(0, totalAmount - productsTotal);
    const restCommission = restAmount * (restPercentage / 100);
    const productsCommission = products.reduce((sum, p) => sum + p.commission, 0);
    const totalCommission = productsCommission + restCommission;
    
    const result = await onUpdate(
      invoice.id,
      fullNcf,
      format(invoiceDate, 'yyyy-MM-dd'),
      totalAmount,
      restAmount,
      restPercentage,
      restCommission,
      totalCommission,
      products,
      selectedClientId
    );
    
    setLoading(false);
    if (result) {
      setOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setLoading(true);
    const result = await onDelete(invoice.id);
    setLoading(false);
    if (result) setOpen(false);
  };

  const currentTotal = parseFloat(totalAmountStr) || 0;
  const productsTotal = products.reduce((sum, p) => sum + p.amount, 0);
  const restAmount = Math.max(0, currentTotal - productsTotal);
  const productsCommission = products.reduce((sum, p) => sum + p.commission, 0);
  const restCommission = restAmount * (restPercentage / 100);
  const calculatedTotalCommission = productsCommission + restCommission;

  const availableCatalogProducts = catalogProducts.filter(
    cp => !products.some(p => p.name === cp.name)
  );

  // Get client name for display
  const selectedClient = clients?.find(c => c.id === selectedClientId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2">
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header - Invoice Style */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-5 border-b border-border">
          <DialogHeader className="p-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Pencil className="h-5 w-5 text-primary" />
              Editar Factura
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Form Body - Invoice Format */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-6">
            {/* Header Info Grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 pb-5 border-b border-dashed border-border">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">NCF</span>
                <div className="flex items-center rounded-lg border border-border bg-muted/30 overflow-hidden mt-1">
                  <span className="px-2 py-2 text-sm font-mono font-medium text-muted-foreground bg-muted border-r border-border">
                    {ncfPrefix}
                  </span>
                  <Input
                    id="ncf"
                    value={ncfSuffix}
                    onChange={(e) => setNcfSuffix(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    className="border-0 text-sm font-mono font-bold text-center focus-visible:ring-0 h-9"
                    maxLength={4}
                    inputMode="numeric"
                    required
                  />
                </div>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Fecha</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-10 mt-1",
                        !invoiceDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {invoiceDate ? format(invoiceDate, "d MMM, yyyy", { locale: es }) : <span>Seleccionar</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={invoiceDate}
                      onSelect={(date) => date && setInvoiceDate(date)}
                      initialFocus
                      locale={es}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="col-span-2">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Cliente</span>
                <div className="mt-1">
                  <ClientSearchSelect
                    clients={clients || []}
                    value={selectedClientId || ''}
                    onChange={(val) => setSelectedClientId(val || null)}
                  />
                </div>
              </div>
            </div>

            {/* Total Amount */}
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Total Factura</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted-foreground">
                  $
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={totalAmountStr}
                  onChange={(e) => handleTotalAmountChange(e.target.value)}
                  className="h-14 pl-9 text-2xl font-bold"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Products Section */}
            <div>
              {/* Table Header */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Productos con Comisión Variable</span>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowAddProduct(!showAddProduct)}
                  className="gap-1 h-7"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar
                </Button>
              </div>

              {/* Add Product Form */}
              {showAddProduct && (
                <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-3 mb-4 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Nombre</Label>
                      <Input
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        placeholder="Ej: Vitamina D"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Porcentaje (%)</Label>
                      <Input
                        type="number"
                        value={newProductPercentage}
                        onChange={(e) => setNewProductPercentage(Number(e.target.value))}
                        className="h-9"
                        min={0}
                        max={100}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Monto ($)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={newProductAmountStr}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          if ((val.match(/\./g) || []).length <= 1) setNewProductAmountStr(val);
                        }}
                        className="h-9"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  
                  {availableCatalogProducts.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <div className="flex flex-wrap gap-1.5">
                        {availableCatalogProducts.slice(0, 5).map(cp => (
                          <Button
                            key={cp.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddFromCatalog(cp)}
                            className="h-7 text-xs gap-1"
                          >
                            {cp.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddProduct(false)}>Cancelar</Button>
                    <Button type="button" size="sm" onClick={handleAddNewProduct} disabled={!newProductName.trim()} className="gap-1">
                      <Plus className="h-3.5 w-3.5" /> Agregar
                    </Button>
                  </div>
                </div>
              )}

              {/* Products Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-12 gap-2 py-2 px-3 bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold border-b">
                  <div className="col-span-5">Descripción</div>
                  <div className="col-span-2 text-center">%</div>
                  <div className="col-span-2 text-right">Monto</div>
                  <div className="col-span-2 text-right">Comisión</div>
                  <div className="col-span-1"></div>
                </div>
                
                <div className="divide-y divide-border/50 max-h-48 overflow-y-auto">
                  {products.map((product, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 py-2 px-3 items-center hover:bg-muted/20">
                      <div className="col-span-5">
                        <span className="font-medium text-sm truncate block">{product.name}</span>
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          value={product.percentage}
                          onChange={(e) => handleProductPercentageChange(index, e.target.value)}
                          className="h-8 text-center text-xs font-bold"
                          min={0}
                          max={100}
                        />
                      </div>
                      <div className="col-span-2">
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={product.amountStr}
                            onChange={(e) => handleProductAmountChange(index, e.target.value)}
                            className="h-8 pl-4 text-xs text-right font-medium"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div className="col-span-2 text-right text-sm font-semibold text-success">
                        ${formatCurrency(product.commission)}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveProduct(index)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {products.length === 0 && (
                    <div className="py-4 text-center text-sm text-muted-foreground italic">
                      Ningún producto con comisión variable
                    </div>
                  )}

                  {/* Rest Row */}
                  <div className="grid grid-cols-12 gap-2 py-3 px-3 items-center bg-secondary/20">
                    <div className="col-span-5 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-secondary" />
                      <span className="font-medium text-sm">Resto de productos</span>
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        value={restPercentage}
                        onChange={(e) => setRestPercentage(Number(e.target.value))}
                        className="h-8 text-center text-xs font-bold bg-secondary"
                        min={0}
                        max={100}
                      />
                    </div>
                    <div className="col-span-2 text-right text-sm text-muted-foreground">
                      ${formatNumber(restAmount)}
                    </div>
                    <div className="col-span-2 text-right text-sm font-semibold text-success">
                      ${formatCurrency(restCommission)}
                    </div>
                    <div className="col-span-1"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Totals Section */}
            <div className="pt-4 border-t-2 border-foreground/20 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Factura</span>
                <span className="font-bold text-foreground text-lg">${formatNumber(currentTotal)}</span>
              </div>
              
              {/* Total Commission - Highlighted */}
              <div className="flex items-center justify-between p-4 -mx-6 bg-gradient-to-r from-success/15 via-success/10 to-success/5 border-y border-success/20">
                <span className="font-semibold text-foreground">Tu Comisión Total</span>
                <span className="text-3xl font-black text-success">${formatCurrency(calculatedTotalCommission)}</span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 flex-row gap-3">
            <Button
              type="button"
              variant={deleteConfirm ? "destructive" : "outline"}
              onClick={handleDelete}
              disabled={loading}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {deleteConfirm ? 'Confirmar Eliminar' : 'Eliminar'}
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || ncfSuffix.length !== 4}
              className="gap-2 gradient-success text-success-foreground"
            >
              <Check className="h-4 w-4" />
              {loading ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
