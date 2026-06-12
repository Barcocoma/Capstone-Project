import { Typography, Button } from "@material-tailwind/react";
import { useNavigate } from "react-router-dom";

export function Unauthorized() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="text-center p-8 bg-white rounded-lg shadow-lg">
        <Typography variant="h1" className="text-4xl font-bold text-red-500 mb-4">
          Unauthorized Access
        </Typography>
        <Typography variant="paragraph" className="mb-6 text-gray-700">
          Sorry, you don't have permission to access this page. Please contact the administrator if you believe this is an error.
        </Typography>
        <div className="space-y-4">
          <Button
            color="gray"
            onClick={() => {
              switch (user.user_type) {
                case "admin":
                  navigate("/dashboard");
                  break;
                case "cemetery_staff":
                  navigate("/dashboard/plots");
                  break;
                case "cashier":
                  navigate("/dashboard/payments");
                  break;
                case "customer":
                  navigate("/dashboard/my-plots");
                  break;
                default:
                  navigate("/dashboard");
              }
            }}
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Unauthorized; 