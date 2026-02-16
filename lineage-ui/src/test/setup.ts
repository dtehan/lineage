import '@testing-library/jest-dom';
import { vi } from 'vitest';
import * as matchers from 'vitest-axe/matchers';
import { expect } from 'vitest';
import type { LayoutWorkerAPI } from '../workers/layout.types';

// Add vitest-axe matchers
expect.extend(matchers);

// Mock ResizeObserver
const ResizeObserverMock = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

globalThis.ResizeObserver = ResizeObserverMock;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Worker for Web Worker tests
// In tests, we mock the Worker to return a simple object that simulates
// the Comlink-wrapped API. The actual layout computation is bypassed in tests.
class WorkerMock {
  url: string | URL;
  options?: WorkerOptions;

  constructor(url: string | URL, options?: WorkerOptions) {
    this.url = url;
    this.options = options;
  }

  postMessage = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  terminate = vi.fn();
  dispatchEvent = vi.fn();
  onerror = null;
  onmessage = null;
  onmessageerror = null;
}

globalThis.Worker = WorkerMock as unknown as typeof Worker;

// Mock Comlink for Worker communication
// In tests, we mock Comlink's wrap() to return a mock layout API
// that uses the real layoutGraph function (not in a Worker)
vi.mock('comlink', () => ({
  wrap: vi.fn(() => {
    const mockLayoutAPI: LayoutWorkerAPI = {
      layout: async (rawNodes, rawEdges, options) => {
        // Import the real layoutGraph function and call it directly
        // This bypasses the Worker in tests but uses the same layout logic
        const { layoutGraph } = await import('../utils/graph/layoutEngine');
        return layoutGraph(rawNodes, rawEdges, options);
      },
    };
    return mockLayoutAPI;
  }),
  expose: vi.fn(),
}));
