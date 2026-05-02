export type NavBarItemType = {
  label: string;
  link?: string;
  hasDropdown?: boolean;
  children?: NavBarItemType[];
};
