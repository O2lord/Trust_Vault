import { NavBarItemType } from "@/types/NavBarItem.type";

export const NavBar_Item: NavBarItemType[] = [
    {
        label: "Explorer",
        hasDropdown: true,
        children: [
          {
            label: "Trust Express",
            link: "/express"
          },
          {
            label: "Requests",
            link: "/requests"
          },
          {
            label: "History",
            link: "/history"
          }
        ],
    },
    {
    label: "Lp Provider",
    hasDropdown: true,
    children: [
       {
        label: "Trust Express",
        link: "/express/providers",
      }
    ]
  },
  {
    label: "Merchant",
    hasDropdown: true,
    children: [
      {
        label: "Merchant Dashboard",
        link: "/express/merchant",
      }
    ]
  },
  {
    label: "Validators",
    hasDropdown: true,
    children: [
      {
        label: "Validator Dashboard",
        link: "/express/validators",
      }
    ]
  },
];