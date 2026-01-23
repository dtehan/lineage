import { memo, useState } from 'react';
import { ChevronDown, ChevronUp, Info, HelpCircle } from 'lucide-react';
import { Tooltip } from '../../common/Tooltip';

interface LegendItem {
  color: string;
  label: string;
  description?: string;
}

const TRANSFORMATION_TYPES: LegendItem[] = [
  {
    color: '#22C55E',
    label: 'Direct',
    description: 'Direct column mapping with no transformation',
  },
  {
    color: '#3B82F6',
    label: 'Derived',
    description: 'Column derived through expression or calculation',
  },
  {
    color: '#A855F7',
    label: 'Aggregated',
    description: 'Column created through aggregation (SUM, COUNT, etc.)',
  },
  {
    color: '#06B6D4',
    label: 'Joined',
    description: 'Column involved in a join operation',
  },
  {
    color: '#9CA3AF',
    label: 'Unknown',
    description: 'Transformation type could not be determined',
  },
];

export const Legend = memo(function Legend() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="absolute top-4 right-4 z-10">
      <div className="bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
          aria-expanded={isExpanded}
          aria-label="Toggle legend"
        >
          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Info size={14} />
            Edge Types
          </span>
          {isExpanded ? (
            <ChevronDown size={14} className="text-slate-500" />
          ) : (
            <ChevronUp size={14} className="text-slate-500" />
          )}
        </button>

        {/* Legend items */}
        {isExpanded && (
          <div className="px-3 py-2 space-y-1.5">
            {TRANSFORMATION_TYPES.map((item) => (
              <Tooltip
                key={item.label}
                content={item.description}
                position="left"
              >
                <div className="flex items-center gap-2 cursor-help">
                  {/* Color line indicator */}
                  <div
                    className="w-5 h-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-slate-600">{item.label}</span>
                  <HelpCircle size={10} className="text-slate-400" />
                </div>
              </Tooltip>
            ))}

            {/* Confidence indicator */}
            <Tooltip
              content="Higher opacity indicates more confident lineage relationships"
              position="left"
            >
              <div className="pt-1.5 mt-1.5 border-t border-slate-200 cursor-help">
                <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                  Line opacity = confidence
                  <HelpCircle size={10} className="text-slate-400" />
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-1 bg-gradient-to-r from-slate-300 to-slate-600 rounded-full" />
                  <span className="text-[10px] text-slate-400">Low</span>
                  <span className="text-[10px] text-slate-400">→</span>
                  <span className="text-[10px] text-slate-400">High</span>
                </div>
              </div>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
});
