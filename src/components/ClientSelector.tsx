import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Search, UserPlus, X, Check, User, Phone, Mail, Trash2 } from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface ClientSelectorProps {
  clients: Client[];
  selectedClient: Client | null;
  onSelectClient: (client: Client | null) => void;
  onAddClient: (name: string, phone?: string, email?: string) => Promise<Client | null>;
  onDeleteClient?: (id: string) => Promise<boolean>;
}

export const ClientSelector = ({
  clients,
  selectedClient,
  onSelectClient,
  onAddClient,
  onDeleteClient,
}: ClientSelectorProps) => {
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  // Only show suggestions when there's text to search
  const shouldShowDropdown = showSuggestions && search.trim().length > 0;

  const handleSelectClient = (client: Client) => {
    onSelectClient(client);
    setSearch('');
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!shouldShowDropdown) return;

    const totalItems = filteredClients.length + 1; // +1 for "create new" option

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredClients.length) {
          handleSelectClient(filteredClients[highlightedIndex]);
        } else if (highlightedIndex === filteredClients.length || (filteredClients.length === 0 && search.trim())) {
          // Create new client option
          handleQuickAdd();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleQuickAdd = async () => {
    if (!search.trim()) return;
    setLoading(true);
    const client = await onAddClient(search.trim());
    setLoading(false);
    if (client) {
      onSelectClient(client);
      setSearch('');
      setShowSuggestions(false);
    }
  };

  const handleAddNewClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    setLoading(true);
    const client = await onAddClient(newName.trim(), newPhone.trim() || undefined, newEmail.trim() || undefined);
    setLoading(false);
    
    if (client) {
      onSelectClient(client);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setDialogOpen(false);
    }
  };

  const handleDeleteClient = async (e: React.MouseEvent, clientId: string) => {
    e.stopPropagation();
    if (onDeleteClient) {
      await onDeleteClient(clientId);
    }
  };

  return (
    <div className="space-y-3">
      {selectedClient ? (
        <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{selectedClient.name}</p>
              {selectedClient.phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {selectedClient.phone}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSelectClient(null)}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div ref={containerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => {
                if (search.trim()) setShowSuggestions(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Buscar o crear cliente..."
              className="pl-9 h-11"
            />
          </div>

          {shouldShowDropdown && (
            <div 
              className="absolute w-full mt-1 bg-popover border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95"
              style={{ zIndex: 9999 }}
            >
              {filteredClients.length > 0 ? (
                <div className="max-h-48 overflow-y-auto">
                  {filteredClients.map((client, index) => (
                    <div
                      key={client.id}
                      className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 cursor-pointer group ${
                        highlightedIndex === index ? 'bg-primary/10' : 'hover:bg-muted/60'
                      }`}
                      onClick={() => handleSelectClient(client)}
                    >
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{client.name}</p>
                        {client.phone && (
                          <p className="text-xs text-muted-foreground">{client.phone}</p>
                        )}
                      </div>
                      {onDeleteClient && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción eliminará el cliente "{client.name}" permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={(e) => handleDeleteClient(e, client.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No se encontraron clientes
                </div>
              )}

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <button 
                    className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 border-t border-border text-primary ${
                      highlightedIndex === filteredClients.length ? 'bg-primary/10' : 'hover:bg-primary/5'
                    }`}
                    onClick={() => setNewName(search.trim())}
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserPlus className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium text-sm">
                      {search.trim() ? `Crear "${search}"` : 'Crear nuevo cliente'}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">Enter</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md" style={{ zIndex: 10000 }}>
                  <DialogHeader>
                    <DialogTitle>Nuevo Cliente</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddNewClient} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="client-name">Nombre *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="client-name"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newName.trim()) {
                              handleAddNewClient(e);
                            }
                          }}
                          placeholder="Nombre del cliente"
                          className="pl-9"
                          required
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="client-phone">Teléfono</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="client-phone"
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          placeholder="809-000-0000"
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="client-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="client-email"
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="cliente@email.com"
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={loading || !newName.trim()} className="gap-2">
                        <Check className="h-4 w-4" />
                        {loading ? 'Creando...' : 'Crear Cliente'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
