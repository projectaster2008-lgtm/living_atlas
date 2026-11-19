import React from 'react';
import { Compass } from 'lucide-react';

interface TransitionOverlayProps {
  label: string | null;
}

export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({ label }) => {
  if (!label) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b111a]/95">
      <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-[#0d131d] border border-amber-300/35 shadow-2xl">
        <Compass className="w-5 h-5 text-amber-300 animate-spin" />
        <span className="text-sm md:text-base font-medium text-[#f7f2e8] tracking-wide">{label}</span>
      </div>
    </div>
  );
};
