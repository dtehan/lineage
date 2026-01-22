import { NavLink } from 'react-router-dom';
import { LayoutGrid, Search, GitBranch } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutGrid, label: 'Explore' },
  { to: '/search', icon: Search, label: 'Search' },
];

export function Sidebar() {
  return (
    <aside className="w-16 bg-slate-900 flex flex-col items-center py-4">
      <div className="mb-8">
        <GitBranch className="w-8 h-8 text-blue-400" />
      </div>
      <nav className="flex flex-col gap-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `p-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
            title={label}
          >
            <Icon className="w-5 h-5" />
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
