
import { Navigate, Outlet, useLocation } from "react-router-dom";

function getTokenPayload() {
  try {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const payload = JSON.parse(atob(base64));

    // Periksa masa berlaku token
    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export default function ProtectedRoute({ allowedRoles }) {
  const location = useLocation();

  const payload = getTokenPayload();
  const token = sessionStorage.getItem("sersa_token");

  // Belum login atau token tidak valid
  if (!payload) {
    sessionStorage.removeItem("sersa_token");

    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // Ambil role dari JWT
  const role = payload.role?.toLowerCase();

  // Periksa hak akses halaman
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
