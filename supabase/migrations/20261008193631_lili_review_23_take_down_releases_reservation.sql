-- Taking a reserved piece down tells the buyer it was released, instead of
-- leaving her holding an accepted offer for a piece that is gone.
create or replace function public.lili_withdraw_listing(p_item uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); v_reserved uuid;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select reserved_offer into v_reserved from public.lili_items where id = p_item and owner_uid = me for update;
  if not found then
    raise exception 'That listing is not yours' using errcode = '42501';
  end if;
  if exists (select 1 from public.lili_moderation_cases
              where target_item_id = p_item and state in ('pending', 'reviewing')) then
    raise exception 'This listing is being reviewed. It can be taken down once that is decided.'
      using errcode = '55000';
  end if;
  if v_reserved is not null then
    update public.lili_offers set state = 'declined', responded_at = now()
     where id = v_reserved and state = 'accepted';
  end if;
  update public.lili_items
     set status = 'removed', reserved_offer = null,
         screening = coalesce(screening, '{}'::jsonb)
                     || jsonb_build_object('withdrawn_by_owner', true, 'withdrawn_at', now())
   where id = p_item;
  update public.lili_offers
     set state = case when expires_at < now() then 'expired' else 'declined' end,
         responded_at = now()
   where item_id = p_item and state = 'pending';
  return jsonb_build_object('ok', true);
end; $$;
