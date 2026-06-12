import {
  HomeIcon,
  MapIcon,
  UserGroupIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
  ArrowLeftOnRectangleIcon,
  ClockIcon,
  UsersIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/solid";
import { Home } from "@/pages/dashboard";
import AdminHome from "@/pages/admin-dashboard/home";
import { SignIn } from "@/pages/auth";
import { Unauthorized } from "@/pages/dashboard/unauthorized";
import { AccountManagement } from "@/pages/admin-dashboard/AccountManagement";
import { ActivityLog as AdminActivityLog } from "@/pages/admin-dashboard/ActivityLog";
import { LotMapView } from "@/pages/admin-dashboard/LotMapView";
import { OwnershipManagement } from "@/pages/admin-dashboard/OwnershipManagement";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Reports } from "@/pages/admin-dashboard/Reports";
import { BackupRecovery } from "@/pages/admin-dashboard/BackupRecovery";
import { CashierCustomerTable } from "@/pages/cashier-dashboard/CashierCustomerTable";
import LotSearch from "@/pages/staff-dashboard/LotSearch";
import DeceasedRecords from "@/pages/staff-dashboard/DeceasedRecords";
import GoogleMapView from "@/pages/mapping/GoogleMapView";
import SectorDetailPage from "@/pages/mapping/SectorDetailPage";
import DirectionalGuide from "@/pages/mapping/DirectionalGuide";
import {
  MyPlots,
  MakePayment,
} from "@/pages/customer-dashboard";
import { Home as CustomerHome } from "@/pages/customer-dashboard/home-fixed";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Home as StaffHome } from "@/pages/staff-dashboard";
import { ActivityLog as StaffActivityLog } from "@/pages/staff-dashboard/ActivityLog";
import { Home as CashierHome } from "@/pages/cashier-dashboard/home-fixed";


const icon = {
  className: "w-5 h-5 text-inherit",
};

function RoleBasedDashboard() {
  const { user } = useAuth();
  if (user?.user_type === "cemetery_staff" || user?.user_type === "staff") return <StaffHome />;
  if (user?.user_type === "cashier") return <CashierHome />;
  if (user?.user_type === "customer") return <CustomerHome />;
  return <AdminHome />;
}

function RoleBasedActivityLog() {
  const { user } = useAuth();
  if (user?.user_type === "admin") return <AdminActivityLog />;
  return <StaffActivityLog />;
}

export const routes = [
  {
    title: "Dashboard",
    layout: "dashboard",
    pages: [
      {
        icon: <HomeIcon {...icon} />,
        name: "Dashboard",
        path: "",
        element: (
          <ProtectedRoute allowedRoles={["admin", "cemetery_staff", "staff", "cashier", "customer"]}>
            <RoleBasedDashboard />
          </ProtectedRoute>
        ),
      },
      {
        icon: <MapIcon {...icon} />,
        name: "Lot Map View",
        path: "/lot-map",
        element: (
          <ProtectedRoute allowedRoles={["admin", "cemetery_staff", "staff"]}>
            <GoogleMapView />
          </ProtectedRoute>
        ),
      },
      {
        path: "/sector-on-map/:garden/:sector",
        element: (
          <ProtectedRoute allowedRoles={["admin", "cemetery_staff", "staff", "customer"]}>
            <SectorDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/directional-guide/:garden/:sector/:lotNumber/:blockNumber",
        element: (
          <ProtectedRoute allowedRoles={["admin", "cemetery_staff", "staff", "customer"]}>
            <DirectionalGuide />
          </ProtectedRoute>
        ),
      },
      {
        icon: <MapIcon {...icon} />,
        name: "Lot Search",
        path: "/lot-search",
        element: (
          <ProtectedRoute allowedRoles={["cemetery_staff", "staff"]}>
            <LotSearch />
          </ProtectedRoute>
        ),
      },
      {
        icon: <UsersIcon {...icon} />,
        name: "Account Management",
        path: "/accounts",
        element: (
          <ProtectedRoute allowedRoles={["admin", "cemetery_staff", "staff"]}>
            <AccountManagement />
          </ProtectedRoute>
        ),
      },
      {
        icon: <ClockIcon {...icon} />,
        name: "Activity Log",
        path: "/activity-log",
        element: (
          <ProtectedRoute allowedRoles={["admin", "cemetery_staff", "staff"]}>
            <RoleBasedActivityLog />
          </ProtectedRoute>
        ),
      },
      {
        icon: <ArrowPathIcon {...icon} />,
        name: "Backup & Recovery",
        path: "/backup-recovery",
        element: (
          <ProtectedRoute allowedRoles={["admin"]}>
            <BackupRecovery />
          </ProtectedRoute>
        ),
      },
      {
        icon: <DocumentTextIcon {...icon} />,
        name: "Ownership Management",
        path: "/ownership",
        element: (
          <ProtectedRoute allowedRoles={["admin", "cemetery_staff", "staff"]}>
            <OwnershipManagement />
          </ProtectedRoute>
        ),
      },
      {
        icon: <UserGroupIcon {...icon} />,
        name: "Deceased Records",
        path: "/deceased-records",
        element: (
          <ProtectedRoute allowedRoles={["admin", "cemetery_staff", "staff"]}>
            <DeceasedRecords />
          </ProtectedRoute>
        ),
      },
      {
        icon: <CurrencyDollarIcon {...icon} />,
        name: "Payment Monitoring",
        path: "/payments",
        element: (
          <ProtectedRoute allowedRoles={["admin"]}>
            <CashierCustomerTable />
          </ProtectedRoute>
        ),
      },
      {
        icon: <UserGroupIcon {...icon} />,
        name: "Payment Monitoring",
        path: "/cashier-customers",
        element: (
          <ProtectedRoute allowedRoles={["cashier"]}>
            <CashierCustomerTable />
          </ProtectedRoute>
        ),
      },
      {
        icon: <DocumentTextIcon {...icon} />,
        name: "Reports",
        path: "/reports",
        element: (
          <ProtectedRoute allowedRoles={["admin", "cashier", "cemetery_staff", "staff"]}>
            <Reports />
          </ProtectedRoute>
        ),
      },
      {
        icon: <ArrowLeftOnRectangleIcon {...icon} />,
        name: "Logout",
        path: "/logout",
        element: (
          <ProtectedRoute allowedRoles={["admin", "cemetery_staff", "staff", "cashier", "customer"]}>
            <CustomerHome />
          </ProtectedRoute>
        ),
      },
      {
        path: "/unauthorized",
        element: <Unauthorized />,
      },
      {
        icon: <MapIcon {...icon} />,
        name: "Lot Map",
        path: "/customer-lot-map",
        element: (
          <ProtectedRoute allowedRoles={["customer"]}>
            <GoogleMapView />
          </ProtectedRoute>
        ),
      },
      {
        icon: <CurrencyDollarIcon {...icon} />,
        name: "Make Payment",
        path: "/make-payment",
        element: (
          <ProtectedRoute allowedRoles={["customer"]}>
            <MakePayment />
          </ProtectedRoute>
        ),
      },
    ],
  },
  {
    title: "Auth",
    layout: "auth",
    pages: [
      {
        icon: <UserCircleIcon {...icon} />,
        name: "sign in",
        path: "/sign-in",
        element: <SignIn />,
      },
    ],
  },
];

export default routes;
