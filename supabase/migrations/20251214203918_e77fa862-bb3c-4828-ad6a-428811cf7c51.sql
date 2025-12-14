-- Create sellers table to manage salespersons
CREATE TABLE public.sellers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public access (same as other tables in this app)
CREATE POLICY "Enable read access for all users" 
ON public.sellers 
FOR SELECT 
USING (true);

CREATE POLICY "Enable insert access for all users" 
ON public.sellers 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Enable update access for all users" 
ON public.sellers 
FOR UPDATE 
USING (true);

CREATE POLICY "Enable delete access for all users" 
ON public.sellers 
FOR DELETE 
USING (true);

-- Insert default seller NEFTALÍ JIMÉNEZ
INSERT INTO public.sellers (name, is_default) VALUES ('NEFTALÍ JIMÉNEZ', true);

-- Add seller_id column to invoices table to link invoices to sellers
ALTER TABLE public.invoices ADD COLUMN seller_id UUID REFERENCES public.sellers(id);