
import { Navigate, Route, Routes } from "react-router-dom";

import AuthLayout from "./layouts/AuthLayout";
import DashboardLayout from "./layouts/DashboardLayout";
import ProtectedRoute from "./components/ProtectedRoute";

// Authentication
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

// Shared
import Dashboard from "./pages/dashboard/Dashboard";

// Admin
import Team from "./pages/team/Team";
import Services from "./pages/services/Services";
import Reports from "./pages/reports/Reports";
import BusinessSettings from "./pages/settings/BusinessSettings";

// Staff
import Customers from "./pages/customers/Customers";
import ServiceRequests from "./pages/service-requests/ServiceRequests";
import Appointments from "./pages/appointments/Appointments";

// Technician
import WorkOrders from "./pages/work-orders/WorkOrders";

// Temporary pages
function ComingSoon({ title }) {
  return (
    <div>
      <h2>{title}</h2>
      <p>Halaman ini sedang dalam tahap pengembangan.</p>
    </div>
  );
}

export default function App() {
  const token = sessionStorage.getItem("sersa_token");

  return (
    <Routes>
      {/* PUBLIC ROUTES */}
      <Route element={<AuthLayout />}>
        <Route
          path="/"
          element={
            token ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* AUTHENTICATED ROUTES */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          {/* ALL ROLES */}
          <Route path="/dashboard" element={<Dashboard />} />

          {/* ADMIN */}
          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route path="/team" element={<Team />} />
            <Route path="/services" element={<Services />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<BusinessSettings />} />
          </Route>

          {/* STAFF */}
          <Route element={<ProtectedRoute allowedRoles={["staff"]} />}>
            <Route path="/customers" element={<Customers />} />
            <Route path="/service-requests" element={<ServiceRequests />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route
              path="/invoices"
              element={<ComingSoon title="Invoice" />}
            />
            <Route
              path="/payments"
              element={<ComingSoon title="Pembayaran" />}
            />
          </Route>

          {/* TECHNICIAN */}
          <Route element={<ProtectedRoute allowedRoles={["technician"]} />}>
            <Route path="/work-orders" element={<WorkOrders />} />
          </Route>
        </Route>
      </Route>

      {/* UNKNOWN ROUTES */}
      <Route
        path="*"
        element={<Navigate to="/login" replace />}
      />
    </Routes>
  );
}
