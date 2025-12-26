import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, Package, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface PersistentMatch {
  id: number;
  csv_name: string;
  mapped_name: string;
  type: 'client' | 'product';
  created_at: string;
}

export const MatchingManagementCard = () => {
  const [matches, setMatches] = useState<PersistentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('persistent_matches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMatches(data || []);
    } catch (err: any) {
      console.error('Error fetching matches:', err);
      setError('No se pudieron cargar los matches guardados.');
      toast.error('Error al cargar los matches.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      const { error } = await supabase.from('persistent_matches').delete().eq('id', id);
      if (error) throw error;
      setMatches(matches.filter(m => m.id !== id));
      toast.success('Match eliminado correctamente.');
    } catch (err: any) {
      console.error('Error deleting match:', err);
      toast.error('No se pudo eliminar el match.');
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-24 text-destructive">
          <AlertCircle className="h-6 w-6 mb-2" />
          <p>{error}</p>
        </div>
      );
    }

    if (matches.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-4">No hay matches manuales guardados.</p>;
    }

    const clientMatches = matches.filter(m => m.type === 'client');
    const productMatches = matches.filter(m => m.type === 'product');

    return (
      <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
        {clientMatches.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Clientes</h4>
            {clientMatches.map(match => (
              <div key={match.id} className="flex items-center justify-between text-xs p-2 bg-muted rounded-md">
                <div className="truncate">
                  <p className="font-mono bg-background/50 px-1 rounded-sm inline-block max-w-28 truncate">{match.csv_name}</p>
                  <p className="text-muted-foreground mx-1">→</p>
                  <p className="font-semibold inline-block max-w-28 truncate">{match.mapped_name}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(match.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {productMatches.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Productos</h4>
            {productMatches.map(match => (
              <div key={match.id} className="flex items-center justify-between text-xs p-2 bg-muted rounded-md">
                <div className="truncate">
                  <p className="font-mono bg-background/50 px-1 rounded-sm inline-block max-w-28 truncate">{match.csv_name}</p>
                  <p className="text-muted-foreground mx-1">→</p>
                  <p className="font-semibold inline-block max-w-28 truncate">{match.mapped_name}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(match.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gestión de Matches</CardTitle>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
};
