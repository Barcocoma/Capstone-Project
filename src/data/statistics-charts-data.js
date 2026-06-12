import { chartsConfig } from "@/configs";

const lotSalesChart = {
  type: "bar",
  height: 220,
  series: [
    {
      name: "Lot Sales",
      data: [12, 8, 15, 22, 18, 25, 20],
    },
  ],
  options: {
    ...chartsConfig,
    colors: "#388e3c",
    plotOptions: {
      bar: {
        columnWidth: "16%",
        borderRadius: 5,
      },
    },
    xaxis: {
      ...chartsConfig.xaxis,
      categories: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    },
  },
};

const monthlyRevenueChart = {
  type: "line",
  height: 220,
  series: [
    {
      name: "Revenue (₱)",
      data: [2500000, 2800000, 3200000, 2900000, 3500000, 3800000, 4200000, 3900000, 4500000],
    },
  ],
  options: {
    ...chartsConfig,
    colors: ["#0288d1"],
    stroke: {
      lineCap: "round",
    },
    markers: {
      size: 5,
    },
    xaxis: {
      ...chartsConfig.xaxis,
      categories: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
      ],
    },
  },
};

const customerRegistrationsChart = {
  type: "line",
  height: 220,
  series: [
    {
      name: "New Customers",
      data: [45, 52, 38, 67, 58, 72, 65, 78, 85],
    },
  ],
  options: {
    ...chartsConfig,
    colors: ["#388e3c"],
    stroke: {
      lineCap: "round",
    },
    markers: {
      size: 5,
    },
    xaxis: {
      ...chartsConfig.xaxis,
      categories: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
      ],
    },
  },
};

const lotStatusChart = {
  type: "pie",
  height: 220,
  series: [11403, 2847, 0, 0], // Sold, Available, Reserved, Occupied
  options: {
    ...chartsConfig,
    colors: ["#388e3c", "#0288d1", "#ff9800", "#f44336"],
    labels: ["Sold", "Available", "Reserved", "Occupied"],
    plotOptions: {
      pie: {
        donut: {
          size: "60%",
        },
      },
    },
  },
};

export const statisticsChartsData = [
  {
    color: "white",
    title: "Weekly Lot Sales",
    description: "Number of lots sold this week",
    footer: "updated 2 hours ago",
    chart: lotSalesChart,
  },
  {
    color: "white",
    title: "Monthly Revenue",
    description: "Revenue growth over 9 months",
    footer: "updated 4 min ago",
    chart: monthlyRevenueChart,
  },
  {
    color: "white",
    title: "Customer Registrations",
    description: "New customer registrations trend",
    footer: "just updated",
    chart: customerRegistrationsChart,
  },
  {
    color: "white",
    title: "Lot Status Distribution",
    description: "Current status of all lots",
    footer: "real-time data",
    chart: lotStatusChart,
  },
];

export default statisticsChartsData;
