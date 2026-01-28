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
                    user_id: string | null
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
                    user_id?: string | null
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
                    user_id?: string | null
                }
                Relationships: []
            }
            locations: {
                Row: {
                    created_at: string | null
                    description: string | null
                    id: string
                    location: string
                    max_capacity: number | null
                    metadata: Json | null
                    status: string | null
                    type: string | null
                    updated_at: string | null
                    warehouse: string
                    zone_id: string | null
                }
                Insert: {
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    location: string
                    max_capacity?: number | null
                    metadata?: Json | null
                    status?: string | null
                    type?: string | null
                    updated_at?: string | null
                    warehouse: string
                    zone_id?: string | null
                }
                Update: {
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    location?: string
                    max_capacity?: number | null
                    metadata?: Json | null
                    status?: string | null
                    type?: string | null
                    updated_at?: string | null
                    warehouse?: string
                    zone_id?: string | null
                }
                Relationships: []
            }
            picking_list_notes: {
                Row: {
                    content: string
                    created_at: string | null
                    id: string
                    picking_list_id: string
                    user_id: string
                }
                Insert: {
                    content: string
                    created_at?: string | null
                    id?: string
                    picking_list_id: string
                    user_id: string
                }
                Update: {
                    content?: string
                    created_at?: string | null
                    id?: string
                    picking_list_id?: string
                    user_id?: string
                }
                Relationships: []
            }
            picking_lists: {
                Row: {
                    checked_by: string | null
                    correction_notes: string | null
                    created_at: string | null
                    customer_name: string | null
                    id: string
                    items: Json | null
                    order_number: string | null
                    pallets_qty: number | null
                    status: string | null
                    updated_at: string | null
                    user_id: string | null
                }
                Insert: {
                    checked_by?: string | null
                    correction_notes?: string | null
                    created_at?: string | null
                    customer_name?: string | null
                    id?: string
                    items?: Json | null
                    order_number?: string | null
                    pallets_qty?: number | null
                    status?: string | null
                    updated_at?: string | null
                    user_id?: string | null
                }
                Update: {
                    checked_by?: string | null
                    correction_notes?: string | null
                    created_at?: string | null
                    customer_name?: string | null
                    id?: string
                    items?: Json | null
                    order_number?: string | null
                    pallets_qty?: number | null
                    status?: string | null
                    updated_at?: string | null
                    user_id?: string | null
                }
                Relationships: []
            }
            profiles: {
                Row: {
                    age: number | null
                    avatar_url: string | null
                    email: string
                    full_name: string
                    id: string
                    role: string | null
                }
                Insert: {
                    age?: number | null
                    avatar_url?: string | null
                    email: string
                    full_name: string
                    id: string
                    role?: string | null
                }
                Update: {
                    age?: number | null
                    avatar_url?: string | null
                    email?: string
                    full_name?: string
                    id?: string
                    role?: string | null
                }
                Relationships: []
            }
            sku_metadata: {
                Row: {
                    created_at: string | null
                    id: string
                    image_url: string | null
                    name: string | null
                    sku: string
                    updated_at: string | null
                    length_ft: number | null
                    width_in: number | null
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    image_url?: string | null
                    name?: string | null
                    sku: string
                    updated_at?: string | null
                    length_ft?: number | null
                    width_in?: number | null
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    image_url?: string | null
                    name?: string | null
                    sku?: string
                    updated_at?: string | null
                    length_ft?: number | null
                    width_in?: number | null
                }
                Relationships: []
            }
            warehouse_zones: {
                Row: {
                    color: string | null
                    created_at: string | null
                    description: string | null
                    id: string
                    name: string | null
                    updated_at: string | null
                    warehouse: string
                    location: string
                    zone: string
                    picking_order: number | null
                    is_shipping_area: boolean | null
                    notes: string | null
                }
                Insert: {
                    color?: string | null
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    name?: string | null
                    updated_at?: string | null
                    warehouse: string
                    location: string
                    zone: string
                    picking_order?: number | null
                    is_shipping_area?: boolean | null
                    notes?: string | null
                }
                Update: {
                    color?: string | null
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    name?: string | null
                    updated_at?: string | null
                    warehouse?: string
                    location?: string
                    zone?: string
                    picking_order?: number | null
                    is_shipping_area?: boolean | null
                    notes?: string | null
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

type PublicSchema = Database['public']

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    ? (PublicSchema['Tables'] & PublicSchema['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R
    }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends keyof PublicSchema['Enums'] | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
    ? PublicSchema['Enums'][PublicEnumNameOrOptions]
    : never
