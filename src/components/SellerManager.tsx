import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Users, ChevronDown, Plus, Pencil, Trash2, Star, Check, User } from 'lucide-react';
import { Seller } from '@/hooks/useSellers';

interface SellerManagerProps {
  sellers: Seller[];
  activeSeller: Seller | null;
  onSelectSeller: (seller: Seller) => void;
  onAddSeller: (name: string, email?: string, phone?: string) => Promise<Seller | null>;
  onUpdateSeller: (id: string, updates: Partial<Seller>) => Promise<boolean>;
  onDeleteSeller: (id: string) => Promise<boolean>;
  onSetDefault: (id: string) => Promise<boolean>;
}

export const SellerManager = ({
  sellers,
  activeSeller,
  onSelectSeller,
  onAddSeller,
  onUpdateSeller,
  onDeleteSeller,
  onSetDefault,
}: SellerManagerProps) => {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleAddSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    setLoading(true);
    const result = await onAddSeller(newName.trim(), newEmail.trim() || undefined, newPhone.trim() || undefined);
    setLoading(false);
    
    if (result) {
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setAddDialogOpen(false);
    }
  };

  const handleEditSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeller || !newName.trim()) return;
    
    setLoading(true);
    const result = await onUpdateSeller(editingSeller.id, {
      name: newName.trim(),
      email: newEmail.trim() || null,
      phone: newPhone.trim() || null,
    });
    setLoading(false);
    
    if (result) {
      setEditDialogOpen(false);
      setEditingSeller(null);
    }
  };

  const handleDelete = async () => {
    if (!editingSeller) return;
    
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    
    setLoading(true);
    const result = await onDeleteSeller(editingSeller.id);
    setLoading(false);
    
    if (result) {
      setEditDialogOpen(false);
      setEditingSeller(null);
      setDeleteConfirm(false);
    }
  };

  const openEditDialog = (seller: Seller) => {
    setEditingSeller(seller);
    setNewName(seller.name);
    setNewEmail(seller.email || '');
    setNewPhone(seller.phone || '');
    setDeleteConfirm(false);
    setEditDialogOpen(true);
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2 h-10 px-4">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{activeSeller?.name || 'Vendedor'}</span>
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {sellers.map((seller) => (
            <DropdownMenuItem
              key={seller.id}
              onClick={() => onSelectSeller(seller)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{seller.name}</p>
                  {seller.is_default && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Star className="h-3 w-3 fill-primary text-primary" />
                      Predeterminado
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {activeSeller?.id === seller.id && (
                  <Check className="h-4 w-4 text-primary" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditDialog(seller);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            </DropdownMenuItem>
          ))}
          
          <DropdownMenuSeparator />
          
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer text-primary">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Vendedor
              </DropdownMenuItem>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nuevo Vendedor</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddSeller} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="seller-name">Nombre *</Label>
                  <Input
                    id="seller-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre del vendedor"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seller-email">Email</Label>
                  <Input
                    id="seller-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="vendedor@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seller-phone">Teléfono</Label>
                  <Input
                    id="seller-phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="809-000-0000"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading || !newName.trim()} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {loading ? 'Creando...' : 'Crear'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setDeleteConfirm(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Vendedor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSeller} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-seller-name">Nombre *</Label>
              <Input
                id="edit-seller-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del vendedor"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-seller-email">Email</Label>
              <Input
                id="edit-seller-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="vendedor@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-seller-phone">Teléfono</Label>
              <Input
                id="edit-seller-phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="809-000-0000"
              />
            </div>
            
            {editingSeller && !editingSeller.is_default && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => editingSeller && onSetDefault(editingSeller.id)}
              >
                <Star className="h-4 w-4" />
                Establecer como predeterminado
              </Button>
            )}
            
            <div className="flex gap-3 pt-2">
              {editingSeller && !editingSeller.is_default && (
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
              )}
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || !newName.trim()} className="flex-1 gap-2">
                {loading ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
