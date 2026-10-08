-- Relisting a sold piece set it straight to live. Screening still runs on every
-- edit while a piece is sold, but keeps it "sold", so a seller could edit a sold
-- listing into something the screener would hold, then relist it past review.
-- Relisting now applies the latest screening verdict: held pieces go to review
-- (and file_case_upd opens the case), never straight back on sale.
create or replace function public.lili_mark_sold(p_item uuid, p_sold boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); v_status text; v_verdict text; v_new text; n_declined int := 0;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select status, screening ->> 'verdict' into v_status, v_verdict
    from public.lili_items where id = p_item and owner_uid = me for update;
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
    v_new := 'sold';
  else
    if v_status <> 'sold' then
      raise exception 'Only a sold listing can be relisted' using errcode = '22023';
    end if;
    v_new := case v_verdict when 'removed' then 'removed'
                            when 'in_review' then 'in_review' else 'live' end;
    update public.lili_items set status = v_new where id = p_item;
  end if;

  return jsonb_build_object('ok', true, 'status', v_new, 'offers_declined', n_declined);
end; $$;
