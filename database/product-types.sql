create table public.product_types (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check(name=trim(name) and char_length(name) between 2 and 50 and lower(name)<>'todas'),
 created_at timestamptz not null default now()
);
create unique index product_types_name_folded on public.product_types(lower(name));
alter table public.product_types enable row level security;
grant select on public.product_types to anon,authenticated,service_role;
grant insert(name),update(name) on public.product_types to authenticated;
create policy types_read on public.product_types for select to anon,authenticated using (true);
create policy types_insert_admin on public.product_types for insert to authenticated with check ((select private.is_admin()));
create policy types_update_admin on public.product_types for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
insert into public.product_types(name) select distinct category from public.products
union select unnest(array['Camisetas','Crop tops','Sudaderas']);
alter table public.products drop constraint products_category_check;
alter table public.products add constraint products_category_type_fkey foreign key(category) references public.product_types(name) on update cascade on delete restrict;
create index products_category_idx on public.products(category);

create or replace function public.save_catalog_product(p_id uuid,p_name text,p_description text,p_price_cents integer,p_active boolean,p_category text,p_variants jsonb,p_photos jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare row jsonb;
begin
 if not coalesce(private.is_admin(),false) then raise exception 'admin_required'; end if;
 if p_id is null or length(trim(p_name)) not between 1 and 160 or p_price_cents not between 0 and 1000000 or length(coalesce(p_description,''))>2000 then raise exception 'invalid_product'; end if;
 if p_category is null or not exists(select 1 from public.product_types where name=p_category) then raise exception 'invalid_category'; end if;
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
