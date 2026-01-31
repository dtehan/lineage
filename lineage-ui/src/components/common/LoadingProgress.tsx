/**
 * Size variants for the LoadingProgress component
 */
type LoadingProgressSize = 'sm' | 'md' | 'lg';

/**
 * Props for the LoadingProgress component
 */
interface LoadingProgressProps {
  /** Progress value (0-100) */
  progress: number;
  /** Stage message to display */
  message: string;
  /** Size variant */
  size?: LoadingProgressSize;
}

/**
 * Height classes for progress bar based on size
 */
const heightClasses: Record<LoadingProgressSize, string> = {
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-4',
};

/**
 * Width classes for progress bar container based on size
 */
const widthClasses: Record<LoadingProgressSize, string> = {
  sm: 'w-48',
  md: 'w-64',
  lg: 'w-80',
};

/**
 * Text size classes based on size
 */
const textClasses: Record<LoadingProgressSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

/**
 * LoadingProgress component displays a progress bar with stage text
 *
 * Features:
 * - Visual progress bar showing 0-100% completion
 * - Stage message text below the bar
 * - Three size variants (sm, md, lg)
 * - Smooth progress animation via CSS transitions
 * - Proper ARIA attributes for accessibility
 */
export function LoadingProgress({
  progress,
  message,
  size = 'md',
}: LoadingProgressProps) {
  // Clamp progress between 0 and 100
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className={`${widthClasses[size]} ${heightClasses[size]} bg-slate-200 rounded-full overflow-hidden`}
      >
        <div
          className="h-full bg-blue-500 transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={message || 'Loading progress'}
        />
      </div>
      {message && (
        <span className={`${textClasses[size]} text-slate-600`}>{message}</span>
      )}
    </div>
  );
}
