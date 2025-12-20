import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { formatNumber } from "@/lib/formatters";

interface InvoiceLineItemProps {
  productName: string;
  productColor: string;
  percentage: number;
  quantity: number;
  unitPrice: number;
  onQuantityChange: (quantity: number) => void;
  onUnitPriceChange: (price: number) => void;
  onRemove: () => void;
}

export const InvoiceLineItem = ({
  productName,
  productColor,
  percentage,
  quantity,
  unitPrice,
  onQuantityChange,
  onUnitPriceChange,
  onRemove,
}: InvoiceLineItemProps) => {
  const [qtyValue, setQtyValue] = useState(quantity > 0 ? quantity.toString() : '');
  const [priceValue, setPriceValue] = useState(unitPrice > 0 ? unitPrice.toString() : '');

  useEffect(() => {
    if (quantity === 0 && qtyValue !== '' && qtyValue !== '0') {
      setQtyValue('');
    }
  }, [quantity]);

  useEffect(() => {
    if (unitPrice === 0 && priceValue !== '' && priceValue !== '0') {
      setPriceValue('');
    }
  }, [unitPrice]);

  const lineTotal = quantity * unitPrice;
  const commission = lineTotal * (percentage / 100);

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setQtyValue(raw);
    onQuantityChange(parseInt(raw) || 0);
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    if ((raw.match(/\./g) || []).length > 1) return;
    setPriceValue(raw);
    onUnitPriceChange(parseFloat(raw) || 0);
  };

  return (
    <div className="group grid grid-cols-12 gap-2 items-center p-3 rounded-lg bg-card border border-border hover:border-primary/30 transition-all">
      {/* Product Name with color indicator */}
      <div className="col-span-4 flex items-center gap-2 min-w-0">
        <div 
          className="h-8 w-1 rounded-full shrink-0"
          style={{ backgroundColor: productColor }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{productName}</p>
          <p className="text-xs text-muted-foreground">{percentage}% comisión</p>
        </div>
      </div>

      {/* Quantity */}
      <div className="col-span-2">
        <Input
          type="text"
          inputMode="numeric"
          value={qtyValue}
          onChange={handleQtyChange}
          placeholder="Cant."
          className="h-9 text-center text-sm font-medium"
        />
      </div>

      {/* Unit Price */}
      <div className="col-span-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          <Input
            type="text"
            inputMode="decimal"
            value={priceValue}
            onChange={handlePriceChange}
            placeholder="0.00"
            className="h-9 pl-5 text-right text-sm font-medium"
          />
        </div>
      </div>

      {/* Line Total */}
      <div className="col-span-2 text-right">
        <p className="text-sm font-bold text-foreground">${formatNumber(lineTotal)}</p>
        {lineTotal > 0 && (
          <p className="text-xs font-semibold" style={{ color: productColor }}>
            +${formatNumber(commission)}
          </p>
        )}
      </div>

      {/* Delete */}
      <div className="col-span-2 flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
