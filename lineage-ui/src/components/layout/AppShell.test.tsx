import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../test/test-utils';
import { AppShell } from './AppShell';
import * as useUIStoreModule from '../../stores/useUIStore';

// Mock the store
vi.mock('../../stores/useUIStore');

// TC-COMP-013: AppShell Sidebar Toggle
describe('AppShell Component', () => {
  describe('TC-COMP-013: Sidebar Toggle', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('renders Sidebar when sidebarOpen is true', () => {
      vi.mocked(useUIStoreModule.useUIStore).mockReturnValue({
        sidebarOpen: true,
        toggleSidebar: vi.fn(),
        setSidebarOpen: vi.fn(),
        searchQuery: '',
        setSearchQuery: vi.fn(),
      });

      render(
        <AppShell>
          <div data-testid="child-content">Content</div>
        </AppShell>
      );

      expect(screen.getByRole('complementary')).toBeInTheDocument();
    });

    it('hides Sidebar when sidebarOpen is false', () => {
      vi.mocked(useUIStoreModule.useUIStore).mockReturnValue({
        sidebarOpen: false,
        toggleSidebar: vi.fn(),
        setSidebarOpen: vi.fn(),
        searchQuery: '',
        setSearchQuery: vi.fn(),
      });

      render(
        <AppShell>
          <div data-testid="child-content">Content</div>
        </AppShell>
      );

      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    it('renders Header component', () => {
      vi.mocked(useUIStoreModule.useUIStore).mockReturnValue({
        sidebarOpen: true,
        toggleSidebar: vi.fn(),
        setSidebarOpen: vi.fn(),
        searchQuery: '',
        setSearchQuery: vi.fn(),
      });

      render(
        <AppShell>
          <div data-testid="child-content">Content</div>
        </AppShell>
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('renders children in main element', () => {
      vi.mocked(useUIStoreModule.useUIStore).mockReturnValue({
        sidebarOpen: true,
        toggleSidebar: vi.fn(),
        setSidebarOpen: vi.fn(),
        searchQuery: '',
        setSearchQuery: vi.fn(),
      });

      render(
        <AppShell>
          <div data-testid="child-content">Content</div>
        </AppShell>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByRole('main')).toContainElement(screen.getByTestId('child-content'));
    });
  });
});
