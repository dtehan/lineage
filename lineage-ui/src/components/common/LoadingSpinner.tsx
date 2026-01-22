interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function LoadingSpinner({ size = 'md' }: LoadingSpinnerProps) {
  return (
    <div
      className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-slate-200 border-t-blue-500`}
      role="status"
      aria-label="Loading"
    />
  );
}
