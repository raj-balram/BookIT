import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import { ToastProvider } from "./ToastContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SlotsPage from "./pages/SlotsPage.jsx";
import BookingsPage from "./pages/BookingsPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

function RequireAuth({ role }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="center muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}

function Layout() {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="nav">
        <strong className="brand">BookIt</strong>
        <nav>
          <NavLink to="/" end>Slots</NavLink>
          <NavLink to="/bookings">My bookings</NavLink>
          {user.role === "ADMIN" && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <span className="spacer" />
        <span className="muted">{user.name}</span>
        <button className="secondary" onClick={logout}>Log out</button>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<SlotsPage />} />
                <Route path="bookings" element={<BookingsPage />} />
                <Route element={<RequireAuth role="ADMIN" />}>
                  <Route path="admin" element={<AdminPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}