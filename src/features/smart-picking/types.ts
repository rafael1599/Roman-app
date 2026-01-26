export interface ScannedItem {
    id?: string;
    sku: string;
    qty: number;
}

export type StockStatus = 'available' | 'shortage' | 'not_found' | 'needs_warehouse_selection' | 'picking' | 'verified';

export interface WarehouseInfo {
    available: number;
    hasStock: boolean;
    location: string;
    locationDetail?: string;
}

export interface ValidatedItem extends ScannedItem {
    id: string; // Required after processing
    status: StockStatus;
    available: number;
    location: string | null;
    locationDetail?: string;
    warehouse: 'ludlow' | 'ats' | null;
    position: number;
    matchType?: 'exact' | 'normalized';
    suggestions?: string[];
    inBothWarehouses?: boolean;
    ludlow?: WarehouseInfo;
    ats?: WarehouseInfo;
}

export interface PalletItem extends ValidatedItem {
    originalQty: number;
    isSplit: boolean;
}

export type Pallet = PalletItem[];

export interface Transaction {
    sku: string;
    warehouse: 'ludlow' | 'ats' | null;
    previousQty: number;
    newQty: number;
    deducted: number;
}

export interface VerificationItem {
    sku: string;
    qty: number;
}

export interface PalletVerificationResult {
    matched: Array<{ sku: string; expected: number; detected: number; match: boolean }>;
    missing: Array<{ sku: string; qty: number }>;
    extra: Array<{ sku: string; qty: number }>;
    manualOverride?: boolean;
}

export interface Order {
    id: string;
    timestamp: string;
    scannedItems: ScannedItem[];
    validatedItems: ValidatedItem[];
    pallets: Pallet[];
    shortageItems: ValidatedItem[];
    transactions: Transaction[];
    status: 'draft' | 'in_progress' | 'completed' | 'rolled_back';
    currentPalletIndex: number;
}
