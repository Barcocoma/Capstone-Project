import {
  BanknotesIcon,
  UserPlusIcon,
  UsersIcon,
  ChartBarIcon,
  MapIcon,
  HomeIcon,
} from "@heroicons/react/24/solid";

export const statisticsCardsData = [
  // Values are placeholders; live dashboards compute from map endpoints
  { color: "blue", icon: MapIcon, title: "Total Lots", value: "...", footer: { color: "text-green-500", value: "", label: "" } },
  { color: "green", icon: HomeIcon, title: "Available Lots", value: "...", footer: { color: "text-blue-500", value: "", label: "" } },
  {
    color: "orange",
    icon: UsersIcon,
    title: "Total Customers",
    value: "11,403",
    footer: {
      color: "text-green-500",
      value: "+23",
      label: "new customers",
    },
  },
  {
    color: "purple",
    icon: BanknotesIcon,
    title: "Monthly Revenue",
    value: "₱2,450,000",
    footer: {
      color: "text-green-500",
      value: "+8%",
      label: "than last month",
    },
  },
];

export default statisticsCardsData;
