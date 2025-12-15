import { useState, useMemo, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calculator, History, BarChart3, Layers, Settings } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useSettings } from "@/hooks/useSettings";
import { useInvoices } from "@/hooks/useInvoices";
import { useClients } from "@/hooks/useClients";
import { useSellers } from "@/hooks/useSellers";
import { CalculatorView } from "@/components/CalculatorView";
import { InvoiceHistory } from "@/components/InvoiceHistory";
import { Statistics } from "@/components/Statistics";
import { MonthlyBreakdown } from "@/components/MonthlyBreakdown";
import { SellerManager } from "@/components/SellerManager";
import { SettingsPage } from "@/components/SettingsPage";

const Index = () => {
  const { products, loading: productsLoading, addProduct, updateProduct, deleteProduct } = useProducts();
  const { restPercentage, loading: settingsLoading, updateRestPercentage, getNextNcfNumber, updateLastNcfNumber } = useSettings();
  const { invoices, loading: invoicesLoading, saveInvoice, deleteInvoice, updateInvoice, refetch: refetchInvoices } = useInvoices();
  const { clients, loading: clientsLoading, addClient, deleteClient, refetch: refetchClients } = useClients();
  const { sellers, activeSeller, setActiveSeller, addSeller, updateSeller, deleteSeller, setDefaultSeller } = useSellers();

  const [totalInvoice, setTotalInvoice] = useState(0);
  const [productAmounts, setProductAmounts] = useState<Record<string, number>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (products.length > 0) {
      const initialAmounts: Record<string, number> = {};
      products.forEach(p => {
        if (!(p.id in productAmounts)) {
          initialAmounts[p.id] = 0;
        }
      });
      if (Object.keys(initialAmounts).length > 0) {
        setProductAmounts(prev => ({ ...prev, ...initialAmounts }));
      }
    }
  }, [products]);

  const calculations = useMemo(() => {
    const breakdown = products.map((product) => ({
      name: product.name,
      label: product.name,
      amount: productAmounts[product.id] || 0,
      percentage: product.percentage,
      commission: (productAmounts[product.id] || 0) * (product.percentage / 100),
      color: product.color,
    }));

    const specialProductsTotal = Object.values(productAmounts).reduce(
      (sum, amount) => sum + amount,
      0
    );

    const restAmount = Math.max(0, totalInvoice - specialProductsTotal);
    const restCommission = restAmount * (restPercentage / 100);

    const totalCommission =
      breakdown.reduce((sum, item) => sum + item.commission, 0) + restCommission;

    return { breakdown, restAmount, restCommission, totalCommission };
  }, [totalInvoice, productAmounts, products, restPercentage]);

  const handleReset = () => {
    setTotalInvoice(0);
    const resetAmounts: Record<string, number> = {};
    products.forEach(p => { resetAmounts[p.id] = 0; });
    setProductAmounts(resetAmounts);
  };

  const handleProductChange = (id: string, value: number) => {
    setProductAmounts((prev) => ({ ...prev, [id]: value }));
  };

  const handleSaveInvoice = async (ncf: string, invoiceDate: string, clientId?: string) => {
    const productBreakdown = calculations.breakdown.map(b => ({
      name: b.name,
      amount: b.amount,
      percentage: b.percentage,
      commission: b.commission,
    }));

    const result = await saveInvoice(
      ncf, invoiceDate, totalInvoice, calculations.restAmount, restPercentage,
      calculations.restCommission, calculations.totalCommission, productBreakdown, clientId
    );

    if (result) {
      const ncfNumber = parseInt(ncf.slice(-4), 10);
      if (!isNaN(ncfNumber)) await updateLastNcfNumber(ncfNumber);
      handleReset();
    }
    return result;
  };

  const lastInvoice = invoices.length > 0 ? invoices[0] : undefined;
  const suggestedNcf = getNextNcfNumber();
  const isLoading = productsLoading || settingsLoading;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
                <Calculator className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Calculadora de Comisiones</h1>
                <p className="text-sm text-muted-foreground">Tu herramienta para calcular ganancias</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <SellerManager
                sellers={sellers}
                activeSeller={activeSeller}
                onSelectSeller={setActiveSeller}
                onAddSeller={addSeller}
                onUpdateSeller={updateSeller}
                onDeleteSeller={deleteSeller}
                onSetDefault={setDefaultSeller}
              />
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                className="h-10 w-10"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Tabs defaultValue="calculator" className="space-y-8">
          <TabsList className="grid w-full grid-cols-4 h-14 p-1.5 bg-muted rounded-xl">
            <TabsTrigger value="calculator" className="gap-2 text-base rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground">
              <Calculator className="h-5 w-5" />
              <span className="hidden sm:inline">Calculadora</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 text-base rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground">
              <History className="h-5 w-5" />
              <span className="hidden sm:inline">Historial</span>
            </TabsTrigger>
            <TabsTrigger value="breakdown" className="gap-2 text-base rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground">
              <Layers className="h-5 w-5" />
              <span className="hidden sm:inline">Desglose</span>
            </TabsTrigger>
            <TabsTrigger value="statistics" className="gap-2 text-base rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md text-muted-foreground">
              <BarChart3 className="h-5 w-5" />
              <span className="hidden sm:inline">Estadísticas</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator" className="mt-8">
            <CalculatorView
              products={products}
              productAmounts={productAmounts}
              totalInvoice={totalInvoice}
              setTotalInvoice={setTotalInvoice}
              calculations={calculations}
              restPercentage={restPercentage}
              isLoading={isLoading}
              onProductChange={handleProductChange}
              onReset={handleReset}
              onAddProduct={addProduct}
              onUpdateProduct={updateProduct}
              onDeleteProduct={deleteProduct}
              onUpdateRestPercentage={updateRestPercentage}
              onSaveInvoice={handleSaveInvoice}
              suggestedNcf={suggestedNcf}
              lastInvoice={lastInvoice}
              clients={clients}
              onAddClient={addClient}
              onDeleteClient={deleteClient}
              activeSeller={activeSeller}
            />
          </TabsContent>

          <TabsContent value="history">
            <InvoiceHistory 
              invoices={invoices} 
              loading={invoicesLoading} 
              onDelete={deleteInvoice}
              onUpdateInvoice={updateInvoice}
              clients={clients}
              products={products}
            />
          </TabsContent>

          <TabsContent value="breakdown">
            <MonthlyBreakdown 
              invoices={invoices}
              clients={clients}
              onUpdateInvoice={updateInvoice} 
              onDeleteInvoice={deleteInvoice}
              onRefreshInvoices={refetchInvoices}
              sellerName={activeSeller?.name}
            />
          </TabsContent>

          <TabsContent value="statistics">
            <Statistics invoices={invoices} sellerName={activeSeller?.name} clients={clients} />
          </TabsContent>
        </Tabs>
      </main>

      <SettingsPage
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        clients={clients}
        onRefetchClients={refetchClients}
      />
    </div>
  );
};

export default Index;
