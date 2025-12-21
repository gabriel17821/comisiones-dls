import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings2, Plus, Pencil, Trash2, Save, X, Package } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  percentage: number;
  color: string;
  is_default: boolean;
}

interface ProductCatalogDialogProps {
  products: Product[];
  onUpdateProduct: (id: string, updates: Partial<Product>) => Promise<boolean>;
  onDeleteProduct: (id: string) => void;
  onAddProduct: (name: string, percentage: number) => Promise<any>;
  trigger?: React.ReactNode;
}

export const ProductCatalogDialog = ({
  products,
  onUpdateProduct,
  onDeleteProduct,
  onAddProduct,
  trigger,
}: ProductCatalogDialogProps) => {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPercentage, setEditPercentage] = useState('');
  const [newName, setNewName] = useState('');
  const [newPercentage, setNewPercentage] = useState('15');
  const [loading, setLoading] = useState(false);

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setEditName(product.name);
    setEditPercentage(product.percentage.toString());
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setLoading(true);
    await onUpdateProduct(editingId, {
      name: editName.trim(),
      percentage: parseFloat(editPercentage) || 0,
    });
    setLoading(false);
    setEditingId(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    await onAddProduct(newName.trim(), parseFloat(newPercentage) || 15);
    setLoading(false);
    setNewName('');
    setNewPercentage('15');
  };

  const handleDelete = (id: string) => {
    if (window.confirm('¿Eliminar este producto?')) {
      onDeleteProduct(id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="secondary" size="sm" className="gap-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Catálogo</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Catálogo de Productos
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Add new product form */}
          <form onSubmit={handleAdd} className="p-4 rounded-xl bg-muted/40 border border-border/50 space-y-3">
            <Label className="text-sm font-medium">Agregar nuevo producto</Label>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del producto"
                className="flex-1"
              />
              <div className="relative w-20">
                <Input
                  type="number"
                  value={newPercentage}
                  onChange={(e) => setNewPercentage(e.target.value)}
                  placeholder="15"
                  className="pr-6"
                  min="0"
                  max="100"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
              <Button type="submit" size="icon" disabled={loading || !newName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </form>

          {/* Products list */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Productos ({products.length})
            </Label>
            <div className="space-y-2">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border/50 hover:border-border transition-colors"
                >
                  {editingId === product.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 h-9"
                        autoFocus
                      />
                      <div className="relative w-20">
                        <Input
                          type="number"
                          value={editPercentage}
                          onChange={(e) => setEditPercentage(e.target.value)}
                          className="h-9 pr-6"
                          min="0"
                          max="100"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                      <Button size="icon" variant="ghost" onClick={handleSaveEdit} disabled={loading} className="h-9 w-9 text-success">
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} className="h-9 w-9">
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 font-medium text-foreground">{product.name}</span>
                      <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-bold">
                        {product.percentage}%
                      </span>
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(product)} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(product.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}

              {products.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No hay productos. Agrega uno arriba.
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
