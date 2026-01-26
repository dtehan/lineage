import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface BackButtonProps {
  label?: string;
  className?: string;
}

export function BackButton({ label = 'Back', className = '' }: BackButtonProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(-1)}
      className={`flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 ${className}`}
    >
      <ChevronLeft className="w-4 h-4" />
      {label}
    </button>
  );
}
