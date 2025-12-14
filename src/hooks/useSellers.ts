import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Seller {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  is_default: boolean;
  created_at: string;
}

export const useSellers = () => {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSeller, setActiveSeller] = useState<Seller | null>(null);

  const fetchSellers = async () => {
    try {
      const { data, error } = await supabase
        .from('sellers')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      
      setSellers(data || []);
      
      // Set default seller as active
      const defaultSeller = data?.find(s => s.is_default);
      if (defaultSeller && !activeSeller) {
        setActiveSeller(defaultSeller);
      }
    } catch (error) {
      console.error('Error fetching sellers:', error);
      toast.error('Error al cargar vendedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const addSeller = async (name: string, email?: string, phone?: string): Promise<Seller | null> => {
    try {
      const { data, error } = await supabase
        .from('sellers')
        .insert([{ name, email, phone, is_default: false }])
        .select()
        .single();

      if (error) throw error;

      setSellers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Vendedor "${name}" agregado`);
      return data;
    } catch (error) {
      console.error('Error adding seller:', error);
      toast.error('Error al agregar vendedor');
      return null;
    }
  };

  const updateSeller = async (id: string, updates: Partial<Seller>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('sellers')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setSellers(prev =>
        prev.map(s => (s.id === id ? { ...s, ...updates } : s))
      );
      
      if (activeSeller?.id === id) {
        setActiveSeller(prev => prev ? { ...prev, ...updates } : null);
      }
      
      toast.success('Vendedor actualizado');
      return true;
    } catch (error) {
      console.error('Error updating seller:', error);
      toast.error('Error al actualizar vendedor');
      return false;
    }
  };

  const deleteSeller = async (id: string): Promise<boolean> => {
    try {
      // Check if this is the default seller
      const seller = sellers.find(s => s.id === id);
      if (seller?.is_default) {
        toast.error('No puedes eliminar el vendedor predeterminado');
        return false;
      }

      const { error } = await supabase.from('sellers').delete().eq('id', id);

      if (error) throw error;

      setSellers(prev => prev.filter(s => s.id !== id));
      
      if (activeSeller?.id === id) {
        const defaultSeller = sellers.find(s => s.is_default && s.id !== id);
        setActiveSeller(defaultSeller || null);
      }
      
      toast.success('Vendedor eliminado');
      return true;
    } catch (error) {
      console.error('Error deleting seller:', error);
      toast.error('Error al eliminar vendedor');
      return false;
    }
  };

  const setDefaultSeller = async (id: string): Promise<boolean> => {
    try {
      // Remove default from all sellers
      await supabase
        .from('sellers')
        .update({ is_default: false })
        .neq('id', id);

      // Set new default
      const { error } = await supabase
        .from('sellers')
        .update({ is_default: true })
        .eq('id', id);

      if (error) throw error;

      setSellers(prev =>
        prev.map(s => ({ ...s, is_default: s.id === id }))
      );
      
      const newDefault = sellers.find(s => s.id === id);
      if (newDefault) {
        setActiveSeller({ ...newDefault, is_default: true });
      }
      
      toast.success('Vendedor predeterminado actualizado');
      return true;
    } catch (error) {
      console.error('Error setting default seller:', error);
      toast.error('Error al cambiar vendedor predeterminado');
      return false;
    }
  };

  return {
    sellers,
    loading,
    activeSeller,
    setActiveSeller,
    addSeller,
    updateSeller,
    deleteSeller,
    setDefaultSeller,
    refetch: fetchSellers,
  };
};
