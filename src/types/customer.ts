export type Customer = {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string;
  created_at: string;
};

export type CustomerAddress = {
  id: string;
  restaurant_id: string;
  customer_id: string;
  title: string;
  address: string;
  created_at: string;
};

export type CallerIdActiveCall = {
  phone: string;
  customer: Customer | null;
  addresses: CustomerAddress[];
  isNew: boolean;
  receivedAt: Date;
};

export type CallerIdLogEntry = {
  id: string;
  timestamp: string;
  text: string;
  type: "info" | "call" | "warn" | "error";
};
