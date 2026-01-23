import { useCallback, RefObject } from 'react';
import { useLineageStore } from '../../../../stores/useLineageStore';

export interface UseLineageExportOptions {
  wrapperRef: RefObject<HTMLDivElement>;
}

export interface UseLineageExportReturn {
  exportPng: () => Promise<void>;
  exportSvg: () => Promise<void>;
  exportJson: () => void;
  isExporting: boolean;
}

/**
 * Hook to handle exporting the lineage graph in various formats
 *
 * Supports (per spec Section 5.2):
 * - PNG: Rasterized image
 * - SVG: Vector image
 * - JSON: Raw graph data
 */
export function useLineageExport({
  wrapperRef,
}: UseLineageExportOptions): UseLineageExportReturn {
  const { nodes, edges } = useLineageStore();

  /**
   * Downloads a data URL as a file
   */
  const downloadFile = useCallback((dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  /**
   * Filter function for excluding controls from export
   */
  const exportFilter = (node: HTMLElement): boolean => {
    const className = node.className || '';
    if (typeof className === 'string') {
      return (
        !className.includes('react-flow__controls') &&
        !className.includes('react-flow__minimap')
      );
    }
    return true;
  };

  /**
   * Exports the graph as PNG
   */
  const exportPng = useCallback(async () => {
    if (!wrapperRef.current) {
      console.warn('Export wrapper ref not available');
      return;
    }

    try {
      // Dynamic import to avoid bundle bloat if not used
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const htmlToImage = await import('html-to-image' as any);
      const toPng = htmlToImage.toPng as (
        node: HTMLElement,
        options?: Record<string, unknown>
      ) => Promise<string>;

      // Find the React Flow viewport element
      const viewport = wrapperRef.current.querySelector(
        '.react-flow__viewport'
      );
      if (!viewport) {
        console.warn('React Flow viewport not found');
        return;
      }

      const dataUrl = await toPng(viewport as HTMLElement, {
        backgroundColor: '#ffffff',
        pixelRatio: 2, // Higher resolution
        filter: exportFilter,
      });

      const timestamp = new Date().toISOString().split('T')[0];
      downloadFile(dataUrl, `lineage-graph-${timestamp}.png`);
    } catch (error) {
      console.error('Failed to export PNG:', error);
      // Fallback: show error to user
      alert(
        'Failed to export PNG. The html-to-image library may not be installed.'
      );
    }
  }, [wrapperRef, downloadFile]);

  /**
   * Exports the graph as SVG
   */
  const exportSvg = useCallback(async () => {
    if (!wrapperRef.current) {
      console.warn('Export wrapper ref not available');
      return;
    }

    try {
      // Dynamic import to avoid bundle bloat if not used
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const htmlToImage = await import('html-to-image' as any);
      const toSvg = htmlToImage.toSvg as (
        node: HTMLElement,
        options?: Record<string, unknown>
      ) => Promise<string>;

      // Find the React Flow viewport element
      const viewport = wrapperRef.current.querySelector(
        '.react-flow__viewport'
      );
      if (!viewport) {
        console.warn('React Flow viewport not found');
        return;
      }

      const dataUrl = await toSvg(viewport as HTMLElement, {
        backgroundColor: '#ffffff',
        filter: exportFilter,
      });

      const timestamp = new Date().toISOString().split('T')[0];
      downloadFile(dataUrl, `lineage-graph-${timestamp}.svg`);
    } catch (error) {
      console.error('Failed to export SVG:', error);
      // Fallback: show error to user
      alert(
        'Failed to export SVG. The html-to-image library may not be installed.'
      );
    }
  }, [wrapperRef, downloadFile]);

  /**
   * Exports the graph data as JSON
   */
  const exportJson = useCallback(() => {
    const graphData = {
      exportedAt: new Date().toISOString(),
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        databaseName: node.databaseName,
        tableName: node.tableName,
        columnName: node.columnName,
        metadata: node.metadata,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        transformationType: edge.transformationType,
        confidenceScore: edge.confidenceScore,
      })),
    };

    const jsonString = JSON.stringify(graphData, null, 2);
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(
      jsonString
    )}`;

    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(dataUrl, `lineage-graph-${timestamp}.json`);
  }, [nodes, edges, downloadFile]);

  return {
    exportPng,
    exportSvg,
    exportJson,
    isExporting: false, // Could track async export state if needed
  };
}
