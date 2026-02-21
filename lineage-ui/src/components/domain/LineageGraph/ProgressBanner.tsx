interface ProgressBannerProps {
  message: string;
  visible: boolean;
}

export function ProgressBanner({ message, visible }: ProgressBannerProps) {
  if (!visible) return null;
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b border-blue-200 text-xs text-blue-700"
      role="status"
      aria-live="polite"
    >
      {/* Small spinning indicator */}
      <svg className="animate-spin h-3 w-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {message}
    </div>
  );
}
