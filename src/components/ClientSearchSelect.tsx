import * as React from "react";
import { Check, Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Client } from "@/hooks/useClients";

interface ClientSearchSelectProps {
  clients: Client[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function ClientSearchSelect({
  clients,
  value,
  onChange,
  className,
  disabled
}: ClientSearchSelectProps) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedClient = React.useMemo(() => 
    clients.find((client) => client.id === value),
  [clients, value]);

  // Filtrar clientes por búsqueda
  const filteredClients = React.useMemo(() => {
    if (!searchTerm.trim()) return clients;
    const term = searchTerm.toLowerCase();
    return clients.filter(c => 
      c.name.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term)
    );
  }, [clients, searchTerm]);

  // Click outside handler
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (clientId: string) => {
    onChange(clientId);
    setSearchTerm("");
    setIsFocused(false);
  };

  const handleClear = () => {
    onChange("");
    setSearchTerm("");
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Input de búsqueda directo */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          value={selectedClient && !isFocused ? selectedClient.name : searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
            if (selectedClient) setSearchTerm("");
          }}
          placeholder="Buscar cliente..."
          className="pl-10 pr-10 h-10"
          disabled={disabled}
        />
        {(value || searchTerm) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown de resultados */}
      {isFocused && (
        <div className="absolute z-50 w-full mt-1 border border-border rounded-lg shadow-lg bg-popover max-h-60 overflow-y-auto">
          {filteredClients.length > 0 ? (
            filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => handleSelect(client.id)}
                className={cn(
                  "w-full px-4 py-2.5 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left",
                  value === client.id && "bg-primary/10"
                )}
              >
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{client.name}</span>
                  {client.phone && (
                    <span className="text-xs text-muted-foreground">{client.phone}</span>
                  )}
                </div>
                {value === client.id && (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            ))
          ) : (
            <div className="py-4 px-4 text-center text-sm text-muted-foreground">
              No se encontraron clientes
            </div>
          )}
        </div>
      )}
    </div>
  );
}