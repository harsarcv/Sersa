
import { Navigate, Outlet, useLocation } from "react-router-dom";

function getTokenPayload() {
  try {
    const token = sessionStorage.getItem("sersa_token");

    if (!token) {
      return null;
    }

    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const paddedBase64 = base64.padEnd(
      Math.ceil(base64.length / 4) * 4,
      "="
    );

    const payload = JSON.parse(atob(paddedBase64));

    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

export default function ProtectedRoute({ allowedRoles }) {
  const location = useLocation();
  const payload = getTokenPayload();

  // Check authentication
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

  // Check user role
  const role = payload.role?.toLowerCase();

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
