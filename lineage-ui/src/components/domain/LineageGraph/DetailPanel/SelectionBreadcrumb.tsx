import React from 'react';
import { ChevronRight, Database, Table as TableIcon, Columns } from 'lucide-react';

interface SelectionBreadcrumbProps {
  databaseName: string;
  tableName: string;
  columnName?: string;
}

export const SelectionBreadcrumb: React.FC<SelectionBreadcrumbProps> = ({
  databaseName,
  tableName,
  columnName,
}) => {
  return (
    <nav
      aria-label="Selection hierarchy"
      className="flex items-center gap-1 text-xs overflow-hidden"
    >
      <Database className="w-3 h-3 flex-shrink-0 text-slate-400" />
      <span className="text-slate-500 truncate max-w-[80px]" title={databaseName}>
        {databaseName}
      </span>
      <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-300" />
      <TableIcon className="w-3 h-3 flex-shrink-0 text-slate-400" />
      <span className={`truncate max-w-[80px] ${columnName ? 'text-slate-500' : 'font-medium text-slate-700'}`} title={tableName}>
        {tableName}
      </span>
      {columnName && (
        <>
          <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-300" />
          <Columns className="w-3 h-3 flex-shrink-0 text-blue-500" />
          <span className="font-medium text-slate-700 truncate" title={columnName}>
            {columnName}
          </span>
        </>
      )}
    </nav>
  );
};
