import React, { useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { useDatasetDDL } from '../../../../api/hooks/useOpenLineage';
import { LoadingSpinner } from '../../../common/LoadingSpinner';
import { AlertCircle, Copy, Check } from 'lucide-react';

interface DDLTabProps {
  datasetId: string;
  isActive: boolean;
}

export const DDLTab: React.FC<DDLTabProps> = ({ datasetId, isActive }) => {
  const { data, isLoading, error, refetch } = useDatasetDDL(datasetId, {
    enabled: isActive,
  });
  const [copied, setCopied] = useState(false);

  const handleCopy = (sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3">
        <LoadingSpinner size="sm" />
        <span className="text-sm text-slate-500">Loading DDL...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-2 text-slate-600 mb-2">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">Failed to load DDL</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-sm bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 overflow-y-auto">
      {/* Table comment */}
      {data.tableComment && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-600 mb-1">Table Comment</h4>
          <p className="text-sm text-slate-600 italic">{data.tableComment}</p>
        </div>
      )}

      {/* SQL for views */}
      {data.sourceType === 'VIEW' && data.viewSql ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-600">View Definition</h4>
            <button
              onClick={() => handleCopy(data.viewSql!)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
              aria-label="Copy SQL"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy SQL
                </>
              )}
            </button>
          </div>

          {/* Truncation warning */}
          {data.truncated && (
            <div className="mb-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
              SQL truncated at 12,500 characters. Full definition may be longer.
            </div>
          )}

          <Highlight theme={themes.vsDark} code={data.viewSql} language="sql">
            {({ style, tokens, getLineProps, getTokenProps }) => (
              <pre
                className="rounded-lg text-sm font-mono overflow-auto max-h-96 p-3"
                style={style}
              >
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    <span className="inline-block w-8 text-right mr-3 text-slate-500 select-none text-xs">
                      {i + 1}
                    </span>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </div>
      ) : data.sourceType === 'TABLE' && data.tableDdl ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-600">Table Definition</h4>
            <button
              onClick={() => handleCopy(data.tableDdl!)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
              aria-label="Copy DDL"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy DDL
                </>
              )}
            </button>
          </div>

          <Highlight theme={themes.vsDark} code={data.tableDdl} language="sql">
            {({ style, tokens, getLineProps, getTokenProps }) => (
              <pre
                className="rounded-lg text-sm font-mono overflow-auto max-h-96 p-3"
                style={style}
              >
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    <span className="inline-block w-8 text-right mr-3 text-slate-500 select-none text-xs">
                      {i + 1}
                    </span>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </div>
      ) : (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-sm text-slate-600">
            No DDL available for this dataset.
          </p>
        </div>
      )}

      {/* Column comments */}
      {data.columnComments && Object.keys(data.columnComments).length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <h4 className="text-sm font-medium text-slate-600 mb-2">Column Comments</h4>
          <dl className="space-y-2">
            {Object.entries(data.columnComments).map(([columnName, comment]) => (
              <div key={columnName}>
                <dt className="text-sm font-mono text-slate-700">{columnName}</dt>
                <dd className="text-sm text-slate-500 ml-4">{comment}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
};
