import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../test/test-utils';
import { Sidebar } from './Sidebar';

// TC-COMP-015: Sidebar Navigation
describe('Sidebar Component', () => {
  describe('TC-COMP-015: Navigation', () => {
    it('renders navigation links', () => {
      render(<Sidebar />);

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('renders Explore link pointing to root', () => {
      render(<Sidebar />);

      const exploreLink = screen.getByTitle('Explore');
      expect(exploreLink).toBeInTheDocument();
      expect(exploreLink).toHaveAttribute('href', '/');
    });

    it('renders Search link pointing to /search', () => {
      render(<Sidebar />);

      const searchLink = screen.getByTitle('Search');
      expect(searchLink).toBeInTheDocument();
      expect(searchLink).toHaveAttribute('href', '/search');
    });

    it('shows active styling for current route', () => {
      // Default route is '/' so Explore should be active
      render(<Sidebar />);

      const exploreLink = screen.getByTitle('Explore');
      // Active link should have these classes
      expect(exploreLink).toHaveClass('bg-slate-700');
      expect(exploreLink).toHaveClass('text-white');
    });

    it('shows inactive styling for non-current routes', () => {
      // Default route is '/' so Search should be inactive
      render(<Sidebar />);

      const searchLink = screen.getByTitle('Search');
      // Inactive link should have these classes
      expect(searchLink).toHaveClass('text-slate-400');
    });

    it('renders GitBranch logo', () => {
      render(<Sidebar />);

      // Check that the aside element exists (which contains the logo)
      const aside = screen.getByRole('complementary');
      expect(aside).toBeInTheDocument();
      expect(aside).toHaveClass('bg-slate-900');
    });

    it('has correct width styling', () => {
      render(<Sidebar />);

      const aside = screen.getByRole('complementary');
      expect(aside).toHaveClass('w-16');
    });
  });
});
