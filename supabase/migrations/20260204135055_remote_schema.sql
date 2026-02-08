-- drop extension if exists "pg_net";

alter table "public"."locations" drop constraint "locations_zone_check";

alter table "public"."locations" add constraint "locations_zone_check" CHECK (((zone)::text = ANY ((ARRAY['HOT'::character varying, 'WARM'::character varying, 'COLD'::character varying, 'UNASSIGNED'::character varying])::text[]))) not valid;

alter table "public"."locations" validate constraint "locations_zone_check";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


