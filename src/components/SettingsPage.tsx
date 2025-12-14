import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Settings, Upload, Download, Trash2, FileUp, AlertTriangle, Check, Loader2, Users, Package } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Client } from '@/hooks/useClients';

interface SettingsPageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  onRefetchClients: () => void;
}

export const SettingsPage = ({ open, onOpenChange, clients, onRefetchClients }: SettingsPageProps) => {
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header if present
      const startIndex = lines[0].toLowerCase().includes('nombre') ? 1 : 0;
      
      const newClients: { name: string; phone?: string; email?: string }[] = [];
      
      for (let i = startIndex; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        if (values[0]) {
          newClients.push({
            name: values[0],
            phone: values[1] || undefined,
            email: values[2] || undefined,
          });
        }
      }

      if (newClients.length === 0) {
        toast.error('No se encontraron clientes válidos en el archivo');
        return;
      }

      // Insert all clients
      const { error } = await supabase.from('clients').insert(newClients);

      if (error) throw error;

      toast.success(`${newClients.length} clientes importados correctamente`);
      onRefetchClients();
    } catch (error) {
      console.error('Error uploading CSV:', error);
      toast.error('Error al importar el archivo CSV');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      // Fetch all data
      const [invoicesRes, invoiceProductsRes, clientsRes, productsRes, sellersRes, settingsRes] = await Promise.all([
        supabase.from('invoices').select('*'),
        supabase.from('invoice_products').select('*'),
        supabase.from('clients').select('*'),
        supabase.from('products').select('*'),
        supabase.from('sellers').select('*'),
        supabase.from('settings').select('*'),
      ]);

      const backup = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: {
          invoices: invoicesRes.data || [],
          invoice_products: invoiceProductsRes.data || [],
          clients: clientsRes.data || [],
          products: productsRes.data || [],
          sellers: sellersRes.data || [],
          settings: settingsRes.data || [],
        },
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_comisiones_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Backup exportado correctamente');
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Error al exportar los datos');
    } finally {
      setExporting(false);
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.version || !backup.data) {
        throw new Error('Archivo de backup inválido');
      }

      // Delete existing data first
      await Promise.all([
        supabase.from('invoice_products').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      ]);

      // Import in order
      if (backup.data.clients?.length) {
        await supabase.from('clients').upsert(backup.data.clients, { onConflict: 'id' });
      }
      if (backup.data.products?.length) {
        await supabase.from('products').upsert(backup.data.products, { onConflict: 'id' });
      }
      if (backup.data.sellers?.length) {
        await supabase.from('sellers').upsert(backup.data.sellers, { onConflict: 'id' });
      }
      if (backup.data.settings?.length) {
        await supabase.from('settings').upsert(backup.data.settings, { onConflict: 'id' });
      }
      if (backup.data.invoices?.length) {
        await supabase.from('invoices').insert(backup.data.invoices);
      }
      if (backup.data.invoice_products?.length) {
        await supabase.from('invoice_products').insert(backup.data.invoice_products);
      }

      toast.success('Datos restaurados correctamente. Recarga la página.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('Error importing data:', error);
      toast.error('Error al importar los datos');
    } finally {
      setImporting(false);
      if (importFileInputRef.current) {
        importFileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAllData = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    setDeleting(true);
    try {
      // Delete all data in order
      await supabase.from('invoice_products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      toast.success('Todos los datos han sido eliminados. Recarga la página.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('Error deleting data:', error);
      toast.error('Error al eliminar los datos');
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Settings className="h-5 w-5" />
            Ajustes
          </DialogTitle>
          <DialogDescription>
            Configuración general y gestión de datos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Import Clients CSV */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Importar Clientes</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Sube un archivo CSV con columnas: Nombre, Teléfono, Email
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {uploading ? 'Importando...' : 'Seleccionar archivo CSV'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Clientes actuales: <strong>{clients.length}</strong>
            </p>
          </Card>

          {/* Backup & Restore */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Backup y Restauración</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Exporta o importa todos los datos del sistema
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleExportData}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Exportar
              </Button>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportData}
                className="hidden"
              />
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => importFileInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importar
              </Button>
            </div>
          </Card>

          {/* Danger Zone */}
          <Card className="p-4 space-y-3 border-destructive/50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <h3 className="font-semibold text-destructive">Zona de Peligro</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Elimina permanentemente todos los datos. Esta acción no se puede deshacer.
            </p>
            <Button
              variant={deleteConfirm ? "destructive" : "outline"}
              className="w-full gap-2"
              onClick={handleDeleteAllData}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : deleteConfirm ? (
                <Check className="h-4 w-4" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {deleting ? 'Eliminando...' : deleteConfirm ? 'Click para confirmar' : 'Eliminar todos los datos'}
            </Button>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
