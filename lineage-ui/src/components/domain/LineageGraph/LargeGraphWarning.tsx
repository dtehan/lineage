import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Session storage key for dismissed warning state
 */
const DISMISSED_KEY = 'lineage-large-graph-warning-dismissed';

/**
 * Props for the LargeGraphWarning component
 */
export interface LargeGraphWarningProps {
  /** Current node count in the graph */
  nodeCount: number;
  /** Current depth setting */
  currentDepth: number;
  /** Suggested depth for better performance */
  suggestedDepth: number;
  /** Callback when user accepts the depth suggestion */
  onAcceptSuggestion: () => void;
  /** Callback when user dismisses the warning */
  onDismiss: () => void;
}

/**
 * Threshold above which to show the warning
 */
export const LARGE_GRAPH_THRESHOLD = 200;

/**
 * LargeGraphWarning component displays a non-blocking warning banner
 * when the graph has 200+ nodes, with an optional depth reduction suggestion.
 *
 * Features:
 * - Shows warning for graphs with LARGE_GRAPH_THRESHOLD+ nodes
 * - Suggests reducing depth when currentDepth > suggestedDepth
 * - Quick-apply button for depth reduction
 * - Dismissible with session persistence
 * - Non-blocking (informational, not a gate)
 */
export function LargeGraphWarning({
  nodeCount,
  currentDepth,
  suggestedDepth,
  onAcceptSuggestion,
  onDismiss,
}: LargeGraphWarningProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  // Check session storage on mount
  useEffect(() => {
    const dismissed = sessionStorage.getItem(DISMISSED_KEY);
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Don't show if node count is below threshold
  if (nodeCount < LARGE_GRAPH_THRESHOLD) {
    return null;
  }

  // Don't show if user has dismissed
  if (isDismissed) {
    return null;
  }

  const showDepthSuggestion = currentDepth > suggestedDepth;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setIsDismissed(true);
    onDismiss();
  };

  const handleAcceptSuggestion = () => {
    onAcceptSuggestion();
    // Also dismiss the warning after accepting
    handleDismiss();
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800"
      role="alert"
      aria-live="polite"
    >
      <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" aria-hidden="true" />
      <div className="flex-1 text-sm">
        <span className="font-medium">Large graph detected:</span>{' '}
        <span>{nodeCount} nodes. This may take a moment to render.</span>
        {showDepthSuggestion && (
          <span className="ml-1">
            Try reducing depth from {currentDepth} to {suggestedDepth} for faster rendering.
          </span>
        )}
      </div>
      {showDepthSuggestion && (
        <button
          onClick={handleAcceptSuggestion}
          className="px-3 py-1 text-sm font-medium bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-md transition-colors"
          aria-label={`Use depth ${suggestedDepth} instead of ${currentDepth}`}
        >
          Use depth {suggestedDepth}
        </button>
      )}
      <button
        onClick={handleDismiss}
        className="p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-100 rounded transition-colors"
        aria-label="Dismiss warning"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
