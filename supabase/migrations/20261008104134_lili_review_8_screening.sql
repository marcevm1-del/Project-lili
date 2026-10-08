create or replace function lili.screen_listing()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  blob text; clean text; whole text; band jsonb; band_low numeric; ratio numeric;
  score int := 0; findings jsonb := '[]'::jsonb; verdict text := 'live';
  EXTREME constant numeric := 0.35;
  THRESHOLD constant int := 3;
  REPTILE constant text := '(python|crocodile|croc|alligator)';
begin
  whole := coalesce(new.title,'') || ' ' || coalesce(new.subtitle,'');
  blob  := lower(whole || ' ' || coalesce(new.description,'') || ' ' || coalesce(new.brand,''));

  -- lawful phrases containing a blocked word; removed before the hard blocks
  clean := regexp_replace(blob,
    '(not (a )?fake|no fakes?|never fake|alcohol[- ]free|non[- ]alcoholic'
    || '|prescription (glasses|lenses|sunglasses|frames|eyewear)'
    || '|(faux|vegan|embossed|printed|print|effect|stamped) ' || REPTILE
    || '|' || REPTILE || '[- ]?(embossed|print(ed)?|effect|pattern|stamped|look|skin print))',
    ' ', 'g');

  if clean ~ '(replica|counterfeit|\yfake\y|mirror quality|1:1|aaa grade|\ydupe\y|\yclone\y)' then
    verdict := 'removed'; findings := findings || jsonb_build_array('counterfeit.self_declared');
  elsif clean ~ '((real|genuine|elephant|carved) ivory|ivory (carving|tusk|figurine)|tortoiseshell|shahtoosh)' then
    verdict := 'removed'; findings := findings || jsonb_build_array('cites');
  elsif clean ~ '(firearm|\ygun\y|ammunition|taser|pepper spray|\ydagger\y|\yknife\y)' then
    verdict := 'removed'; findings := findings || jsonb_build_array('weapons');
  elsif clean ~ '(tramadol|xanax|viagra|steroid|prescription|supplement)' then
    verdict := 'removed'; findings := findings || jsonb_build_array('pharma');
  elsif clean ~ '(whisky|vodka|bottles? of wine|\ywine bottles?\y|\yvape\y|e-cigarette|shisha|tobacco|alcohol)' then
    verdict := 'removed'; findings := findings || jsonb_build_array('restricted.substance');
  elsif clean ~ 'used (underwear|panties|lingerie|swimwear|socks)|worn underwear' then
    verdict := 'removed'; findings := findings || jsonb_build_array('hygiene');
  end if;

  if verdict <> 'removed' then
    -- genuine exotic leather is lawful with CITES papers: a person checks them
    if clean ~ ('\y' || REPTILE || '\y') then
      score := score + THRESHOLD; findings := findings || jsonb_build_array('cites.exotic_leather');
    end if;
    if blob ~ '(inspired by|style of|similar to|looks like|comparable to)' then
      score := score + 2; findings := findings || jsonb_build_array('counterfeit.lookalike');
    end if;
    if blob ~ '(factory direct|wholesale|\ybulk\y|\ymoq\y|stock available|multiple available)' then
      score := score + 2; findings := findings || jsonb_build_array('trader.undeclared');
    end if;
    if blob ~ '(unauthenticated|no receipt|no box|no dustbag|no papers|street bought)' then
      score := score + 1; findings := findings || jsonb_build_array('provenance.missing');
    end if;
    if blob ~ '(100 ?% ?(authentic|genuine|original)|guaranteed authentic|real not fake)' then
      score := score + 1; findings := findings || jsonb_build_array('counterfeit.over_assertion');
    end if;
    if not new.authenticated then
      band := lili.reference_band(new.brand, whole, new.category, new.condition);
      if band is not null then
        band_low := (band->>'low')::numeric;
        if band_low > 0 and new.price > 0 and new.price < band_low then
          ratio := new.price / band_low;
          if ratio < EXTREME then
            score := score + 3; findings := findings || jsonb_build_array('counterfeit.price_extreme');
          else
            score := score + 1; findings := findings || jsonb_build_array('counterfeit.price_soft');
          end if;
        end if;
      end if;
    end if;
    if score >= THRESHOLD then verdict := 'in_review'; end if;
  end if;

  new.screening := jsonb_build_object('rules', 'v2.12', 'verdict', verdict, 'score', score,
    'threshold', THRESHOLD, 'findings', findings, 'band', band, 'at', now());

  -- an edit can make a listing worse, never better
  if tg_op = 'UPDATE' and old.status in ('removed', 'in_review', 'sold') then
    new.status := case when verdict = 'removed' then 'removed' else old.status end;
  else
    new.status := verdict;
  end if;
  return new;
end; $$;
