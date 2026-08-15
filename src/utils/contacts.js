export const getCustomerDisplayName = (customer) => {
  if (!customer) return '';
  return customer.displayName || customer.name || '';
};

export const getVendorDisplayName = (vendor) => {
  if (!vendor) return '';
  return vendor.displayName || vendor.name || '';
};
