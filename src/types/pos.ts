export type TableStatus = "empty" | "occupied";
export type OrderType = "dine_in" | "takeaway" | "delivery";
export type OrderStatus = "hazirlaniyor" | "hazir" | "yolda" | "teslim_edildi" | "iptal";
export type PaymentMethod = "cash" | "card" | "tokenflex" | "pluxee" | "edered" | "multinet" | "setcard" | "metropolcard";
export type CourierStatus = "queued" | "dispatched" | "delivered";
export type OrderItemStatus = "pending" | "preparing" | "ready";

export type RestaurantTable = {
  id: string;
  restaurant_id: string;
  name: string;
  status: TableStatus;
  created_at: string;
};

export type StaffMember = {
  id: string;
  restaurant_id: string;
  user_id: string;
  role: "waiter" | "cashier" | "manager";
  name: string;
};

export type MenuCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
};

export type MenuItem = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  price: number;
  description: string | null;
  is_available: boolean;
  sort_order: number;
};

export type CartLine = {
  key: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  note: string;
};

export type KitchenTicket = {
  id: string;
  order_id: string;
  restaurant_id: string;
  menu_item_id: string;
  quantity: number;
  note: string | null;
  unit_price: number;
  status: OrderItemStatus;
  item_name: string;
  table_name: string | null;
  order_number: number | null;
  order_created_at: string;
  order_type: OrderType;
};

export type OrderRow = {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  order_number: number | null;
  order_type: OrderType;
  status: OrderStatus;
  total_amount: number;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  courier_status: CourierStatus | null;
  created_at: string;
};

export type BillLine = {
  id: string;
  order_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  note: string | null;
  status: OrderItemStatus;
};

export type StockItem = {
  id: string;
  restaurant_id: string;
  name: string;
  unit: string;
  quantity: number;
  critical_threshold: number;
  created_at: string;
};

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  empty: "Boş",
  occupied: "Dolu",
};

export const ORDER_ITEM_STATUS_LABEL: Record<OrderItemStatus, string> = {
  pending: "Bekliyor",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Nakit",
  card: "Kredi Kartı",
  tokenflex: "TokenFlex",
  pluxee: "Pluxee",
  edered: "Edenred",
  multinet: "Multinet",
  setcard: "Setcard",
  metropolcard: "Metropolcard",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  hazirlaniyor: "Hazırlanıyor",
  hazir: "Hazır",
  yolda: "Yolda",
  teslim_edildi: "Teslim Edildi",
  iptal: "İptal",
};
