import { useSyncExternalStore } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken, logout, subscribeAuth } from './api/client';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Users from './pages/Users';
import Devices from './pages/Devices';
import Config from './pages/Config';
import Workflows from './pages/Workflows';

export function useIsAuthed(): boolean {
  return useSyncExternalStore(subscribeAuth, getAccessToken, () => null) !== null;
}

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/users', label: 'Users', end: false },
  { to: '/devices', label: 'Devices', end: false },
  { to: '/workflows', label: 'Workflows', end: false },
  { to: '/config', label: 'Config', end: false },
];

function Shell() {
  const authed = useIsAuthed();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!authed) return <Navigate to="/login" replace />;

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">botvy<span>admin</span></div>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="navlink">
            {item.label}
          </NavLink>
        ))}
        <button
          className="logout"
          onClick={() => {
            logout();
            queryClient.clear();
            navigate('/login', { replace: true });
          }}
        >
          Log out
        </button>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="users" element={<Users />} />
        <Route path="devices" element={<Devices />} />
        <Route path="workflows" element={<Workflows />} />
        <Route path="config" element={<Config />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
