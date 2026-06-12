import { useState, useEffect, useRef } from "react";
import {
  Card,
  Input,
  Button,
  Typography,
  Alert,
} from "@material-tailwind/react";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/configs/api";
import { useNavigate } from "react-router-dom";

export function SignIn() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [requiresEmail, setRequiresEmail] = useState(false);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordUsername, setForgotPasswordUsername] = useState("");
  const [useEmailForForgotPassword, setUseEmailForForgotPassword] = useState(true);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [cameFromEmailRequirement, setCameFromEmailRequirement] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [savedPassword, setSavedPassword] = useState("");
  const navigate = useNavigate();
  const { login, addEmailDuringLogin, changePassword, updateProfile } = useAuth();

  const maskEmail = (email = "") => {
    if (!email.includes("@")) return email;
    const [local, domain] = email.split("@");
    if (!local || !domain) return email;
    if (local.length <= 3) {
      return `${local[0]}***@${domain}`;
    }
    const visiblePrefix = local.slice(0, 3);
    const visibleSuffix = local.slice(-1);
    const masked = `${visiblePrefix}${"*".repeat(Math.max(local.length - 4, 3))}${visibleSuffix}`;
    return `${masked}@${domain}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login(username, password);
      
      if (result.success) {
        if (result.requires_email) {
          // Email required - show email input form
          setRequiresEmail(true);
          setPendingUser(result.user);
          setSavedPassword(password); // Save password to retry login after email is added
          setCameFromEmailRequirement(false); // Reset flag
        } else if (result.requires_password_change) {
          // Password change required - show password change form
          setRequiresPasswordChange(true);
          setPendingUser(result.user);
        }
        // Otherwise, login successful - navigation is handled in AuthContext
      } else {
        setError(result.message || "Invalid username or password");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = () => {
    setRequiresEmail(true);
    setShowChangeEmail(false);
    setError("");
    // Clear emailInput so user can enter new email
    setEmailInput("");
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError("");
    setForgotPasswordSuccess(false);
    
    if (useEmailForForgotPassword) {
      if (!forgotPasswordEmail || forgotPasswordEmail.trim() === '') {
        setError("Please provide your email address");
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(forgotPasswordEmail.trim())) {
        setError("Please provide a valid email address");
        return;
      }
    } else {
      if (!forgotPasswordUsername || forgotPasswordUsername.trim() === '') {
        setError("Please provide your username");
        return;
      }
    }

    setForgotPasswordLoading(true);

    try {
      const requestBody = useEmailForForgotPassword 
        ? { email: forgotPasswordEmail.trim() }
        : { username: forgotPasswordUsername.trim() };

      const response = await fetch(API_ENDPOINTS.FORGOT_PASSWORD, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      const result = await response.json();
      
      if (result.success) {
        setForgotPasswordSuccess(true);
        setError("");
        
        // After 3 seconds, redirect back to login form
        setTimeout(() => {
          setShowForgotPassword(false);
          setForgotPasswordSuccess(false);
          setError("");
          // Clear password field so user can enter the new password from email
          setPassword("");
        }, 3000);
      } else {
        setError(result.message || "Failed to send password reset email");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setEmailLoading(true);

    const emailProvided = emailInput && emailInput.trim();

    // If email is provided, validate it
    if (emailProvided) {
    // Basic email validation (backend will validate .com requirement)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput)) {
      setError("Please enter a valid email address");
      setEmailLoading(false);
      return;
    }
    
    // Check for .com requirement (backend will also validate this)
    if (!emailInput.toLowerCase().endsWith('.com')) {
      setError("Email must be a .com address (e.g. name@gmail.com)");
      setEmailLoading(false);
      return;
      }
    }

    try {
      // If email provided, save it; otherwise skip
      if (emailProvided) {
        // Save email immediately
        const result = await addEmailDuringLogin(pendingUser.id, emailInput);
        
        if (!result.success) {
          setRequiresEmail(true);
          setError(result.message || "Failed to save email address");
          setEmailLoading(false);
          return;
        }
        
        // Retry login with saved password (2FA disabled, so this should complete login or require password change)
        const loginResult = await login(username, savedPassword);
        
        if (!loginResult.success) {
          setRequiresEmail(true);
          setError(loginResult.message || "Failed to proceed with login");
        } else {
          // If password change is required, show that form
          if (loginResult.requires_password_change) {
            setRequiresPasswordChange(true);
            setPendingUser(loginResult.user);
          } else {
            // Login complete, email form can be closed
            setRequiresEmail(false);
            setPendingUser(null);
            setSavedPassword("");
            setEmailInput("");
          }
        }
      } else {
        // Skip email - proceed with login without email requirement
        setRequiresEmail(false);
        const loginResult = await login(username, savedPassword, { skipEmail: true });
        
        if (loginResult.success) {
          // Login successful - clear all email-related state
          setRequiresEmail(false);
          setPendingUser(null);
          setSavedPassword("");
          setEmailInput("");
          
          // If password change is required, show that form
          if (loginResult.requires_password_change) {
            setRequiresPasswordChange(true);
            setPendingUser(loginResult.user);
          } else {
            // Login is complete - navigation should happen in AuthContext
            // But ensure we navigate if it didn't happen
            const userType = loginResult.user?.user_type || loginResult.user?.account_type;
            if (userType) {
              // Navigation should already happen in AuthContext, but ensure it does
              navigate('/dashboard', { replace: true });
            }
          }
        } else if (loginResult.requires_email) {
          // Should not happen with skipEmail flag, but handle gracefully
          setRequiresEmail(true);
          setError(loginResult.message || "Email is still required.");
        } else {
          setRequiresEmail(true);
          setError(loginResult.message || "Failed to proceed with login");
        }
      }
    } catch (err) {
      setRequiresEmail(true);
      setError("An error occurred. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError("");

    if (!newPassword || newPassword.trim() === '') {
      setError("New password is required");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Password complexity check
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one number");
      return;
    }
    if (!/[^a-zA-Z0-9]/.test(newPassword)) {
      setError("Password must contain at least one special character");
      return;
    }

    setPasswordChangeLoading(true);

    try {
      const result = await changePassword(pendingUser.id, newPassword, confirmPassword);
      
      if (result.success) {
        // Password changed successfully, update user and proceed to dashboard
        const updatedUser = { 
          ...pendingUser, 
          using_default: 0,
          user_type: pendingUser.user_type || pendingUser.account_type || 'customer'
        };
        updateProfile({ using_default: 0 });
        localStorage.setItem('user', JSON.stringify(updatedUser));
        
        // Navigate to dashboard
        const userType = updatedUser.user_type || updatedUser.account_type;
        switch (userType) {
          case 'admin':
          case 'cemetery_staff':
          case 'staff':
          case 'cashier':
          case 'customer':
            navigate('/dashboard', { replace: true });
            break;
          default:
            navigate('/auth/sign-in', { replace: true });
        }
      } else {
        setError(result.message || "Failed to change password");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  const handleSkipPasswordChange = () => {
    // Allow user to skip password change and proceed to dashboard
    setRequiresPasswordChange(false);
    const user = pendingUser || {};
    const userType = user.user_type || user.account_type;
    switch (userType) {
      case 'admin':
      case 'cemetery_staff':
      case 'staff':
      case 'cashier':
      case 'customer':
        navigate('/dashboard', { replace: true });
        break;
      default:
        navigate('/auth/sign-in', { replace: true });
    }
  };

  const handleBackToLogin = () => {
    // Always go back to initial login form
    // Email is not saved until OTP is verified, so they'll need to enter it again
    setRequiresEmail(false);
    setRequiresPasswordChange(false);
    setSendingVerification(false);
    setEmailInput("");
    setNewPassword("");
    setConfirmPassword("");
    setPendingUser(null);
    setSavedPassword("");
    setError("");
    setCameFromEmailRequirement(false);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <Card className="w-full max-w-md p-8 shadow-xl">
          <div className="text-center mb-8">
            <Typography variant="h3" className="font-bold text-gray-900 mb-2">
              Divine Life Memorial Park
            </Typography>
            <Typography variant="paragraph" color="blue-gray" className="text-lg font-normal">
              Cemetery Management System
            </Typography>
            {/* Forgot password note */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <Typography variant="small" color="blue-gray" className="text-xs">
                Forgot password? Contact us via Facebook to verify and reset.
                <br/>
                <a className="text-blue-600 underline" href="https://www.facebook.com/divinelifememorialpark2022" target="_blank" rel="noreferrer">Visit Facebook Page</a>
              </Typography>
            </div>
          </div>
          {showForgotPassword ? (
            <form className="flex flex-col gap-6" onSubmit={handleForgotPassword}>
              {error && (
                <Alert color="red" variant="ghost">
                  {error}
                </Alert>
              )}
              {forgotPasswordSuccess && (
                <Alert color="green" variant="ghost">
                  Password reset email sent! Please check your email for the new password. Redirecting to login in 3 seconds...
                </Alert>
              )}
              <div className="flex items-center justify-between mb-2">
                <Typography variant="small" color="blue-gray" className="font-medium">
                  {useEmailForForgotPassword ? "Email Address" : "Username"}
                </Typography>
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  onClick={() => {
                    setUseEmailForForgotPassword(!useEmailForForgotPassword);
                    setError("");
                    setForgotPasswordEmail("");
                    setForgotPasswordUsername("");
                  }}
                  className="text-xs p-1 h-auto"
                  disabled={forgotPasswordSuccess}
                >
                  {useEmailForForgotPassword ? "Use Username" : "Use Email"}
                </Button>
              </div>
              {useEmailForForgotPassword ? (
                <Input
                  type="email"
                  size="lg"
                  placeholder="Enter your email address"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                  disabled={forgotPasswordSuccess}
                  className="!border-t-blue-gray-200 focus:!border-t-blue-500"
                  labelProps={{
                    className: "before:content-none after:content-none",
                  }}
                />
              ) : (
                <Input
                  size="lg"
                  placeholder="Enter your username"
                  value={forgotPasswordUsername}
                  onChange={(e) => setForgotPasswordUsername(e.target.value)}
                  required
                  disabled={forgotPasswordSuccess}
                  className="!border-t-blue-gray-200 focus:!border-t-blue-500"
                  labelProps={{
                    className: "before:content-none after:content-none",
                  }}
                />
              )}
              <Button 
                type="submit" 
                className="mt-4" 
                color="blue" 
                size="lg"
                fullWidth
                disabled={forgotPasswordLoading || forgotPasswordSuccess}
              >
                {forgotPasswordLoading ? "Sending..." : forgotPasswordSuccess ? "Email Sent" : "Send Reset Password"}
              </Button>
              <Button 
                type="button"
                variant="text"
                size="sm"
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotPasswordEmail("");
                  setForgotPasswordUsername("");
                  setForgotPasswordSuccess(false);
                  setError("");
                }}
                className="text-xs text-center"
                disabled={forgotPasswordSuccess}
              >
                Back to Login
              </Button>
            </form>
          ) : requiresPasswordChange ? (
            <form className="flex flex-col gap-6" onSubmit={handlePasswordChange}>
              {error && (
                <Alert color="red" variant="ghost">
                  {error}
                </Alert>
              )}
              <div>
                <Typography variant="h6" color="blue-gray" className="mb-4 text-center">
                  Change Your Password
                </Typography>
                <Typography variant="small" color="gray" className="mb-4 text-center text-xs">
                  For security, please change your temporary password to a new one.
                </Typography>
              </div>
              <div>
                <Typography variant="small" color="blue-gray" className="mb-2 font-medium">
                  New Password
                </Typography>
                <Input
                  type="password"
                  size="lg"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="!border-t-blue-gray-200 focus:!border-t-blue-500"
                  labelProps={{
                    className: "before:content-none after:content-none",
                  }}
                />
                <Typography variant="small" color="gray" className="mt-1 text-xs">
                  Must be at least 8 characters with uppercase, number, and special character
                </Typography>
              </div>
              <div>
                <Typography variant="small" color="blue-gray" className="mb-2 font-medium">
                  Confirm Password
                </Typography>
                <Input
                  type="password"
                  size="lg"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="!border-t-blue-gray-200 focus:!border-t-blue-500"
                  labelProps={{
                    className: "before:content-none after:content-none",
                  }}
                />
              </div>
              <Button 
                type="submit" 
                className="mt-4" 
                color="blue" 
                size="lg"
                fullWidth
                disabled={passwordChangeLoading}
              >
                {passwordChangeLoading ? "Changing Password..." : "Change Password"}
              </Button>
              <Button 
                type="button"
                variant="text"
                size="sm"
                onClick={handleSkipPasswordChange}
                className="text-xs text-center"
              >
                Skip for Now
              </Button>
            </form>
          ) : requiresEmail ? (
            <form className="flex flex-col gap-6" onSubmit={handleEmailSubmit}>
              {error && (
                <Alert color="red" variant="ghost">
                  {error}
                </Alert>
              )}
              <div>
                <Typography variant="small" color="blue-gray" className="mb-2 font-medium">
                  Email Address (Recommended)
                </Typography>
                <Typography variant="small" color="gray" className="mb-4 text-xs">
                  Email address is recommended for customer accounts to enable secure login verification. You can add it now or skip for later.
                </Typography>
                <Input
                  type="email"
                  size="lg"
                  placeholder="Enter your email address (optional)"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="!border-t-blue-gray-200 focus:!border-t-blue-500"
                  labelProps={{
                    className: "before:content-none after:content-none",
                  }}
                />
              </div>
              <Button 
                type="submit" 
                className="mt-4" 
                color="blue" 
                size="lg"
                fullWidth
                disabled={emailLoading}
              >
                {emailLoading ? "Adding Email..." : emailInput.trim() ? "Continue" : "Skip for Now"}
              </Button>
              <Button 
                type="button"
                variant="text"
                size="sm"
                onClick={handleBackToLogin}
                className="text-xs"
              >
                Back to Login
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              {error && (
                <Alert color="red" variant="ghost">
                  {error}
                </Alert>
              )}
              <div>
                <Typography variant="small" color="blue-gray" className="mb-2 font-medium">
                  Username
                </Typography>
                <Input
                  size="lg"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="!border-t-blue-gray-200 focus:!border-t-blue-500"
                  labelProps={{
                    className: "before:content-none after:content-none",
                  }}
                />
              </div>
              <div>
                <Typography variant="small" color="blue-gray" className="mb-2 font-medium">
                  Password
                </Typography>
                <div className="relative">
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    size="lg"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="!border-t-blue-gray-200 focus:!border-t-blue-500"
                    labelProps={{
                      className: "before:content-none after:content-none",
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs"
                    onClick={() => setShowPwd((v) => !v)}
                  >
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <Button 
                type="submit" 
                className="mt-4" 
                color="blue" 
                size="lg"
                fullWidth
                disabled={loading}
              >
                {loading ? "Signing In..." : "Sign In"}
              </Button>
              <Button 
                type="button"
                variant="text"
                size="sm"
                onClick={() => setShowForgotPassword(true)}
                className="text-xs text-center"
              >
                Forgot Password?
              </Button>
            </form>
          )}
        </Card>
      </div>
      
      {/* Right side - Image */}
      <div className="hidden lg:block lg:w-1/2 bg-blue-gray-900">
        <div className="h-full w-full bg-cover bg-center" style={{ 
          backgroundImage: "url('/img/memorial-park.jpg')",
          position: "relative" 
        }}>
          <div className="absolute inset-0 bg-blue-gray-900/75">
            <div className="flex h-full items-center justify-center p-8">
              <Typography variant="h4" className="text-white text-center opacity-90 font-semibold tracking-wide px-4">
                "A PLACE OF PEACE, REMEMBRANCE, AND ETERNAL REST. MANAGING SACRED SPACES WITH DIGNITY AND RESPECT."
              </Typography>
            </div>
          </div>
          </div>
      </div>
      </div>
  );
}

export default SignIn;
