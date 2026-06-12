import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  Button,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Input,
  Select,
  Option,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Chip,
} from "@material-tailwind/react";
import { UserPlusIcon } from "@heroicons/react/24/solid";

// Sample users data
const sampleUsers = [
  {
    id: 1,
    username: "admin",
    full_name: "System Administrator",
    email: "admin@divinelife.com",
    user_type: "admin",
    status: "Active",
    created_at: "2023-01-01"
  },
  {
    id: 2,
    username: "staff",
    full_name: "Cemetery Staff",
    email: "staff@divinelife.com",
    user_type: "cemetery_staff",
    status: "Active",
    created_at: "2023-01-02"
  },
  {
    id: 3,
    username: "cashier",
    full_name: "Cashier",
    email: "cashier@divinelife.com",
    user_type: "cashier",
    status: "Active",
    created_at: "2023-01-03"
  },
  {
    id: 4,
    username: "customer",
    full_name: "John Doe",
    email: "customer@example.com",
    user_type: "customer",
    status: "Active",
    created_at: "2023-01-04"
  }
];

export function Users() {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState(sampleUsers);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    user_type: "customer",
    full_name: "",
    email: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const handleOpen = () => setOpen(!open);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      // Simulate user creation with sample data
      const newUser = {
        id: users.length + 1,
        username: formData.username,
        full_name: formData.full_name,
        email: formData.email,
        user_type: formData.user_type,
        status: "Active",
        created_at: new Date().toISOString().split('T')[0]
      };

      // Add to local state
      setUsers([...users, newUser]);
      
      setSuccess("User created successfully!");
      setFormData({
        username: "",
        password: "",
        user_type: "customer",
        full_name: "",
        email: "",
      });
      handleOpen();
    } catch (err) {
      setError("An error occurred. Please try again.");
    }
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'green';
      case 'inactive':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getUserTypeColor = (userType) => {
    switch (userType) {
      case 'admin':
        return 'red';
      case 'cemetery_staff':
        return 'blue';
      case 'cashier':
        return 'orange';
      case 'customer':
        return 'green';
      default:
        return 'gray';
    }
  };

  return (
    <div className="mt-12 mb-8 flex flex-col gap-12">
      <Card>
        <CardHeader variant="gradient" color="blue" className="mb-8 p-6">
          <div className="flex items-center justify-between">
            <Typography variant="h6" color="white">
              User Management
            </Typography>
            <Button
              className="flex items-center gap-3"
              color="white"
              size="sm"
              onClick={handleOpen}
            >
              <UserPlusIcon strokeWidth={2} className="h-4 w-4" /> Add New User
            </Button>
          </div>
        </CardHeader>
        <CardBody className="overflow-x-scroll px-0 pt-0 pb-2">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Username</TableHeaderCell>
                <TableHeaderCell>Full Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>User Type</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Created</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.full_name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip
                      variant="ghost"
                      size="sm"
                      value={user.user_type.replace('_', ' ')}
                      color={getUserTypeColor(user.user_type)}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      variant="ghost"
                      size="sm"
                      value={user.status}
                      color={getStatusColor(user.status)}
                    />
                  </TableCell>
                  <TableCell>{user.created_at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Dialog open={open} handler={handleOpen} size="sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>Add New User</DialogHeader>
          <DialogBody divider className="flex flex-col gap-4">
            {error && (
              <Typography color="red" className="text-center">
                {error}
              </Typography>
            )}
            {success && (
              <Typography color="green" className="text-center">
                {success}
              </Typography>
            )}
            <Input
              label="Full Name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
            />
            <Input
              label="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
            <Input
              type="password"
              label="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
            <Input
              type="email"
              label="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            {currentUser.user_type === "admin" && (
              <Select
                label="User Type"
                value={formData.user_type}
                onChange={(value) => setFormData({ ...formData, user_type: value })}
              >
                <Option value="admin">Admin</Option>
                <Option value="cemetery_staff">Cemetery Staff</Option>
                <Option value="cashier">Cashier</Option>
                <Option value="customer">Customer</Option>
              </Select>
            )}
          </DialogBody>
          <DialogFooter className="flex gap-3">
            <Button
              variant="text"
              color="red"
              onClick={handleOpen}
            >
              Cancel
            </Button>
            <Button variant="gradient" color="blue" type="submit">
              Create User
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}

export default Users; 