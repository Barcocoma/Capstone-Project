import {
  BellIcon,
  PlusCircleIcon,
  ShoppingCartIcon,
  CreditCardIcon,
  LockOpenIcon,
  BanknotesIcon,
  MapIcon,
  UserPlusIcon,
} from "@heroicons/react/24/solid";

export const ordersOverviewData = [
  {
    icon: MapIcon,
    color: "text-green-500",
    title: "Lot A-15 purchased by Maria Santos",
    description: "22 DEC 7:20 PM",
  },
  {
    icon: CreditCardIcon,
    color: "text-blue-500",
    title: "Payment received for Lot B-23",
    description: "21 DEC 11 PM",
  },
  {
    icon: UserPlusIcon,
    color: "text-purple-500",
    title: "New customer registration: Juan Dela Cruz",
    description: "21 DEC 9:34 PM",
  },
  {
    icon: BanknotesIcon,
    color: "text-orange-500",
    title: "Monthly payment for Lot C-45",
    description: "20 DEC 2:20 AM",
  },
  {
    icon: PlusCircleIcon,
    color: "text-green-500",
    title: "Lot D-12 reserved by Ana Reyes",
    description: "18 DEC 4:54 AM",
  },
  {
    icon: BellIcon,
    color: "text-red-500",
    title: "Payment reminder sent for Lot E-78",
    description: "17 DEC",
  },
];

export default ordersOverviewData;
