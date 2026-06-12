import PropTypes from "prop-types";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Bars3Icon } from "@heroicons/react/24/outline";
import {
  Avatar,
  Button,
  IconButton,
  Typography,
} from "@material-tailwind/react";
import { useMaterialTailwindController, setOpenSidenav } from "@/context";

export function Sidenav({ brandImg, brandName, routes }) {
  const [controller, dispatch] = useMaterialTailwindController();
  const { sidenavColor, sidenavType, openSidenav } = controller;
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const closeOnMobile = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setOpenSidenav(dispatch, false);
    }
  };

  const sidenavTypes = {
    dark: "bg-gradient-to-br from-gray-800 to-gray-900",
    white: "bg-white shadow-sm",
    transparent: "bg-transparent",
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    closeOnMobile();
    navigate("/auth/sign-in");
  };

  return (
    <aside
      className={`${sidenavTypes[sidenavType]} ${
        openSidenav ? "translate-x-0" : "-translate-x-full lg:-translate-x-80"
      } fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col overflow-y-auto border border-blue-gray-100 transition-transform duration-300 lg:my-4 lg:ml-4 lg:h-[calc(100vh-32px)] lg:rounded-xl`}
    >
      <div className="relative">
        <Link to="/dashboard" className="py-6 px-8 text-center flex items-center justify-center">
          <div className="w-full flex items-center justify-center">
            {brandImg ? (
              <img
                src={brandImg}
                alt={brandName}
                className="h-20 w-auto object-contain mx-auto"
              />
            ) : (
              <Typography
                variant="h6"
                color={sidenavType === "dark" ? "white" : "blue-gray"}
                className="text-center text-sm w-full"
              >
                {brandName}
              </Typography>
            )}
          </div>
        </Link>
        {/* No hamburger inside the sidenav when reverting */}
      </div>
      <div className="m-4 flex-1">
        {routes.map(({ layout, title, pages }, key) => {
          // Hide Auth pages (e.g., Sign In) from the sidebar
          if (layout === "auth") return null;
          let filteredPages = pages.filter(page => {
            if (!page.element?.props?.allowedRoles) return true;
            const hasAccess = page.element.props.allowedRoles.includes(user.user_type);
            if (user.user_type === "cemetery_staff" && (!page.name || page.name === "Menu")) {
              return false;
            }
            return hasAccess;
          });

          if (user.user_type === "customer") {
            const logoutIdx = filteredPages.findIndex(page => page.path === "/logout");
            if (logoutIdx !== -1) {
              const [logoutPage] = filteredPages.splice(logoutIdx, 1);
              filteredPages.push(logoutPage); // Move logout to the end
            }
          }

          if (filteredPages.length === 0) return null;

          return (
          <ul key={title || key} className="mb-3 flex flex-col gap-0.5">
            {title && (
              <li className="mx-3.5 mt-4 mb-2">
                <Typography
                  variant="small"
                  color={sidenavType === "dark" ? "white" : "blue-gray"}
                  className="font-black uppercase opacity-75"
                >
                  {title}
                </Typography>
              </li>
            )}
              {filteredPages.filter(page => !!page.name).map(({ icon, name, path }, idx) => {
                const itemKey = `${name || idx}-${path || idx}`;
                if (name === "Menu") {
                  return null;
                }
                if (path === "/logout") {
                  return (
                    <li key={itemKey}>
                      <Button
                        variant="text"
                        color="blue-gray"
                        size="sm"
                        className="flex items-center gap-3 px-3 capitalize"
                        fullWidth
                        onClick={handleLogout}
                      >
                        {icon}
                        <Typography
                          color="inherit"
                          className="font-medium capitalize"
                        >
                          {name}
                        </Typography>
                      </Button>
                    </li>
                  );
                }
                const fullPath = `/${layout}${path}`;
                return (
              <li key={itemKey}>
                    <NavLink
                      to={fullPath}
                      end={path === ""}
                    >
                  {({ isActive }) => (
                    <Button
                      variant={isActive ? "gradient" : "text"}
                      color={
                        isActive
                          ? sidenavColor
                          : sidenavType === "dark"
                          ? "white"
                          : "blue-gray"
                      }
                      size="sm"
                      className="flex items-center gap-3 px-3 capitalize text-left whitespace-nowrap overflow-hidden text-ellipsis"
                      fullWidth
                      onClick={closeOnMobile}
                    >
                      {icon}
                      <Typography
                        color="inherit"
                        className="font-medium capitalize truncate"
                      >
                        {name}
                      </Typography>
                    </Button>
                  )}
                </NavLink>
              </li>
                );
              })}
          </ul>
          );
        })}
      </div>
    </aside>
  );
}

Sidenav.defaultProps = {
  brandImg: "/img/divine-life-logo.png",
  brandName: "Divine Life Memorial Park",
};

Sidenav.propTypes = {
  brandImg: PropTypes.string,
  brandName: PropTypes.string,
  routes: PropTypes.arrayOf(PropTypes.object).isRequired,
};

Sidenav.displayName = "/src/widgets/layout/sidenav.jsx";

export default Sidenav;
