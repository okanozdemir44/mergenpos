export type CustomerPhone = {
  id: string;
  restaurant_id: string;
  customer_id: string;
  phone: string;
  label: string;
  created_at: string;
};

export type Customer = {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string;
  note?: string | null;
  created_at: string;
  phones?: CustomerPhone[];
};

export type CustomerAddress = {
  id: string;
  restaurant_id: string;
  customer_id: string;
  title: string;
  address: string;
  note?: string | null;
  created_at: string;
  last_used_at?: string | null;
  order_count?: number;
};

export type CallerIdLastOrder = {
  id: string;
  created_at: string;
  total_amount: number;
  customer_address_id?: string | null;
  itemsSummary: string; // örn. "2x Dürüm, 1x Ayran"
  items: Array<{
    menu_item_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    note?: string | null;
  }>;
};

export type CallerIdActiveCall = {
  phone: string;
  customer: Customer | null;
  addresses: CustomerAddress[];
  isNew: boolean;
  receivedAt: Date;
  totalOrdersCount?: number;
  lastOrder?: CallerIdLastOrder | null;
  lastAddressId?: string | null;
  lastOrderDateFormatted?: string | null;
};

export type CallerIdLogEntry = {
  id: string;
  timestamp: string;
  text: string;
  type: "info" | "call" | "warn" | "error";
};

export type CustomerOrderStats = {
  customer_id: string;
  total_orders: number;
  total_spent: number;
  last_order_at: string | null;
  first_order_at: string | null;
};

export type CustomerWithDetails = Customer & {
  addresses: CustomerAddress[];
  phones: CustomerPhone[];
  stats?: CustomerOrderStats;
};
