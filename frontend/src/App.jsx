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

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/services" element={<Services />} />
          <Route
            path="/service-requests"
            element={<ServiceRequests />}
          />
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/team" element={<Team />} />
          <Route path="/work-orders" element={<WorkOrders />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to="/login" replace />}
      />
    </Routes>
  );
}