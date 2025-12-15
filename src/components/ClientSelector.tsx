import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, UserPlus, X, Check, User, Phone, Mail, Trash2, ChevronRight, Sparkles } from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { createPortal } from 'react-dom';

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
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Update dropdown position
  useEffect(() => {
    if (showSuggestions && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [showSuggestions, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        if (!selectedClient) setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedClient]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  const shouldShowDropdown = showSuggestions && search.trim().length > 0;

  const handleSelectClient = (client: Client) => {
    onSelectClient(client);
    setSearch('');
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    setIsExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!shouldShowDropdown) {
      if (e.key === 'Enter' && search.trim()) {
        e.preventDefault();
        handleQuickAdd();
      }
      return;
    }

    const totalItems = filteredClients.length + 1;

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
          handleQuickAdd();
        } else if (search.trim()) {
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

  const handleExpandClick = () => {
    setIsExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Dropdown content rendered via portal
  const dropdownContent = shouldShowDropdown ? createPortal(
    <div 
      className="fixed bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95"
      style={{ 
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        zIndex: 99999,
      }}
      onMouseDown={(e) => e.stopPropagation()}
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
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-2 ring-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">{client.name}</p>
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
                  <AlertDialogContent style={{ zIndex: 100000 }}>
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

      <button 
        className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 border-t border-border text-primary ${
          highlightedIndex === filteredClients.length ? 'bg-primary/10' : 'hover:bg-primary/5'
        }`}
        onClick={() => {
          setNewName(search.trim());
          setDialogOpen(true);
          setShowSuggestions(false);
        }}
      >
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
          <UserPlus className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold text-sm">
          {search.trim() ? `Crear "${search}"` : 'Crear nuevo cliente'}
        </span>
        <span className="ml-auto text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">Enter</span>
      </button>
    </div>,
    document.body
  ) : null;

  return (
    <div className="space-y-3">
      {selectedClient ? (
        // Selected client - Elegant card with clear hierarchy
        <div 
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border-2 border-primary/20 hover:border-primary/40 transition-all duration-300 cursor-pointer"
          onClick={() => onSelectClient(null)}
        >
          {/* Decorative accent */}
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-primary/50" />
          
          <div className="flex items-center gap-4 p-4 pl-5">
            {/* Avatar */}
            <div className="relative">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
                <User className="h-7 w-7 text-primary-foreground" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success flex items-center justify-center ring-2 ring-background">
                <Check className="h-3 w-3 text-success-foreground" />
              </div>
            </div>
            
            {/* Client Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-primary uppercase tracking-wider mb-0.5">Cliente Asignado</p>
              <p className="font-bold text-lg text-foreground truncate">{selectedClient.name}</p>
              <div className="flex items-center gap-3 mt-1">
                {selectedClient.phone && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {selectedClient.phone}
                  </span>
                )}
                {selectedClient.email && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {selectedClient.email}
                  </span>
                )}
              </div>
            </div>
            
            {/* Change button */}
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onSelectClient(null);
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Cambiar
            </Button>
          </div>
        </div>
      ) : !isExpanded ? (
        // Collapsed state - Interactive card to expand
        <button
          onClick={handleExpandClick}
          className="w-full group relative overflow-hidden rounded-2xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 bg-gradient-to-br from-muted/30 to-transparent hover:from-primary/5 hover:to-transparent transition-all duration-300"
        >
          <div className="flex items-center gap-4 p-5">
            {/* Icon container */}
            <div className="h-14 w-14 rounded-2xl bg-muted/50 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
              <UserPlus className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            
            {/* Text */}
            <div className="flex-1 text-left">
              <p className="font-semibold text-foreground group-hover:text-primary transition-colors">Asignar Cliente</p>
              <p className="text-sm text-muted-foreground">Busca o crea un nuevo cliente</p>
            </div>
            
            {/* Arrow */}
            <div className="h-10 w-10 rounded-xl bg-muted/50 group-hover:bg-primary/10 flex items-center justify-center transition-all group-hover:translate-x-1">
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
          
          {/* Hover effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </button>
      ) : (
        // Expanded state - Search input with suggestions
        <div ref={containerRef} className="relative animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Buscar cliente</span>
            </div>
            
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
                placeholder="Nombre del cliente..."
                className="pl-12 h-12 text-base rounded-xl border-muted-foreground/20 focus:border-primary"
              />
            </div>
            
            {/* Quick actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9 text-xs"
                onClick={() => setIsExpanded(false)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9 text-xs gap-1"
                onClick={() => {
                  setNewName('');
                  setDialogOpen(true);
                }}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Nuevo Cliente
              </Button>
            </div>
            
            {/* Recent clients hint */}
            {clients.length > 0 && !search && (
              <p className="text-xs text-muted-foreground text-center">
                Escribe para buscar entre {clients.length} cliente{clients.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {dropdownContent}
        </div>
      )}

      {/* Dialog for creating new client */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" style={{ zIndex: 100000 }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <UserPlus className="h-4 w-4 text-primary" />
              </div>
              Nuevo Cliente
            </DialogTitle>
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
                  placeholder="Nombre del cliente"
                  className="pl-9 h-11"
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
                  className="pl-9 h-11"
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
                  className="pl-9 h-11"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
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
  );
};
