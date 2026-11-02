
import { Navigate, Route, Routes } from "react-router-dom";

import AuthLayout from "./layouts/AuthLayout";
import DashboardLayout from "./layouts/DashboardLayout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

import Dashboard from "./pages/dashboard/Dashboard";
import Customers from "./pages/customers/Customers";
import Services from "./pages/services/Services";
import ServiceRequests from "./pages/service-requests/ServiceRequests";
import Team from "./pages/team/Team";
import WorkOrders from "./pages/work-orders/WorkOrders";
import Appointments from "./pages/appointments/Appointments";

// Halaman sementara untuk fitur yang belum dibuat
function ComingSoon({ title }) {
  return (
    <div>
      <h2>{title}</h2>
      <p>Halaman ini sedang dalam tahap pengembangan.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>

      {/* PUBLIC ROUTES */}
      <Route element={<AuthLayout />}>
        <Route
          path="/"
          element={
            sessionStorage.getItem("sersa_token")
              ? <Navigate to="/dashboard" replace />
              : <Navigate to="/login" replace />
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

          {/* ADMIN ROUTES */}
          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route path="/team" element={<Team />} />
            <Route path="/services" element={<Services />} />

            <Route
              path="/reports"
              element={<ComingSoon title="Laporan Bisnis" />}
            />

            <Route
              path="/settings"
              element={<ComingSoon title="Pengaturan Bisnis" />}
            />
          </Route>

          {/* STAFF ROUTES */}
          <Route element={<ProtectedRoute allowedRoles={["staff"]} />}>
            <Route path="/customers" element={<Customers />} />

            <Route
              path="/service-requests"
              element={<ServiceRequests />}
            />

            <Route
              path="/appointments"
              element={<Appointments />}
            />

            <Route
              path="/invoices"
              element={<ComingSoon title="Invoice" />}
            />

            <Route
              path="/payments"
              element={<ComingSoon title="Pembayaran" />}
            />
          </Route>

          {/* TECHNICIAN ROUTES */}
          <Route element={<ProtectedRoute allowedRoles={["technician"]} />}>
            <Route
              path="/work-orders"
              element={<WorkOrders />}
            />
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
