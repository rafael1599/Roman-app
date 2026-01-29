export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "14.1"
    }
    public: {
        Tables: {
            app_users: {
                Row: {
                    age: number | null
                    created_at: string | null
                    email: string
                    full_name: string
                    id: string
                    role: string | null
                }
                Insert: {
                    age?: number | null
                    created_at?: string | null
                    email: string
                    full_name: string
                    id?: string
                    role?: string | null
                }
                Update: {
                    age?: number | null
                    created_at?: string | null
                    email?: string
                    full_name?: string
                    id?: string
                    role?: string | null
                }
                Relationships: []
            }
            customers: {
                Row: {
                    city: string | null
                    created_at: string | null
                    email: string | null
                    id: string
                    name: string
                    phone: string | null
                    state: string | null
                    street: string | null
                    updated_at: string | null
                    zip_code: string | null
                }
                Insert: {
                    city?: string | null
                    created_at?: string | null
                    email?: string | null
                    id?: string
                    name: string
                    phone?: string | null
                    state?: string | null
                    street?: string | null
                    updated_at?: string | null
                    zip_code?: string | null
                }
                Update: {
                    city?: string | null
                    created_at?: string | null
                    email?: string | null
                    id?: string
                    name?: string
                    phone?: string | null
                    state?: string | null
                    street?: string | null
                    updated_at?: string | null
                    zip_code?: string | null
                }
                Relationships: []
            }
            inventory: {
                Row: {
                    capacity: number | null
                    created_at: string | null
                    id: number
                    location: string | null
                    location_detail: string | null
                    location_id: string | null
                    quantity: number | null
                    sku: string
                    status: string | null
                    warehouse: string | null
                }
                Insert: {
                    capacity?: number | null
                    created_at?: string | null
                    id?: never
                    location?: string | null
                    location_detail?: string | null
                    location_id?: string | null
                    quantity?: number | null
                    sku: string
                    status?: string | null
                    warehouse?: string | null
                }
                Update: {
                    capacity?: number | null
                    created_at?: string | null
                    id?: never
                    location?: string | null
                    location_detail?: string | null
                    location_id?: string | null
                    quantity?: number | null
                    sku?: string
                    status?: string | null
                    warehouse?: string | null
                }
                Relationships: []
            }
            inventory_logs: {
                Row: {
                    action_type: string
                    created_at: string | null
                    from_location: string | null
                    from_warehouse: string | null
                    id: string
                    is_reversed: boolean | null
                    item_id: number | null
                    list_id: string | null
                    new_quantity: number | null
                    order_number: string | null
                    performed_by: string | null
                    prev_quantity: number | null
                    quantity_change: number
                    sku: string
                    to_location: string | null
                    to_warehouse: string | null
                }
                Insert: {
                    action_type: string
                    created_at?: string | null
                    from_location?: string | null
                    from_warehouse?: string | null
                    id?: string
                    is_reversed?: boolean | null
                    item_id?: number | null
                    list_id?: string | null
                    new_quantity?: number | null
                    order_number?: string | null
                    performed_by?: string | null
                    prev_quantity?: number | null
                    quantity_change: number
                    sku: string
                    to_location?: string | null
                    to_warehouse?: string | null
                }
                Update: {
                    action_type?: string
                    created_at?: string | null
                    from_location?: string | null
                    from_warehouse?: string | null
                    id?: string
                    is_reversed?: boolean | null
                    item_id?: number | null
                    list_id?: string | null
                    new_quantity?: number | null
                    order_number?: string | null
                    performed_by?: string | null
                    prev_quantity?: number | null
                    quantity_change?: number
                    sku?: string
                    to_location?: string | null
                    to_warehouse?: string | null
                }
                Relationships: []
            }
            locations: {
                Row: {
                    building: string | null
                    created_at: string | null
                    id: string
                    level: number | null
                    name: string
                    optimization_order: number | null
                    position: number | null
                    section: string | null
                    warehouse: string | null
                    zone_id: string | null
                }
                Insert: {
                    building?: string | null
                    created_at?: string | null
                    id?: string
                    level?: number | null
                    name: string
                    optimization_order?: number | null
                    position?: number | null
                    section?: string | null
                    warehouse?: string | null
                    zone_id?: string | null
                }
                Update: {
                    building?: string | null
                    created_at?: string | null
                    id?: string
                    level?: number | null
                    name?: string
                    optimization_order?: number | null
                    position?: number | null
                    section?: string | null
                    warehouse?: string | null
                    zone_id?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "locations_zone_id_fkey"
                        columns: ["zone_id"]
                        isOneToOne: false
                        referencedRelation: "warehouse_zones"
                        referencedColumns: ["id"]
                    },
                ]
            }
            optimization_reports: {
                Row: {
                    created_at: string | null
                    created_by: string | null
                    details: Json | null
                    id: string
                    list_id: string | null
                    optimization_type: string
                    path_data: Json | null
                    warehouse: string | null
                }
                Insert: {
                    created_at?: string | null
                    created_by?: string | null
                    details?: Json | null
                    id?: string
                    list_id?: string | null
                    optimization_type: string
                    path_data?: Json | null
                    warehouse?: string | null
                }
                Update: {
                    created_at?: string | null
                    created_by?: string | null
                    details?: Json | null
                    id?: string
                    list_id?: string | null
                    optimization_type?: string
                    path_data?: Json | null
                    warehouse?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "optimization_reports_list_id_fkey"
                        columns: ["list_id"]
                        isOneToOne: false
                        referencedRelation: "picking_lists"
                        referencedColumns: ["id"]
                    },
                ]
            }
            picking_lists: {
                Row: {
                    checked_by: string | null
                    correction_notes: string | null
                    created_at: string | null
                    customer_id: string | null
                    id: string
                    items: Json
                    load_number: string | null
                    notes: string | null
                    order_number: string | null
                    pallets_qty: number | null
                    priority: string | null
                    status: string | null
                    total_units: number | null
                    updated_at: string | null
                    user_id: string | null
                }
                Insert: {
                    checked_by?: string | null
                    correction_notes?: string | null
                    created_at?: string | null
                    customer_id?: string | null
                    id?: string
                    items: Json
                    load_number?: string | null
                    notes?: string | null
                    order_number?: string | null
                    pallets_qty?: number | null
                    priority?: string | null
                    status?: string | null
                    total_units?: number | null
                    updated_at?: string | null
                    user_id?: string | null
                }
                Update: {
                    checked_by?: string | null
                    correction_notes?: string | null
                    created_at?: string | null
                    customer_id?: string | null
                    id?: string
                    items?: Json
                    load_number?: string | null
                    notes?: string | null
                    order_number?: string | null
                    pallets_qty?: number | null
                    priority?: string | null
                    status?: string | null
                    total_units?: number | null
                    updated_at?: string | null
                    user_id?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "picking_lists_customer_id_fkey"
                        columns: ["customer_id"]
                        isOneToOne: false
                        referencedRelation: "customers"
                        referencedColumns: ["id"]
                    },
                ]
            }
            profiles: {
                Row: {
                    avatar_url: string | null
                    full_name: string | null
                    id: string
                    updated_at: string | null
                    username: string | null
                    warehouse: string | null
                }
                Insert: {
                    avatar_url?: string | null
                    full_name?: string | null
                    id: string
                    updated_at?: string | null
                    username?: string | null
                    warehouse?: string | null
                }
                Update: {
                    avatar_url?: string | null
                    full_name?: string | null
                    id?: string
                    updated_at?: string | null
                    username?: string | null
                    warehouse?: string | null
                }
                Relationships: []
            }
            sku_metadata: {
                Row: {
                    barcode: string | null
                    brand: string | null
                    category: string | null
                    created_at: string | null
                    description: string | null
                    dimensions: Json | null
                    id: string
                    image_url: string | null
                    sku: string
                    unit_weight: number | null
                    updated_at: string | null
                }
                Insert: {
                    barcode?: string | null
                    brand?: string | null
                    category?: string | null
                    created_at?: string | null
                    description?: string | null
                    dimensions?: Json | null
                    id?: string
                    image_url?: string | null
                    sku: string
                    unit_weight?: number | null
                    updated_at?: string | null
                }
                Update: {
                    barcode?: string | null
                    brand?: string | null
                    category?: string | null
                    created_at?: string | null
                    description?: string | null
                    dimensions?: Json | null
                    id?: string
                    image_url?: string | null
                    sku?: string
                    unit_weight?: number | null
                    updated_at?: string | null
                }
                Relationships: []
            }
            warehouse_zones: {
                Row: {
                    created_at: string | null
                    description: string | null
                    id: string
                    name: string
                    warehouse: string | null
                }
                Insert: {
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    name: string
                    warehouse?: string | null
                }
                Update: {
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    name?: string
                    warehouse?: string | null
                }
                Relationships: []
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type PublicSchema = Database["public"]

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof Database
    }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
