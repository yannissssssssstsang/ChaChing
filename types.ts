
export enum Language {
  EN = 'en',
  ZH = 'zh'
}

export enum PaymentMethod {
  CASH = 'CASH',
  PAYME = 'PAYME',
  ALIPAY = 'ALIPAY',
  FPS = 'FPS'
}

export type SyncStatus = 'synced' | 'syncing' | 'error' | 'pending' | 'offline';

export interface Product {
  id: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  threshold?: number;
  image?: string;
  category: string;
  isExtracting?: boolean;
}

export interface ProductChangeLog {
  id: string;
  productId: string;
  productName: string;
  field: 'price' | 'stock' | 'status' | 'batch_stock';
  oldValue: string | number;
  newValue: string | number;
  timestamp: string;
}

export interface CartItem extends Product {
  quantity: number;
  discountedPrice?: number;
}

export interface Refund {
  id: string;
  timestamp: string;
  itemId: string;
  itemName: string;
  quantity: number;
  amount: number;
  profitImpact: number;
  reason: string;
  method: string;
}

export interface Transaction {
  id: string;
  timestamp: string;
  items: CartItem[];
  total: number;
  originalTotal: number;
  discountAmount: number;
  discountType?: 'percentage' | 'rounding';
  discountValue?: number;
  discountIteration?: number;
  paymentMethod: string;
  profit: number;
  customerEmail?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  };
  refunds?: Refund[];
}

export interface ReceiptConfig {
  logo?: string;
  businessCard?: string;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  instagram?: string;
  facebook?: string;
}

export interface SettlementConfig {
  enabled: boolean;
  time: string; // HH:mm format
  lastSettledDate?: string; // YYYY-MM-DD
}

export interface DailyReport {
  date: string;
  transactions: Transaction[];
  totalRevenue: number;
  totalProfit: number;
}

export interface AIExtractionResult {
  name: string;
  price: number;
  cost: number;
  category: string;
}

export interface PaymentQRCodes {
  [key: string]: string | undefined;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  alertType: 'none' | 'transaction' | 'stock' | 'both';
}
