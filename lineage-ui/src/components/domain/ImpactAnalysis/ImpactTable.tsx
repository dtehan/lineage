import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { ImpactAsset } from '../../../types/openlineage';

interface ImpactTableProps {
  data: ImpactAsset[];
}

const columnHelper = createColumnHelper<ImpactAsset>();

const columns = [
  columnHelper.accessor('databaseName', {
    header: 'Database',
    cell: info => info.getValue(),
  }),
  columnHelper.accessor('tableName', {
    header: 'Table',
    cell: info => info.getValue(),
  }),
  columnHelper.accessor('columnName', {
    header: 'Column',
    cell: info => info.getValue(),
  }),
  columnHelper.accessor('depth', {
    header: 'Depth',
    cell: info => {
      const depth = info.getValue();
      const badgeColor =
        depth === 1
          ? 'bg-blue-100 text-blue-700'
          : depth === 2
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-700';

      return (
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${badgeColor}`}>
          {depth}
        </span>
      );
    },
  }),
  columnHelper.accessor('impactType', {
    header: 'Impact Type',
    cell: info => {
      const impactType = info.getValue();
      const badgeColor =
        impactType === 'direct'
          ? 'bg-red-100 text-red-700'
          : 'bg-amber-100 text-amber-700';

      return (
        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${badgeColor}`}>
          {impactType}
        </span>
      );
    },
  }),
];

export function ImpactTable({ data }: ImpactTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-500">No impacted assets found</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-left text-sm font-medium text-slate-600"
                >
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className={`flex items-center gap-2 ${
                        header.column.getCanSort() ? 'cursor-pointer hover:text-slate-900' : ''
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && <ChevronUp size={14} />}
                      {header.column.getIsSorted() === 'desc' && <ChevronDown size={14} />}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-200">
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="hover:bg-slate-50">
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="px-4 py-3 text-sm text-slate-900">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 text-sm text-slate-600">
        Showing {data.length} impacted asset{data.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
