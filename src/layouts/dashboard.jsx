import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import {
  Sidenav,
  DashboardNavbar,
  Footer,
} from "@/widgets/layout";
import routes from "@/routes";
import { useMaterialTailwindController, setOpenSidenav } from "@/context";

export function Dashboard() {
  const [controller, dispatch] = useMaterialTailwindController();
  const { openSidenav } = controller;
  const location = useLocation();

  // Mapping pages should be non-scrollable and hide the footer
  const isMappingPage = (
    location.pathname.startsWith('/dashboard/lot-map') ||
    location.pathname.startsWith('/dashboard/customer-lot-map') ||
    location.pathname.startsWith('/dashboard/sector-on-map') ||
    location.pathname.startsWith('/dashboard/directional-guide')
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const closeOnSmallScreens = () => {
      if (window.innerWidth < 1024) {
        setOpenSidenav(dispatch, false);
      }
    };

    closeOnSmallScreens();
    window.addEventListener("resize", closeOnSmallScreens);
    return () => window.removeEventListener("resize", closeOnSmallScreens);
  }, [dispatch]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const shouldLockScroll = window.innerWidth < 1024 && openSidenav;

    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = previousBodyOverflow || "";
      document.documentElement.style.overflow = previousHtmlOverflow || "";
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [openSidenav]);

  return (
    <div className={`min-h-screen bg-blue-gray-50/50 ${isMappingPage ? 'overflow-hidden' : ''}`}>
      {openSidenav && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={() => setOpenSidenav(dispatch, false)}
        />
      )}
      <Sidenav
        brandImg="/img/divine_life.png"
        brandName="Divine Life Memorial Park"
        routes={routes}
      />
      <div className={`${isMappingPage ? 'p-2' : 'px-3 py-4 md:px-4'} transition-[margin] duration-300 ml-0 ${openSidenav ? 'lg:ml-80' : 'lg:ml-0'}`}>
        <DashboardNavbar />
        <Routes>
          {routes.map(
            ({ layout, pages }) =>
              layout === "dashboard" &&
              pages.map(({ path, element }) => (
                <Route exact path={path || "/"} element={element} />
              ))
          )}
        </Routes>
        {!isMappingPage && (
          <div className="text-blue-gray-600">
            <Footer />
          </div>
        )}
      </div>
    </div>
  );
}

Dashboard.displayName = "/src/layout/dashboard.jsx";

export default Dashboard;
