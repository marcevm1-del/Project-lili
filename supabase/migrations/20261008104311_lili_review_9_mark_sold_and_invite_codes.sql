create or replace function public.lili_mark_sold(p_item uuid, p_sold boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); v_status text; n_declined int := 0;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select status into v_status from public.lili_items where id = p_item and owner_uid = me for update;
  if not found then raise exception 'That listing is not yours' using errcode = '42501'; end if;
  if p_sold then
    if v_status <> 'live' then
      raise exception 'Only a live listing can be marked sold' using errcode = '22023';
    end if;
    update public.lili_items set status = 'sold' where id = p_item;
    update public.lili_offers
       set state = case when expires_at < now() then 'expired' else 'declined' end,
           responded_at = now()
     where item_id = p_item and state = 'pending';
    get diagnostics n_declined = row_count;
  else
    if v_status <> 'sold' then
      raise exception 'Only a sold listing can be relisted' using errcode = '22023';
    end if;
    update public.lili_items set status = 'live' where id = p_item;
  end if;
  return jsonb_build_object('ok', true, 'status', case when p_sold then 'sold' else 'live' end,
                            'offers_declined', n_declined);
end; $$;
grant execute on function public.lili_mark_sold(uuid, boolean) to authenticated;

create or replace function public.lili_invite_code()
returns text language plpgsql volatile set search_path to 'public', 'pg_temp'
as $$
declare
  alphabet constant text := 'ACDEFGHJKLMNPQRTUVWXY2346789';
  v_code text := '';
  b int;
begin
  -- 252 is the largest multiple of 28 below 256: no modulo bias
  while length(v_code) < 8 loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 252 then v_code := v_code || substr(alphabet, 1 + (b % 28), 1); end if;
  end loop;
  return 'LILI-' || substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
end; $$;
