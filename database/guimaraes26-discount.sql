alter table public.discounts add column if not exists eligible_product_ids uuid[];
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.submit_order(uuid,jsonb,jsonb,text,text,text)'::regprocedure) into definition;
 if position('allowed_ids' in definition)=0 then
  definition := replace(definition, 'hit_count integer;', 'hit_count integer; allowed_ids uuid[];');
  definition := replace(definition, 'select percent into pct from public.discounts', 'select percent,eligible_product_ids into pct,allowed_ids from public.discounts');
  definition := replace(definition, 'reduction:=floor(subtotal::numeric*pct/100)::integer;', $replacement$
  select floor(coalesce(sum(p.price_cents*(j.value->>'quantity')::integer),0)::numeric*pct/100)::integer into reduction
  from jsonb_array_elements(p_lines) j
  join public.product_variants x on x.id=(j.value->>'variant_id')::uuid
  join public.products p on p.id=x.product_id
  where allowed_ids is null or p.id=any(allowed_ids);
  $replacement$);
  if position('where allowed_ids is null' in definition)=0 then raise exception 'discount_patch_failed'; end if;
  execute definition;
 end if;
end $migration$;
insert into public.discounts(code,percent,active,expires_at,eligible_product_ids)
select 'GUIMARAES26',50,false,null,array_agg(id order by id)
from public.products where name in ('Camiseta sin manga Summer','Crop top Athlete','Crop top Heavy Lifting','Oversize Athlete','Oversize Heavy Lifting','Sin mangas Athlete','Sin mangas Summer Rest')
on conflict(code) do update set percent=50,active=false,expires_at=null,eligible_product_ids=excluded.eligible_product_ids;