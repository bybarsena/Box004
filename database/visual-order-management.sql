alter table public.products add column if not exists category text not null default 'Camisetas' check(category in ('Camisetas','Crop tops','Sudaderas'));
update public.products set category=case when name ilike '%sudadera%' then 'Sudaderas' when name ilike '%crop%' then 'Crop tops' else 'Camisetas' end;
alter table public.orders add column if not exists archived_at timestamptz;
grant update(archived_at) on public.orders to authenticated;
create or replace function private.archive_paid_order() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.paid_cents is distinct from old.paid_cents then
  if new.paid_cents >= new.total_cents then
   new.archived_at:=coalesce(new.archived_at,now());
  elsif old.paid_cents >= old.total_cents then
   new.archived_at:=null;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.archive_paid_order() from public,anon,authenticated;
drop trigger if exists archive_paid_order on public.orders;
create trigger archive_paid_order before update of paid_cents on public.orders for each row execute function private.archive_paid_order();
update public.orders set archived_at=now() where archived_at is null and paid_cents>=total_cents and paid_cents>0 and status<>'cancelled';
create index if not exists orders_open_created_at on public.orders(created_at desc) where archived_at is null and status<>'cancelled';

create or replace function public.save_catalog_product(p_id uuid,p_name text,p_description text,p_price_cents integer,p_active boolean,p_category text,p_variants jsonb,p_photos jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare row jsonb;
begin
 if not coalesce(private.is_admin(),false) then raise exception 'admin_required'; end if;
 if p_id is null or length(trim(p_name)) not between 1 and 160 or p_price_cents not between 0 and 1000000 or length(coalesce(p_description,''))>2000 then raise exception 'invalid_product'; end if;
 if p_category not in ('Camisetas','Crop tops','Sudaderas') then raise exception 'invalid_category'; end if;
 if p_variants is null or jsonb_typeof(p_variants)<>'array' or jsonb_array_length(p_variants)>300 then raise exception 'invalid_variants'; end if;
 if p_photos is null or jsonb_typeof(p_photos)<>'array' or jsonb_array_length(p_photos)>50 then raise exception 'invalid_photos'; end if;
 if p_active and not exists(select 1 from jsonb_array_elements(p_variants) v where coalesce((v->>'active')::boolean,true)) then raise exception 'active_variant_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 insert into public.products(id,name,description,price_cents,active,category) values(p_id,trim(p_name),coalesce(p_description,''),p_price_cents,p_active,p_category)
 on conflict(id) do update set name=excluded.name,description=excluded.description,price_cents=excluded.price_cents,active=excluded.active,category=excluded.category;
 update public.product_variants set active=false where product_id=p_id;
 for row in select value from jsonb_array_elements(p_variants) loop
  if coalesce(length(trim(row->>'model')),0) not between 1 and 80 or coalesce(length(trim(row->>'size')),0) not between 1 and 80 or coalesce(length(trim(row->>'color')),0) not between 1 and 80 then raise exception 'invalid_variant'; end if;
  insert into public.product_variants(product_id,model,size,color,active) values(p_id,trim(row->>'model'),trim(row->>'size'),trim(row->>'color'),coalesce((row->>'active')::boolean,true)) on conflict(product_id,model,size,color) do update set active=excluded.active;
 end loop;
 delete from public.product_color_images where product_id=p_id;
 for row in select value from jsonb_array_elements(p_photos) loop
  if coalesce(length(trim(row->>'color')),0) not between 1 and 80 or coalesce(length(row->>'image_url'),0)>2000 then raise exception 'invalid_photo'; end if;
  insert into public.product_color_images(product_id,color,image_url) values(p_id,trim(row->>'color'),row->>'image_url');
 end loop;
 return p_id;
end $$;
revoke all on function public.save_catalog_product(uuid,text,text,integer,boolean,text,jsonb,jsonb) from public,anon;
grant execute on function public.save_catalog_product(uuid,text,text,integer,boolean,text,jsonb,jsonb) to authenticated;
