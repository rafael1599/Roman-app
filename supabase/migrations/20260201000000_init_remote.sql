


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."current_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true), '')::json->>'sub',
    NULL
  )::uuid;
$$;


ALTER FUNCTION "public"."current_user_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_user_id"() IS 'Cached user ID - evaluates once per query, not per row';



CREATE OR REPLACE FUNCTION "public"."get_stock_at_timestamp"("target_timestamp" timestamp with time zone) RETURNS TABLE("warehouse" "text", "location" "text", "sku" "text", "quantity" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        to_warehouse as warehouse,
        to_location as location,
        l.sku,
        SUM(l.quantity_change)::BIGINT as quantity
    FROM 
        inventory_logs l
    WHERE 
        l.created_at <= target_timestamp
    GROUP BY 
        l.sku, to_warehouse, to_location
    -- Quitamos el filtro de quantity != 0 para ver items agotados
    ORDER BY 
        warehouse, location, l.sku;
END;
$$;


ALTER FUNCTION "public"."get_stock_at_timestamp"("target_timestamp" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Staff Member'), 
    'staff' -- Default role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = public.current_user_id() 
    AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"() IS 'Cached admin check - evaluates once per query';



CREATE OR REPLACE FUNCTION "public"."is_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = public.current_user_id() 
    AND role IN ('admin', 'manager')
  );
$$;


ALTER FUNCTION "public"."is_manager"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_manager"() IS 'Cached manager/admin check - evaluates once per query';



CREATE OR REPLACE FUNCTION "public"."sync_inventory_location_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- If location name changed
    IF OLD.location <> NEW.location THEN
        UPDATE inventory
        SET location = NEW.location
        WHERE location_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_inventory_location_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_inventory_action"("target_log_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_log inventory_logs%ROWTYPE;
  v_item_id BIGINT;
  v_move_qty INT;
BEGIN
  -- 1. Lock and get log
  SELECT * INTO v_log FROM inventory_logs WHERE id = target_log_id FOR UPDATE;

  -- 2. Basic validations
  IF v_log IS NULL THEN 
    RETURN jsonb_build_object('success', false, 'message', 'Log no encontrado'); 
  END IF;
  
  IF v_log.is_reversed THEN 
    RETURN jsonb_build_object('success', false, 'message', 'Acción ya revertida'); 
  END IF;

  -- Resolve the correct Item ID to target (Fallback to snapshot)
  -- Try to get it from various sources
  v_item_id := COALESCE(
      v_log.item_id, 
      (v_log.snapshot_before->>'id')::bigint,
      (v_log.snapshot_before->>'ID')::bigint, -- Case sensitivity check
      (v_log.snapshot_before->>'itemId')::bigint
  );

  IF v_item_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'No se pudo identificar el ID del item para revertir [LogID: ' || target_log_id || ']');
  END IF;

  -- 3. Logic based on action_type
  IF v_log.action_type = 'MOVE' THEN
      v_move_qty := ABS(v_log.quantity_change);

      -- A. RESTORE SOURCE (Origin)
      IF v_log.snapshot_before IS NOT NULL THEN
          -- Try Update
          UPDATE inventory SET 
              sku = COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
              quantity = (v_log.snapshot_before->>'quantity')::int,
              location = (v_log.snapshot_before->>'location'),
              location_id = NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
              warehouse = (v_log.snapshot_before->>'warehouse')
          WHERE id = v_item_id;

          -- If not found, Insert with explicit ID
          IF NOT FOUND THEN
              INSERT INTO inventory (id, sku, quantity, location, location_id, warehouse)
              VALUES (
                  v_item_id,
                  COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
                  (v_log.snapshot_before->>'quantity')::int,
                  v_log.snapshot_before->>'location',
                  NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
                  v_log.snapshot_before->>'warehouse'
              );
          END IF;
      END IF;

      -- B. DEDUCT FROM DESTINATION (Target)
      UPDATE inventory 
      SET quantity = GREATEST(0, quantity - v_move_qty)
      WHERE sku = v_log.sku 
        AND warehouse = v_log.to_warehouse 
        AND location = v_log.to_location;

  ELSIF v_log.action_type IN ('ADD', 'DEDUCT', 'EDIT', 'DELETE') THEN
      IF v_log.snapshot_before IS NOT NULL THEN
          -- Full Resurrection/Restore
          UPDATE inventory SET 
              sku = COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
              quantity = (v_log.snapshot_before->>'quantity')::int,
              location = (v_log.snapshot_before->>'location'),
              location_id = NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
              warehouse = (v_log.snapshot_before->>'warehouse')
          WHERE id = v_item_id;
          
          IF NOT FOUND THEN
              INSERT INTO inventory (id, sku, quantity, location, location_id, warehouse)
              VALUES (
                  v_item_id,
                  COALESCE(v_log.snapshot_before->>'sku', v_log.sku),
                  (v_log.snapshot_before->>'quantity')::int,
                  v_log.snapshot_before->>'location',
                  NULLIF(v_log.snapshot_before->>'location_id', '')::uuid,
                  v_log.snapshot_before->>'warehouse'
              );
          END IF;
      ELSE
          -- Delta-based fallback
          UPDATE inventory 
          SET quantity = quantity - v_log.quantity_change
          WHERE id = v_item_id;

          IF NOT FOUND AND v_log.quantity_change < 0 THEN
              INSERT INTO inventory (id, sku, location, warehouse, quantity)
              VALUES (v_item_id, v_log.sku, v_log.from_location, v_log.from_warehouse, ABS(v_log.quantity_change));
          END IF;
      END IF;
  END IF;

  -- 4. Mark as reversed
  UPDATE inventory_logs SET is_reversed = TRUE WHERE id = target_log_id;
  
  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM || ' [Item ID: ' || COALESCE(v_item_id::text, 'NULL') || ']');
END;
$$;


ALTER FUNCTION "public"."undo_inventory_action"("target_log_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_warehouse_zones_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_warehouse_zones_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "full_name" "text" NOT NULL,
    "age" integer,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'staff'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "street" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "email" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" bigint NOT NULL,
    "sku" "text" NOT NULL,
    "location" "text",
    "quantity" integer DEFAULT 0,
    "sku_note" "text",
    "warehouse" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "capacity" integer DEFAULT 550,
    "location_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL
);

ALTER TABLE ONLY "public"."inventory" REPLICA IDENTITY FULL;


ALTER TABLE "public"."inventory" OWNER TO "postgres";


ALTER TABLE "public"."inventory" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."inventory_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."inventory_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sku" "text" NOT NULL,
    "from_warehouse" "text",
    "from_location" "text",
    "to_warehouse" "text",
    "to_location" "text",
    "quantity_change" integer NOT NULL,
    "action_type" "text" NOT NULL,
    "performed_by" "text" DEFAULT 'Warehouse Team'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "prev_quantity" integer,
    "new_quantity" integer,
    "is_reversed" boolean DEFAULT false,
    "item_id" bigint,
    "previous_sku" "text",
    "list_id" "uuid",
    "order_number" "text",
    "location_id" "uuid",
    "previous_quantity" integer,
    "snapshot_before" "jsonb",
    "to_location_id" "uuid",
    "user_id" "uuid"
);


ALTER TABLE "public"."inventory_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."inventory_logs"."quantity_change" IS 'La cantidad exacta que se sumó o restó';



CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "warehouse" character varying(50) NOT NULL,
    "location" character varying(100) NOT NULL,
    "max_capacity" integer DEFAULT 550,
    "picking_order" integer,
    "zone" character varying(20),
    "is_shipping_area" boolean DEFAULT false,
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "length_ft" numeric(10,2),
    "bike_line" integer,
    "total_bikes" integer,
    CONSTRAINT "locations_zone_check" CHECK ((("zone")::"text" = ANY ((ARRAY['HOT'::character varying, 'WARM'::character varying, 'COLD'::character varying, 'UNASSIGNED'::character varying])::"text"[])))
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."locations" IS 'Configuración detallada de cada ubicación en los almacenes';



COMMENT ON COLUMN "public"."locations"."warehouse" IS 'Nombre del almacén (LUDLOW, ATS, etc.)';



COMMENT ON COLUMN "public"."locations"."location" IS 'Código de ubicación (Row 1, A6, etc.)';



COMMENT ON COLUMN "public"."locations"."max_capacity" IS 'Capacidad máxima en unidades (default: 550)';



COMMENT ON COLUMN "public"."locations"."picking_order" IS 'Orden de picking sugerido (menor = primero)';



COMMENT ON COLUMN "public"."locations"."zone" IS 'Zona de temperatura/velocidad (HOT/WARM/COLD)';



COMMENT ON COLUMN "public"."locations"."is_shipping_area" IS 'Indica si es área de envío/staging';



COMMENT ON COLUMN "public"."locations"."notes" IS 'Notas adicionales sobre la ubicación';



COMMENT ON COLUMN "public"."locations"."is_active" IS 'Indica si la ubicación está activa';



COMMENT ON COLUMN "public"."locations"."length_ft" IS 'Length of the row in feet.';



COMMENT ON COLUMN "public"."locations"."bike_line" IS 'Number of bikes in the line.';



COMMENT ON COLUMN "public"."locations"."total_bikes" IS 'Total bike capacity for the location.';



CREATE TABLE IF NOT EXISTS "public"."optimization_reports" (
    "id" integer NOT NULL,
    "report_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "report_type" character varying(50) DEFAULT 'weekly_rebalance'::character varying,
    "suggestions" "jsonb" NOT NULL,
    "applied_count" integer DEFAULT 0,
    "total_suggestions" integer NOT NULL,
    "generated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."optimization_reports" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."optimization_reports_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."optimization_reports_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."optimization_reports_id_seq" OWNED BY "public"."optimization_reports"."id";



CREATE TABLE IF NOT EXISTS "public"."picking_list_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "list_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."picking_list_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."picking_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "order_number" "text",
    "checked_by" "uuid",
    "correction_notes" "text",
    "pallets_qty" integer DEFAULT 0,
    "priority" "text" DEFAULT 'normal'::"text",
    "notes" "text",
    "load_number" "text",
    "total_units" integer DEFAULT 0,
    "customer_id" "uuid",
    CONSTRAINT "picking_lists_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'ready_to_double_check'::"text", 'double_checking'::"text", 'needs_correction'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."picking_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."picking_sessions" (
    "user_id" "uuid" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."picking_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'staff'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "email" "text",
    "last_seen_at" timestamp with time zone,
    "created_by" "uuid",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sku_metadata" (
    "sku" "text" NOT NULL,
    "length_ft" numeric DEFAULT 5,
    "width_in" numeric DEFAULT 6,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."sku_metadata" OWNER TO "postgres";


ALTER TABLE ONLY "public"."optimization_reports" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."optimization_reports_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_warehouse_location_key" UNIQUE ("warehouse", "location");



ALTER TABLE ONLY "public"."optimization_reports"
    ADD CONSTRAINT "optimization_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."optimization_reports"
    ADD CONSTRAINT "optimization_reports_report_date_report_type_key" UNIQUE ("report_date", "report_type");



ALTER TABLE ONLY "public"."picking_list_notes"
    ADD CONSTRAINT "picking_list_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."picking_lists"
    ADD CONSTRAINT "picking_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."picking_sessions"
    ADD CONSTRAINT "picking_sessions_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sku_metadata"
    ADD CONSTRAINT "sku_metadata_pkey" PRIMARY KEY ("sku");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "unique_warehouse_sku_location" UNIQUE ("warehouse", "sku", "location");



CREATE INDEX "idx_inventory_location_id" ON "public"."inventory" USING "btree" ("location_id");



CREATE INDEX "idx_inventory_logs_action_created" ON "public"."inventory_logs" USING "btree" ("action_type", "created_at" DESC) WHERE ("action_type" IS NOT NULL);



COMMENT ON INDEX "public"."idx_inventory_logs_action_created" IS 'Speeds up history filtering by action type';



CREATE INDEX "idx_inventory_logs_date_only" ON "public"."inventory_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inventory_logs_item_id" ON "public"."inventory_logs" USING "btree" ("item_id");



CREATE INDEX "idx_inventory_logs_list_id" ON "public"."inventory_logs" USING "btree" ("list_id") WHERE ("list_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_inventory_logs_list_id" IS 'Fixes unindexed FK - prevents full table scan on picking_lists joins';



CREATE INDEX "idx_inventory_logs_order_number" ON "public"."inventory_logs" USING "btree" ("order_number");



CREATE INDEX "idx_inventory_logs_sku" ON "public"."inventory_logs" USING "btree" ("sku");



CREATE INDEX "idx_inventory_logs_user_id" ON "public"."inventory_logs" USING "btree" ("user_id");



CREATE INDEX "idx_inventory_sku_only" ON "public"."inventory" USING "btree" ("sku");



CREATE INDEX "idx_locations_active" ON "public"."locations" USING "btree" ("is_active");



CREATE INDEX "idx_locations_warehouse" ON "public"."locations" USING "btree" ("warehouse");



CREATE INDEX "idx_locations_warehouse_location" ON "public"."locations" USING "btree" ("warehouse", "location");



CREATE INDEX "idx_locations_zone" ON "public"."locations" USING "btree" ("zone");



CREATE INDEX "idx_picking_list_notes_list_id" ON "public"."picking_list_notes" USING "btree" ("list_id");



CREATE INDEX "idx_picking_list_notes_user_id" ON "public"."picking_list_notes" USING "btree" ("user_id");



CREATE INDEX "idx_picking_lists_checked_by" ON "public"."picking_lists" USING "btree" ("checked_by");



CREATE INDEX "idx_picking_lists_status" ON "public"."picking_lists" USING "btree" ("status");



COMMENT ON INDEX "public"."idx_picking_lists_status" IS 'Optimizes active picking list queries';



CREATE INDEX "idx_picking_lists_user_id" ON "public"."picking_lists" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_created_by" ON "public"."profiles" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



COMMENT ON INDEX "public"."idx_profiles_created_by" IS 'Fixes unindexed FK - improves profile hierarchy queries';



CREATE INDEX "idx_report_date" ON "public"."optimization_reports" USING "btree" ("report_date" DESC);



CREATE OR REPLACE TRIGGER "trigger_sync_inventory_location_name" AFTER UPDATE OF "location" ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_inventory_location_name"();



CREATE OR REPLACE TRIGGER "update_locations_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."picking_lists"("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."picking_list_notes"
    ADD CONSTRAINT "picking_list_notes_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."picking_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."picking_list_notes"
    ADD CONSTRAINT "picking_list_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."picking_lists"
    ADD CONSTRAINT "picking_lists_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."picking_lists"
    ADD CONSTRAINT "picking_lists_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."picking_lists"
    ADD CONSTRAINT "picking_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."picking_sessions"
    ADD CONSTRAINT "picking_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin manage sku_metadata" ON "public"."sku_metadata" USING ("public"."is_admin"());



CREATE POLICY "Admins only access app_users" ON "public"."app_users" USING ("public"."is_admin"());



CREATE POLICY "Collaborative Delete" ON "public"."picking_lists" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Collaborative Insert" ON "public"."picking_lists" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Collaborative Select" ON "public"."picking_lists" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Collaborative Update" ON "public"."picking_lists" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Inventory Admin Access" ON "public"."inventory" USING ("public"."is_admin"());



CREATE POLICY "Inventory Staff Delete" ON "public"."inventory" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Inventory Staff Insert" ON "public"."inventory" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Inventory Staff Update" ON "public"."inventory" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Inventory viewable by authenticated users" ON "public"."inventory" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Locations Admin Access" ON "public"."locations" USING ("public"."is_admin"());



CREATE POLICY "Locations Staff Read" ON "public"."locations" FOR SELECT USING (true);



CREATE POLICY "Locations manageable by admins" ON "public"."locations" USING ("public"."is_admin"());



CREATE POLICY "Locations viewable by authenticated users" ON "public"."locations" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Logs are viewable by authenticated users" ON "public"."inventory_logs" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Logs can be inserted by authenticated users" ON "public"."inventory_logs" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Logs can be managed by admins" ON "public"."inventory_logs" USING ("public"."is_admin"());



CREATE POLICY "Metadata viewable by authenticated users" ON "public"."sku_metadata" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Profiles are viewable by authenticated users" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Profiles viewable by authenticated users" ON "public"."profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Public full access reports" ON "public"."optimization_reports" USING (true);



CREATE POLICY "Reports manageable by admins" ON "public"."optimization_reports" USING ("public"."is_admin"());



CREATE POLICY "Reports viewable by authenticated users" ON "public"."optimization_reports" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Users can add notes to relevant lists" ON "public"."picking_list_notes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."picking_lists"
  WHERE (("picking_lists"."id" = "picking_list_notes"."list_id") AND (("picking_lists"."user_id" = "auth"."uid"()) OR ("picking_lists"."checked_by" = "auth"."uid"()))))));



CREATE POLICY "Users can insert own picking session" ON "public"."picking_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own picking session" ON "public"."picking_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own picking session" ON "public"."picking_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view notes for accessible lists" ON "public"."picking_list_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."picking_lists"
  WHERE ("picking_lists"."id" = "picking_list_notes"."list_id"))));



ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_delete_admin" ON "public"."inventory" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "inventory_insert_authenticated" ON "public"."inventory" FOR INSERT WITH CHECK (("public"."current_user_id"() IS NOT NULL));



ALTER TABLE "public"."inventory_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_logs_delete_admin" ON "public"."inventory_logs" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "inventory_logs_insert_authenticated" ON "public"."inventory_logs" FOR INSERT WITH CHECK (("public"."current_user_id"() IS NOT NULL));



CREATE POLICY "inventory_logs_select_authenticated" ON "public"."inventory_logs" FOR SELECT USING (("public"."current_user_id"() IS NOT NULL));



CREATE POLICY "inventory_select_authenticated" ON "public"."inventory" FOR SELECT USING (("public"."current_user_id"() IS NOT NULL));



CREATE POLICY "inventory_update_authenticated" ON "public"."inventory" FOR UPDATE USING (("public"."current_user_id"() IS NOT NULL)) WITH CHECK (("public"."current_user_id"() IS NOT NULL));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_modify_admin" ON "public"."locations" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "locations_select_authenticated" ON "public"."locations" FOR SELECT USING (("public"."current_user_id"() IS NOT NULL));



ALTER TABLE "public"."optimization_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."picking_list_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."picking_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."picking_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_all" ON "public"."profiles" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "public"."current_user_id"()));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("id" = "public"."current_user_id"()));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "public"."current_user_id"())) WITH CHECK (("id" = "public"."current_user_id"()));



ALTER TABLE "public"."sku_metadata" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sku_metadata_select_authenticated" ON "public"."sku_metadata" FOR SELECT USING (("public"."current_user_id"() IS NOT NULL));



CREATE POLICY "sku_metadata_upsert_authenticated" ON "public"."sku_metadata" USING (("public"."current_user_id"() IS NOT NULL)) WITH CHECK (("public"."current_user_id"() IS NOT NULL));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."inventory";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."picking_lists";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."current_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_stock_at_timestamp"("target_timestamp" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_stock_at_timestamp"("target_timestamp" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stock_at_timestamp"("target_timestamp" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_manager"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_inventory_location_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_inventory_location_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_inventory_location_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."undo_inventory_action"("target_log_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."undo_inventory_action"("target_log_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."undo_inventory_action"("target_log_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_warehouse_zones_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_warehouse_zones_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_warehouse_zones_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inventory_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inventory_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inventory_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_logs" TO "anon";
GRANT ALL ON TABLE "public"."inventory_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_logs" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."optimization_reports" TO "anon";
GRANT ALL ON TABLE "public"."optimization_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."optimization_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."optimization_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."optimization_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."optimization_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."picking_list_notes" TO "anon";
GRANT ALL ON TABLE "public"."picking_list_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."picking_list_notes" TO "service_role";



GRANT ALL ON TABLE "public"."picking_lists" TO "anon";
GRANT ALL ON TABLE "public"."picking_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."picking_lists" TO "service_role";



GRANT ALL ON TABLE "public"."picking_sessions" TO "anon";
GRANT ALL ON TABLE "public"."picking_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."picking_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."sku_metadata" TO "anon";
GRANT ALL ON TABLE "public"."sku_metadata" TO "authenticated";
GRANT ALL ON TABLE "public"."sku_metadata" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































