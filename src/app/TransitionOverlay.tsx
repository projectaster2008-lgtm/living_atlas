import React from 'react';
import { Compass } from 'lucide-react';

interface TransitionOverlayProps {
  label: string | null;
}

export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({ label }) => {
  if (!label) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090e16]/94"
    >
      <div className="atlas-modal flex items-center gap-3.5 px-6 py-4 rounded-[var(--atlas-radius-lg)]">
        <Compass className="w-5 h-5 text-[#d9a14a] animate-spin" aria-hidden="true" />
        <span className="font-atlas-display text-base md:text-lg text-[#f3ede0] tracking-wide">
          {label}
        </span>
      </div>
    </div>
  );
};
