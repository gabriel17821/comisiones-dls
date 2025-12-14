import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

interface SaveSuccessAnimationProps {
  show: boolean;
  onComplete: () => void;
}

export const SaveSuccessAnimation = ({ show, onComplete }: SaveSuccessAnimationProps) => {
  const [phase, setPhase] = useState<'loading' | 'success' | 'hidden'>('hidden');

  useEffect(() => {
    if (show) {
      setPhase('loading');
      
      // Show loading for 1.5s
      const loadingTimeout = setTimeout(() => {
        setPhase('success');
      }, 1500);

      // Show success for 1s then complete
      const successTimeout = setTimeout(() => {
        setPhase('hidden');
        onComplete();
      }, 3000);

      return () => {
        clearTimeout(loadingTimeout);
        clearTimeout(successTimeout);
      };
    }
  }, [show, onComplete]);

  if (phase === 'hidden') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="flex flex-col items-center gap-6">
        {phase === 'loading' && (
          <>
            <div className="relative h-20 w-20">
              {/* Outer ring */}
              <svg className="h-20 w-20 animate-spin" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="6"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray="80 200"
                  className="origin-center"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-foreground animate-pulse">Guardando factura...</p>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="h-20 w-20 rounded-full gradient-success flex items-center justify-center animate-scale-in">
              <Check className="h-10 w-10 text-success-foreground" strokeWidth={3} />
            </div>
            <div className="text-center animate-fade-in">
              <p className="text-xl font-bold text-success">¡Factura guardada!</p>
              <p className="text-sm text-muted-foreground mt-1">Preparando nueva factura...</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
