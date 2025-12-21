import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Lock, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

// CONFIGURACIÓN DE SEGURIDAD
const MAX_ATTEMPTS = 3;
const TIME_WINDOW = 60 * 60 * 1000; // 1 hora en milisegundos
const AUTH_EXPIRY_DAYS = 30; // Duración de la sesión en días
// NOTA: Cambia esto por tu contraseña deseada o usa una variable de entorno
const CORRECT_PASSWORD = import.meta.env.VITE_APP_PASSWORD || 'Gabriel17';

interface SecurityGateProps {
  children: React.ReactNode;
}

export const SecurityGate = ({ children }: SecurityGateProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<number[]>([]);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  useEffect(() => {
    // 1. Verificar si ya está autenticado y no ha expirado
    const auth = localStorage.getItem('app_auth_authenticated');
    const authTimestamp = localStorage.getItem('app_auth_timestamp');
    
    // Verificar expiración (30 días por defecto)
    if (auth === 'true' && authTimestamp) {
      const timestamp = parseInt(authTimestamp, 10);
      const expiryTime = timestamp + (AUTH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const now = Date.now();
      
      if (now < expiryTime) {
        setIsAuthenticated(true);
        setLoading(false);
        return;
      } else {
        // Sesión expirada, limpiar
        localStorage.removeItem('app_auth_authenticated');
        localStorage.removeItem('app_auth_timestamp');
      }
    }
    
    // 2. Cargar intentos fallidos previos
    const storedAttempts = JSON.parse(localStorage.getItem('app_auth_attempts') || '[]');
    
    // Limpiar intentos viejos (fuera de la ventana de 1 hora)
    const now = Date.now();
    const validAttempts = storedAttempts.filter((timestamp: number) => now - timestamp < TIME_WINDOW);
    
    setAttempts(validAttempts);
    
    // Verificar si está bloqueado actualmente
    if (validAttempts.length >= MAX_ATTEMPTS) {
      // El bloqueo dura 1 hora desde el intento que provocó el exceso
      const oldestAttempt = Math.min(...validAttempts);
      const lockTime = oldestAttempt + TIME_WINDOW;
      
      if (now < lockTime) {
        setLockedUntil(lockTime);
      }
    }
    
    setLoading(false);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Verificar bloqueo antes de procesar
    if (lockedUntil && Date.now() < lockedUntil) {
      const remainingMinutes = Math.ceil((lockedUntil - Date.now()) / 60000);
      toast.error(`Sistema bloqueado. Espera ${remainingMinutes} minutos.`);
      return;
    }

    if (password === CORRECT_PASSWORD) {
      // ÉXITO - Guardar autenticación con timestamp para persistencia
      setIsAuthenticated(true);
      localStorage.setItem('app_auth_authenticated', 'true');
      localStorage.setItem('app_auth_timestamp', Date.now().toString());
      localStorage.removeItem('app_auth_attempts'); // Resetear intentos al entrar
      toast.success('Acceso concedido');
    } else {
      // FALLO
      const now = Date.now();
      const newAttempts = [...attempts, now];
      
      // Filtrar de nuevo para asegurar ventana de tiempo correcta
      const validAttempts = newAttempts.filter(t => now - t < TIME_WINDOW);
      
      setAttempts(validAttempts);
      localStorage.setItem('app_auth_attempts', JSON.stringify(validAttempts));
      
      if (validAttempts.length >= MAX_ATTEMPTS) {
        const lockTime = Math.min(...validAttempts) + TIME_WINDOW;
        setLockedUntil(lockTime);
        toast.error('Límite de intentos alcanzado. Acceso bloqueado por 1 hora.');
      } else {
        const remaining = MAX_ATTEMPTS - validAttempts.length;
        toast.error(`Contraseña incorrecta. ${remaining} intento(s) restante(s).`);
        // Efecto de vibración o feedback visual podría ir aquí
      }
      
      setPassword('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // Si está autenticado, renderizar la app
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Si no, mostrar pantalla de bloqueo
  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;
  const remainingTime = isLocked ? Math.ceil((lockedUntil! - Date.now()) / 60000) : 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-md shadow-2xl border-t-4 border-t-primary animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto h-16 w-16 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full flex items-center justify-center border border-primary/10 shadow-inner">
            {isLocked ? (
              <AlertTriangle className="h-8 w-8 text-destructive animate-pulse" />
            ) : (
              <Lock className="h-8 w-8 text-primary" />
            )}
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">Acceso Restringido</CardTitle>
            <CardDescription className="text-base mt-1">
              {isLocked 
                ? "Sistema de seguridad activado" 
                : "Introduce tu clave de acceso para continuar"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña Alfanumérica</Label>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLocked}
                  className="text-center text-lg tracking-widest h-12 bg-muted/30 focus:bg-background transition-all"
                  autoFocus
                  autoComplete="current-password"
                />
                <ShieldCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/50" />
              </div>
            </div>
            
            {isLocked && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex items-start gap-3 animate-in slide-in-from-top-2">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="font-medium">
                  Has excedido el límite de seguridad ({MAX_ATTEMPTS} intentos/hora).
                  <br />
                  <span className="block mt-1 opacity-80">
                    Desbloqueo en: <strong>{remainingTime} minutos</strong>
                  </span>
                </div>
              </div>
            )}
            
            <Button 
              type="submit" 
              className="w-full h-12 text-base font-medium shadow-md hover:shadow-lg transition-all" 
              disabled={isLocked || !password}
            >
              {isLocked ? 'Bloqueado Temporalmente' : 'Ingresar al Sistema'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t py-6 bg-muted/20">
          <p className="text-xs text-muted-foreground text-center flex flex-col gap-1">
            <span className="font-medium">Seguridad Activa</span>
            <span>Máximo {MAX_ATTEMPTS} intentos fallidos por hora</span>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};