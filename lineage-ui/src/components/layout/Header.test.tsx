import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../test/test-utils';
import { Header } from './Header';
import * as useUIStoreModule from '../../stores/useUIStore';

// Mock the store
vi.mock('../../stores/useUIStore');

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// TC-COMP-014: Header Search Submission
describe('Header Component', () => {
  const mockToggleSidebar = vi.fn();
  const mockSetSearchQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useUIStoreModule.useUIStore).mockReturnValue({
      sidebarOpen: true,
      toggleSidebar: mockToggleSidebar,
      setSidebarOpen: vi.fn(),
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
    });
  });

  describe('TC-COMP-014: Search Submission', () => {
    it('navigates to search page when form is submitted with query', async () => {
      const user = userEvent.setup();

      vi.mocked(useUIStoreModule.useUIStore).mockReturnValue({
        sidebarOpen: true,
        toggleSidebar: mockToggleSidebar,
        setSidebarOpen: vi.fn(),
        searchQuery: 'test query',
        setSearchQuery: mockSetSearchQuery,
      });

      render(<Header />);

      const searchInput = screen.getByPlaceholderText(/Search databases, tables, columns/);
      expect(searchInput).toBeInTheDocument();

      // Submit the form by pressing Enter
      await user.type(searchInput, '{enter}');

      expect(mockNavigate).toHaveBeenCalledWith('/search?q=test%20query');
    });

    it('does not navigate when search query is empty', async () => {
      const user = userEvent.setup();

      vi.mocked(useUIStoreModule.useUIStore).mockReturnValue({
        sidebarOpen: true,
        toggleSidebar: mockToggleSidebar,
        setSidebarOpen: vi.fn(),
        searchQuery: '',
        setSearchQuery: mockSetSearchQuery,
      });

      render(<Header />);

      const searchInput = screen.getByPlaceholderText(/Search databases, tables, columns/);
      await user.type(searchInput, '{enter}');

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not navigate when search query is whitespace only', async () => {
      const user = userEvent.setup();

      vi.mocked(useUIStoreModule.useUIStore).mockReturnValue({
        sidebarOpen: true,
        toggleSidebar: mockToggleSidebar,
        setSidebarOpen: vi.fn(),
        searchQuery: '   ',
        setSearchQuery: mockSetSearchQuery,
      });

      render(<Header />);

      const searchInput = screen.getByPlaceholderText(/Search databases, tables, columns/);
      await user.type(searchInput, '{enter}');

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('updates search query when typing', async () => {
      const user = userEvent.setup();

      render(<Header />);

      const searchInput = screen.getByPlaceholderText(/Search databases, tables, columns/);
      await user.type(searchInput, 'test');

      expect(mockSetSearchQuery).toHaveBeenCalled();
    });
  });

  describe('Sidebar Toggle', () => {
    it('calls toggleSidebar when menu button is clicked', async () => {
      const user = userEvent.setup();

      render(<Header />);

      const menuButton = screen.getByRole('button', { name: /toggle sidebar/i });
      await user.click(menuButton);

      expect(mockToggleSidebar).toHaveBeenCalledTimes(1);
    });
  });

  describe('Title', () => {
    it('displays Data Lineage title', () => {
      render(<Header />);

      expect(screen.getByText('Data Lineage')).toBeInTheDocument();
    });
  });
});
