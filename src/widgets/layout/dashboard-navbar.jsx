import { useLocation, Link, useNavigate } from "react-router-dom";
import {
  Navbar,
  Typography,
  Button,
  IconButton,
  Breadcrumbs,
  Menu,
  MenuHandler,
  MenuList,
  MenuItem,
  Chip,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Input as MTInput,
} from "@material-tailwind/react";
import {
  UserCircleIcon,
  PowerIcon,
  Bars3Icon,
} from "@heroicons/react/24/solid";
import {
  useMaterialTailwindController,
  setOpenSidenav,
} from "@/context";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/configs/api";
import React, { useState, useEffect } from "react";

const roleColors = {
  admin: "green",
  cemetery_staff: "blue",
  staff: "blue",
  cashier: "purple",
  customer: "gray",
};

const roleLabels = {
  admin: "Administrator",
  cemetery_staff: "Cemetery Staff",
  staff: "Cemetery Staff",
  cashier: "Cashier",
  customer: "Customer",
};

export function DashboardNavbar() {
  const [controller, dispatch] = useMaterialTailwindController();
  const { fixedNavbar, openSidenav } = controller;
  const { pathname } = useLocation();
  const [layout, page] = pathname.split("/").filter((el) => el !== "");
  const { user, logout, updateProfile } = useAuth();
  const navigate = useNavigate();

  

  // Profile edit modal state
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [profile, setProfile] = useState({
    username: user?.username || "",
    email: user?.email || "",
    contact: user?.contact_number || user?.contact || "",
    first_name: user?.first_name || "",
    middle_name: user?.middle_name || "",
    last_name: user?.last_name || "",
  });
  const formatContact = (val) => {
    const digits = String(val || '').replace(/\D/g, '');
    const tail = digits.replace(/^639?/, '').replace(/^09?/, '');
    const limited = tail.slice(0, 9);
    return `+639${limited}`;
  };

  useEffect(() => {
    // refresh profile values from backend when opening modal to ensure DB truth
    const fetchProfile = async () => {
      try {
        if (!user?.id) return;
        const res = await fetch(`${API_ENDPOINTS.GET_PROFILE}?user_id=${user.id}`);
        const data = await res.json();
        if (data.success && data.profile) {
          const p = data.profile;
          setProfile({
            username: p.username || user?.username || "",
            email: p.email || "",
            contact: formatContact(p.contact_number || p.contact || "+639"),
            first_name: p.first_name || "",
            middle_name: p.middle_name || "",
            last_name: p.last_name || "",
          });
        }
      } catch (_) {
        // fallback to localStorage value
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        setProfile(prev => ({
          username: u.username || prev.username,
          email: u.email || prev.email,
          contact: formatContact(u.contact_number || u.contact || prev.contact || '+639'),
          first_name: u.first_name || prev.first_name,
          middle_name: u.middle_name || prev.middle_name,
          last_name: u.last_name || prev.last_name,
        }));
      }
    };
    if (profileOpen) fetchProfile();
  }, [profileOpen, user?.id]);
  const [profileError, setProfileError] = useState("");
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // Determine the correct page label
  let pageLabel = page;
  let layoutLabel = layout;
  
  if (!page && layout === "dashboard") {
    pageLabel = "Dashboard";
  }
  
  // Format labels properly
  if (layout === "cashier-dashboard") {
    layoutLabel = "Dashboard";
  } else if (layout === "dashboard") {
    layoutLabel = "Dashboard";
  } else {
    layoutLabel = layout.charAt(0).toUpperCase() + layout.slice(1);
  }
  
  // Format page label
  const pageLabelOverrides = {
    "customer-lot-map": "Lot Map",
    "lot-map": "Lot Map",
  };

  const mobilePageLabelAbbreviations = {
    "customer-lot-map": "Lot Map",
    "lot-map": "Lot Map",
    "make-payment": "Payment",
    "backup-recovery": "Backup",
    "payment-monitoring": "Payments",
    "directional-guide": "Directions",
    "deceased-records": "Deceased",
    "ownership": "Ownership",
    "lot-search": "Lot Search",
    "cashier-customers": "Customers",
  };

  if (page && pageLabelOverrides[page]) {
    pageLabel = pageLabelOverrides[page];
  } else if (pageLabel) {
    pageLabel = pageLabel.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  const hidePageBreadcrumb = ["customer-dashboard", "cashier-dashboard", "staff-dashboard"].includes(page);
  if (hidePageBreadcrumb) {
    pageLabel = "Dashboard";
  }

  const handleLogout = () => {
    logout();
    navigate("/auth/sign-in");
  };

  // Handle profile save (stub, replace with API call)
  const handleProfileSave = async () => {
    if (!profile.email || !profile.contact) {
      setProfileError("Email and contact number are required.");
      return;
    }
    if (!/^\+639\d{9}$/.test(profile.contact)) {
      setProfileError('Contact number must be in +639XXXXXXXXX format');
      return;
    }
    const usernameChanged = (profile.username || '') !== (user?.username || '');
    if (usernameChanged && !profileCurrentPassword) {
      setProfileError('Enter current password to confirm username change');
      return;
    }
    try {
      if (user?.id) {
        const res = await fetch(API_ENDPOINTS.UPDATE_PROFILE, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-User-Id": String(user.id) },
          body: JSON.stringify({ id: user.id, username: profile.username, email: profile.email, contact_number: profile.contact, current_password: profileCurrentPassword })
        });
        const result = await res.json();
        if (!result?.success) {
          const msg = result?.message || "Failed to save profile. Please try again.";
          setProfileError(msg);
          alert(msg);
          return;
        }
      }
      // Update profile in context/localStorage on success
      updateProfile({
        username: profile.username,
        email: profile.email,
        contact: profile.contact,
      });
      setProfileError("");
      setProfileOpen(false);
      setProfileCurrentPassword("");
      alert('Profile updated successfully');
    } catch (e) {
      setProfileError("Failed to save profile. Please try again.");
      alert("Failed to save profile. Please try again.");
    }
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);

  const handleChangePassword = async () => {
    const pwd = newPassword || "";
    if (pwd.length < 8 || !/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd) || !/[^a-zA-Z0-9]/.test(pwd)) {
      alert('Password must be at least 8 chars with uppercase, number, and special character');
      return;
    }
    if (pwd !== confirmNewPassword) {
      alert('New password and confirm password do not match');
      return;
    }
    try {
      const res = await fetch(API_ENDPOINTS.UPDATE_PROFILE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(user?.id || '') },
        body: JSON.stringify({ id: user?.id, username: user?.username, email: profile.email, password: pwd, current_password: currentPassword })
      });
      const data = await res.json();
      if (!data?.success) {
        alert(data?.message || 'Failed to update password');
        return;
      }
      alert('Password updated');
      setNewPassword('');
      setCurrentPassword('');
      setConfirmNewPassword('');
      setChangePassOpen(false);
    } catch (e) {
      alert('Failed to update password');
    }
  };

  return (
    <Navbar
      color={"white"}
      className={"rounded-xl sticky top-4 z-40 py-3 shadow-md shadow-blue-gray-500/5 transition-all"}
      fullWidth
      blurred
    >
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
        <div className="flex items-center gap-2 capitalize flex-1 min-w-0">
          <IconButton
            variant="text"
            color="blue-gray"
            className="mr-2"
            onClick={() => setOpenSidenav(dispatch, !openSidenav)}
          >
            <Bars3Icon className="h-6 w-6 text-blue-gray-500" />
          </IconButton>
          <Breadcrumbs
            className={`bg-transparent p-0 transition-all ${
              fixedNavbar ? "mt-1" : ""
            } flex-nowrap items-center gap-1 min-w-0 text-xs sm:text-base`}
            separator={
              <span className="text-blue-gray-300 text-xs sm:text-base">/</span>
            }
          >
            {page && !hidePageBreadcrumb ? (
              [
                <Link key="layout" to={`/${layout}`}>
                  <Typography
                    variant="small"
                    color="blue-gray"
                    className="font-normal opacity-50 transition-all hover:text-blue-500 hover:opacity-100 truncate"
                  >
                    {layoutLabel}
                  </Typography>
                </Link>,
                <React.Fragment key="page-labels">
                  <Typography
                    variant="small"
                    color="blue-gray"
                    className="font-normal truncate hidden sm:inline"
                  >
                    {pageLabel}
                  </Typography>
                  <Typography
                    variant="small"
                    color="blue-gray"
                    className="font-normal truncate sm:hidden"
                  >
                    {mobilePageLabelAbbreviations[page] || (pageLabel?.split(" ")[0] ?? pageLabel)}
                  </Typography>
                </React.Fragment>
              ]
            ) : (
              <Typography
                variant="small"
                color="blue-gray"
                className="font-normal"
              >
                {pageLabel}
              </Typography>
            )}
          </Breadcrumbs>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <Chip
            variant="gradient"
            color={roleColors[user?.user_type] || "gray"}
            value={roleLabels[user?.user_type] || "User"}
            className="py-1.5 text-[10px] leading-none sm:hidden"
          />
          <Chip
            variant="gradient"
            color={roleColors[user?.user_type] || "gray"}
            value={roleLabels[user?.user_type] || "User"}
            className="py-1.5 hidden sm:inline-flex text-xs"
          />
          
          {/* User menu with Edit Profile */}
          <Menu>
            <MenuHandler>
              <IconButton variant="text" color="blue-gray" className="w-10 h-10 min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] aspect-square rounded-full overflow-hidden flex items-center justify-center">
                <UserCircleIcon className="h-5 w-5 text-blue-gray-500" />
              </IconButton>
            </MenuHandler>
            <MenuList className="w-max">
              <MenuItem className="flex items-center gap-3">
                <UserCircleIcon className="h-5 w-5" />
                <div>
                  <Typography variant="small" color="blue-gray" className="mb-1 font-normal">
                    <strong>{user?.username || "User"}</strong>
                  </Typography>
                  <Typography
                    variant="small"
                    className="font-normal text-blue-gray-500"
                  >
                    {user?.email || "No email"}
                  </Typography>
                </div>
              </MenuItem>
              <MenuItem onClick={() => setProfileOpen(true)}>
                Edit Profile
              </MenuItem>
              <MenuItem onClick={() => setChangePassOpen(true)}>
                Change Password
              </MenuItem>
              <hr className="my-2 border-blue-gray-50" />
              <MenuItem className="flex items-center gap-2 text-red-500" onClick={handleLogout}>
                <PowerIcon className="h-4 w-4" />
                <Typography variant="small" className="font-normal">
                  Sign Out
                </Typography>
              </MenuItem>
            </MenuList>
          </Menu>
        </div>
      </div>
      {/* Edit Profile Modal */}
      <Dialog open={profileOpen} handler={() => setProfileOpen(false)} size="sm">
        <DialogHeader>Edit Profile</DialogHeader>
        <DialogBody divider className="flex flex-col gap-4">
          <MTInput label="Username" value={profile.username} onChange={e => setProfile({ ...profile, username: e.target.value })} />
          <MTInput label="First Name" value={profile.first_name} disabled />
          <MTInput label="Middle Name" value={profile.middle_name} disabled />
          <MTInput label="Last Name" value={profile.last_name} disabled />
          <MTInput
            label="Email"
            type="email"
            value={profile.email}
            onChange={e => setProfile({ ...profile, email: e.target.value })}
            required
          />
          <MTInput
            label="Contact Number"
            type="text"
            value={profile.contact}
            onChange={e => setProfile({ ...profile, contact: formatContact(e.target.value) })}
            onKeyDown={(e) => {
              const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab'];
              if (allowed.includes(e.key)) return;
              if (!/\d/.test(e.key)) e.preventDefault();
            }}
            inputMode="numeric"
            maxLength={13}
            required
          />
          {(profile.username || '') !== (user?.username || '') && (
            <MTInput
              label="Current Password (required for username change)"
              type="password"
              value={profileCurrentPassword}
              onChange={e => setProfileCurrentPassword(e.target.value)}
            />
          )}
          <Typography variant="small" color="red" className="text-center">
            {profileError}
          </Typography>
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="blue-gray" onClick={() => setProfileOpen(false)}>
            Cancel
          </Button>
          <Button variant="gradient" color="blue" onClick={handleProfileSave}>
            Save
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={changePassOpen} handler={() => setChangePassOpen(false)} size="sm">
        <DialogHeader>Change Password</DialogHeader>
        <DialogBody divider className="flex flex-col gap-4">
          <div className="relative">
            <MTInput
              label="Current Password"
              type={showCurrentPwd ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs" onClick={() => setShowCurrentPwd(v => !v)}>
              {showCurrentPwd ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="relative">
            <MTInput
              label="New Password"
              type={showPwd ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs" onClick={() => setShowPwd(v => !v)}>
              {showPwd ? 'Hide' : 'Show'}
            </button>
          </div>
          <div>
            <MTInput
              label="Confirm New Password"
              type={showPwd ? 'text' : 'password'}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
            />
          </div>
          <Typography variant="small" color="blue-gray" className="opacity-70">
            Password must be at least 8 characters and include an uppercase letter, a number, and a special character.
          </Typography>
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="blue-gray" onClick={() => setChangePassOpen(false)}>
            Cancel
          </Button>
          <Button variant="gradient" color="blue" onClick={handleChangePassword}>
            Update Password
          </Button>
        </DialogFooter>
      </Dialog>
    </Navbar>
  );
}

DashboardNavbar.displayName = "/src/widgets/layout/dashboard-navbar.jsx";

export default DashboardNavbar;
