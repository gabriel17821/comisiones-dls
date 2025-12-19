import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, CalendarIcon, Save, Trash2, Plus, X, User } from 'lucide-react';
import { formatNumber } from '@/lib/formatters';
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
  
  // Usamos strings para controlar los decimales en el input
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
      
      // Mostrar el Total Real (total_amount de la base de datos)
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
    
    // --- LÓGICA DE CÁLCULO ---
    // El Resto es el Total menos la suma de los productos especiales
    const restAmount = Math.max(0, totalAmount - productsTotal);
    const restCommission = restAmount * (restPercentage / 100);
    const productsCommission = products.reduce((sum, p) => sum + p.commission, 0);
    const totalCommission = productsCommission + restCommission;
    
    // En la BD guardamos el Total Real (que es lo que el usuario digitó)
    const result = await onUpdate(
      invoice.id,
      fullNcf,
      format(invoiceDate, 'yyyy-MM-dd'),
      totalAmount, // Guardamos el total completo
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Editar Factura</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Cliente
            </Label>
            <ClientSearchSelect
              clients={clients || []}
              value={selectedClientId || ''}
              onChange={(val) => setSelectedClientId(val || null)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base">Fecha de la Factura</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal h-12",
                    !invoiceDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {invoiceDate ? format(invoiceDate, "d 'de' MMMM, yyyy", { locale: es }) : <span>Seleccionar fecha</span>}
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

          <div className="space-y-2">
            <Label htmlFor="ncf" className="text-base">NCF (últimos 4 dígitos)</Label>
            <div className="flex items-center rounded-lg border border-border bg-muted/30 overflow-hidden">
              <span className="px-3 py-3 text-lg font-mono font-medium text-muted-foreground bg-muted border-r border-border">
                {ncfPrefix}
              </span>
              <Input
                id="ncf"
                value={ncfSuffix}
                onChange={(e) => setNcfSuffix(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                className="border-0 text-lg font-mono font-bold text-center focus-visible:ring-0"
                maxLength={4}
                inputMode="numeric"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-base">Total Factura</Label>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Productos con Comisión Variable</Label>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => setShowAddProduct(!showAddProduct)}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </Button>
            </div>
            
            {showAddProduct && (
              <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-3 animate-in slide-in-from-top-2">
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
            
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {products.map((product, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 group">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Input
                      type="number"
                      value={product.percentage}
                      onChange={(e) => handleProductPercentageChange(index, e.target.value)}
                      className="w-16 h-8 text-center text-sm font-bold"
                      min={0}
                      max={100}
                    />
                    <span className="text-sm font-medium truncate">{product.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-28">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={product.amountStr}
                        onChange={(e) => handleProductAmountChange(index, e.target.value)}
                        className="h-9 pl-5 text-sm text-right font-medium"
                        placeholder="0.00"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemoveProduct(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-base">Porcentaje del Resto (%)</Label>
            <Input
              type="number"
              value={restPercentage}
              onChange={(e) => setRestPercentage(Number(e.target.value))}
              className="h-10"
              min={0}
              max={100}
            />
          </div>

          <div className="p-4 rounded-lg bg-muted/40 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Productos:</span>
              <span className="font-medium">${formatNumber(productsTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Resto ({restPercentage}%):</span>
              <span className="font-medium">${formatNumber(restAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t border-border pt-2">
              <span>Total Comisión:</span>
              <span className="text-success">${formatNumber(calculatedTotalCommission)}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button 
              type="button" 
              variant={deleteConfirm ? "destructive" : "outline"}
              onClick={handleDelete}
              disabled={loading}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {deleteConfirm ? 'Confirmar' : 'Eliminar'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || ncfSuffix.length !== 4}
              className="flex-1 gap-2 gradient-primary"
            >
              <Save className="h-4 w-4" />
              {loading ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};