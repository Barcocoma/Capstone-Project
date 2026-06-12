import React, { useState, useEffect } from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Button,
  Chip,
} from "@material-tailwind/react";
import { API_ENDPOINTS } from "@/configs/api";

export function MyPlots() {
  const [myLots, setMyLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(4); // This should come from user context/login

  // Fetch customer's lots from backend
  const fetchMyLots = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_ENDPOINTS.GET_MY_LOTS}?user_id=${userId}`);
      const data = await response.json();
      if (data.success) {
        setMyLots(data.lots);
      } else {
        console.error('Failed to fetch my lots:', data.message);
      }
    } catch (error) {
      console.error('Error fetching my lots:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyLots();
  }, [userId]);

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'sold':
        return 'green';
      case 'occupied':
        return 'blue';
      case 'reserved':
        return 'yellow';
      case 'available':
        return 'gray';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <div className="mt-12">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          Loading your plots...
        </Typography>
      </div>
    );
  }

  return (
    <div className="mt-12">
      {/* Header */}
      <div className="mb-8">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          My Plots
        </Typography>
        <Typography variant="small" color="blue-gray" className="opacity-70">
          View your owned lots and their details
        </Typography>
      </div>

      {/* My Plots Table */}
      <Card className="overflow-hidden">
        <CardHeader
          floated={false}
          shadow={false}
          color="transparent"
          className="m-0 p-6"
        >
          <Typography variant="h5" color="blue-gray" className="mb-1">
            My Lot Ownership
          </Typography>
        </CardHeader>
        <CardBody className="px-0 pt-0 pb-2">
          {myLots.length === 0 ? (
            <div className="text-center py-8">
              <Typography variant="h6" color="blue-gray" className="mb-2">
                No plots found
              </Typography>
              <Typography variant="small" color="blue-gray" className="opacity-70">
                You don't own any plots yet. Contact staff to purchase a lot.
              </Typography>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] table-auto">
                <thead>
                  <tr>
                    {["Lot Number", "Garden", "Section", "Block", "Status", "Purchase Date", "Contact", "Actions"].map((el) => (
                      <th
                        key={el}
                        className="border-b border-blue-gray-50 py-3 px-6 text-left"
                      >
                        <Typography
                          variant="small"
                          className="text-[11px] font-medium uppercase text-blue-gray-400"
                        >
                          {el}
                        </Typography>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myLots.map(
                    ({ id, lot_number, garden_name, sector_name, block_number, status, purchase_date, contact }, key) => {
                      const className = `py-3 px-6 ${
                        key === myLots.length - 1
                          ? ""
                          : "border-b border-blue-gray-50"
                      }`;
                      return (
                        <tr key={id}>
                          <td className={className}>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-semibold"
                            >
                              {lot_number}
                            </Typography>
                          </td>
                          <td className={className}>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-normal"
                            >
                              {garden_name}
                            </Typography>
                          </td>
                          <td className={className}>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-normal"
                            >
                              {sector_name}
                            </Typography>
                          </td>
                          <td className={className}>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-normal"
                            >
                              {block_number}
                            </Typography>
                          </td>
                          <td className={className}>
                            <Chip
                              variant="ghost"
                              color={getStatusColor(status)}
                              value={status}
                              className="text-center font-medium w-fit"
                            />
                          </td>
                          <td className={className}>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-normal"
                            >
                              {purchase_date}
                            </Typography>
                          </td>
                          <td className={className}>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-normal"
                            >
                              {contact || 'N/A'}
                            </Typography>
                          </td>
                          <td className={className}>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                color="blue"
                                variant="outlined"
                              >
                                View Details
                              </Button>
                              <Button
                                size="sm"
                                color="green"
                                variant="outlined"
                              >
                                Make Payment
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Summary Cards */}
      {myLots.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <Card>
            <CardBody className="text-center">
              <Typography variant="h4" color="blue-gray" className="font-bold">
                {myLots.length}
              </Typography>
              <Typography variant="small" color="blue-gray" className="opacity-70">
                Total Plots
              </Typography>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <Typography variant="h4" color="green" className="font-bold">
                {myLots.filter(lot => lot.status === 'sold').length}
              </Typography>
              <Typography variant="small" color="blue-gray" className="opacity-70">
                Paid Plots
              </Typography>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <Typography variant="h4" color="blue" className="font-bold">
                {myLots.filter(lot => lot.status === 'occupied').length}
              </Typography>
              <Typography variant="small" color="blue-gray" className="opacity-70">
                Occupied Plots
              </Typography>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

export default MyPlots; 