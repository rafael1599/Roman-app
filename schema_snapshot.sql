create extension if not exists "pg_cron" with schema "pg_catalog";

drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

alter table "public"."locations" drop constraint "locations_zone_check";

alter table "public"."locations" add constraint "locations_zone_check" CHECK (((zone)::text = ANY ((ARRAY['HOT'::character varying, 'WARM'::character varying, 'COLD'::character varying, 'UNASSIGNED'::character varying])::text[]))) not valid;

alter table "public"."locations" validate constraint "locations_zone_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.sync_inventory_seq_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Si el INSERT trae un ID explícito, ajustamos la secuencia para que el próximo sea ID+1
    IF NEW.id IS NOT NULL THEN
        PERFORM setval('public.inventory_id_seq', GREATEST(NEW.id, (SELECT last_value FROM public.inventory_id_seq)));
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE TRIGGER tr_sync_inventory_sequence AFTER INSERT ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_seq_on_insert();



