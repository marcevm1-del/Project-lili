-- ═══════════════════════════════════════════════════════════════════════════
--  v2.8 SCREENING — the server half
--
--  Until now the client and the database disagreed about what a suspicious
--  price is, and the database won. The client used brand-tier × category ×
--  condition bands; the trigger used eight flat per-brand floors with no idea
--  whether it was looking at a handbag or a silk scarf. A seller listing a
--  genuine Hermès Twilly at AED 600 was told her listing needed review.
--
--  This ports src/data/resaleValue.js and src/compliance/listingRules.js into
--  SQL. The two must move together — the band numbers live in both places, and
--  every screening verdict now records `rules: 'v2.8'` so you can always tell
--  which version judged a listing.
--
--  The scoring rule, which is the substance of the change: a price below the
--  band is worth 1 point and REVIEW NEEDS 3. Only a price under a third of the
--  band scores 3 by itself. Everything else needs a second, independent signal.
--  The Leipzig study on counterfeit-offer identification found price the only
--  single indicator that survives real marketplace data, and still only ~54-63%
--  precise alone. One flag in two was an honest seller. That is too expensive
--  an error to make on its own.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── brand tier ─────────────────────────────────────────────────────────────
create or replace function lili.brand_tier(p_brand text)
returns text language sql immutable as $$
  select case lower(btrim(coalesce(p_brand,'')))
    when 'hermès' then 'ultra' when 'hermes' then 'ultra'
    when 'goyard' then 'ultra' when 'chanel' then 'ultra'
    when 'rolex' then 'ultra'  when 'patek philippe' then 'ultra'
    when 'audemars piguet' then 'ultra' when 'van cleef & arpels' then 'ultra'

    when 'louis vuitton' then 'premium' when 'dior' then 'premium'
    when 'gucci' then 'premium' when 'prada' then 'premium'
    when 'miu miu' then 'premium' when 'bottega veneta' then 'premium'
    when 'saint laurent' then 'premium' when 'celine' then 'premium'
    when 'céline' then 'premium' when 'loewe' then 'premium'
    when 'fendi' then 'premium' when 'balenciaga' then 'premium'
    when 'valentino' then 'premium' when 'the row' then 'premium'
    when 'cartier' then 'premium' when 'bulgari' then 'premium'
    when 'tiffany & co' then 'premium' when 'tiffany & co.' then 'premium'
    when 'burberry' then 'premium'

    when 'chloé' then 'contemporary' when 'chloe' then 'contemporary'
    when 'jacquemus' then 'contemporary' when 'isabel marant' then 'contemporary'
    when 'zimmermann' then 'contemporary' when 'ganni' then 'contemporary'
    when 'toteme' then 'contemporary' when 'nanushka' then 'contemporary'
    when 'rixo' then 'contemporary' when 'rotate' then 'contemporary'
    when 'self portrait' then 'contemporary' when 'reformation' then 'contemporary'
    when 'the frankie shop' then 'contemporary' when 'gianvito rossi' then 'contemporary'
    when 'manolo blahnik' then 'contemporary' when 'jimmy choo' then 'contemporary'
    when 'aquazzura' then 'contemporary' when 'christian louboutin' then 'contemporary'
    when 'david yurman' then 'contemporary'

    when 'emirati / local designer' then 'modest'
    when 'dubai modest fashion' then 'modest'
    when 'abaya couture' then 'modest'
    when 'local designer' then 'modest'
    else null end;
$$;

-- ── what kind of thing is this ─────────────────────────────────────────────
-- Words in the title win over the category dropdown, because "Luxury" is a
-- shelf, not an object. Plurals matter: sellers write "heels", not "heel".
create or replace function lili.item_kind(p_text text, p_category text default null)
returns text language sql immutable as $$
  select coalesce(
    case
      when lower(coalesce(p_text,'')) ~ '\y(twill(y|ies)|scarf|scarves|shawls?|foulards?|pashminas?|hijabs?)\y' then 'silk'
      when lower(coalesce(p_text,'')) ~ '\y(sunglass(es)?|sunnies|eyewear|shades)\y' then 'sunglasses'
      when lower(coalesce(p_text,'')) ~ '\y(belts?|ceintures?)\y' then 'belt'
      when lower(coalesce(p_text,'')) ~ '\y(wallets?|card ?holders?|coin purses?|key cases?|passport covers?)\y' then 'small_leather'
      when lower(coalesce(p_text,'')) ~ '\y(watch(es)?|timepieces?|datejust|submariner|santos|tank)\y' then 'watch'
      when lower(coalesce(p_text,'')) ~ '\y(necklaces?|bracelets?|bangles?|earrings?|rings?|pendants?|brooch(es)?|alhambra|charms?|anklets?)\y' then 'jewellery'
      when lower(coalesce(p_text,'')) ~ '\y(abaya(s|t)?|jalabiy(a|as|at)|kaftans?|kandura|thobes?|bisht|shaylas?)\y' then 'abaya'
      when lower(coalesce(p_text,'')) ~ '\y(heels?|pumps?|sandals?|sneakers?|boots?|loafers?|mules?|espadrilles?|slingbacks?|ballet flats?)\y' then 'shoes'
      when lower(coalesce(p_text,'')) ~ '\y(bags?|totes?|clutch(es)?|pouch(es)?|crossbody|shoulder bags?|backpacks?|satchels?|hobos?|baguettes?|birkin|kelly|speedy|flap)\y' then 'bag'
      when lower(coalesce(p_text,'')) ~ '\y(dress(es)?|gowns?|skirts?|blouses?|shirts?|tops?|trousers?|jeans?|coats?|jackets?|blazers?|knits?|cardigans?|suits?)\y' then 'rtw'
      else null end,
    case lower(coalesce(p_category,''))
      when 'bags' then 'bag' when 'shoes' then 'shoes'
      when 'dresses' then 'rtw' when 'tops' then 'rtw' when 'bottoms' then 'rtw'
      when 'jackets' then 'rtw' when 'skirts' then 'rtw'
      when 'abayas' then 'abaya'
      else null end,       -- 'Luxury' and 'Accessories' deliberately say nothing
    'other');
$$;

-- ── the band floor ─────────────────────────────────────────────────────────
-- Lowest plausible genuine second-hand price in AED. NULL means no basis, and
-- no basis means no opinion — which is a frequent and correct answer.
create or replace function lili.band_low(p_tier text, p_kind text)
returns numeric language sql immutable as $$
  select case p_tier
    when 'ultra' then case p_kind
      when 'bag' then 6000 when 'small_leather' then 900 when 'silk' then 450
      when 'sunglasses' then 350 when 'belt' then 700 when 'shoes' then 700
      when 'rtw' then 700 when 'jewellery' then 1400 when 'watch' then 7000
      when 'other' then 350 else null end
    when 'premium' then case p_kind
      when 'bag' then 1100 when 'small_leather' then 300 when 'silk' then 200
      when 'sunglasses' then 220 when 'belt' then 250 when 'shoes' then 380
      when 'rtw' then 260 when 'jewellery' then 500 when 'watch' then 1500
      when 'other' then 180 else null end
    when 'contemporary' then case p_kind
      when 'bag' then 280 when 'small_leather' then 120 when 'silk' then 90
      when 'sunglasses' then 110 when 'belt' then 90 when 'shoes' then 220
      when 'rtw' then 130 when 'jewellery' then 120 when 'watch' then 300
      when 'other' then 80 else null end
    when 'modest' then case p_kind
      when 'abaya' then 150 when 'rtw' then 120 when 'silk' then 80
      when 'other' then 80 else null end
    else null end;
$$;

-- ── model-level floors ─────────────────────────────────────────────────────
-- A tier band is blunt at the top of the market: a Birkin and an Hermès
-- espadrille are both "ultra", and only one can honestly be AED 6,000. Every
-- number here sits far below observed market — Rebag has the Birkin Sellier at
-- 183% of retail and UAE exotics sell past AED 600,000. These are the point at
-- which a price stops being a bargain and starts being a question.
create or replace function lili.model_floor(p_text text)
returns numeric language sql immutable as $$
  select case
    when lower(coalesce(p_text,'')) ~ '\ybirkin\y' then 25000
    when lower(coalesce(p_text,'')) ~ '\ykelly\y' then 22000
    when lower(coalesce(p_text,'')) ~ '\yconstance\y' then 15000
    when lower(coalesce(p_text,'')) ~ '\y(classic flap|11\.12|2\.55)\y' then 12000
    when lower(coalesce(p_text,'')) ~ '\y(boy bag|chanel 19)\y' then 8000
    when lower(coalesce(p_text,'')) ~ '\ysaint louis\y' then 4500
    when lower(coalesce(p_text,'')) ~ '\yspeedy\y' then 1800
    when lower(coalesce(p_text,'')) ~ '\yvintage alhambra\y' then 6000
    when lower(coalesce(p_text,'')) ~ '\ysweet alhambra\y' then 3000
    when lower(coalesce(p_text,'')) ~ '\ylove (bracelet|bangle)\y' then 12000
    when lower(coalesce(p_text,'')) ~ '\ytrinity\y' then 3500
    when lower(coalesce(p_text,'')) ~ '\ysubmariner\y' then 20000
    when lower(coalesce(p_text,'')) ~ '\ydatejust\y' then 15000
    else null end;
$$;

-- ── condition ──────────────────────────────────────────────────────────────
-- Fair-condition resale is legitimate and growing: The RealReal reports
-- fair-condition sales +32% YoY and bags with visible wear +45%. A low price on
-- a worn piece is expected, not suspicious.
create or replace function lili.condition_factor(p_condition text)
returns numeric language sql immutable as $$
  select case lower(btrim(coalesce(p_condition,'')))
    when 'like new' then 1.15 when 'excellent' then 1.0
    when 'good' then 0.78 when 'fair' then 0.55 else 1.0 end;
$$;

-- ── the reference band ─────────────────────────────────────────────────────
create or replace function lili.reference_band(
  p_brand text, p_text text, p_category text, p_condition text)
returns jsonb language plpgsql immutable as $$
declare v_tier text; v_kind text; v_model numeric; v_base numeric; v_low numeric;
begin
  v_tier := lili.brand_tier(p_brand);
  if v_tier is null then return null; end if;

  v_model := lili.model_floor(p_text);
  -- A named model only applies its floor if the brand is one that makes it:
  -- "speedy delivery" in a Ganni description is not a Louis Vuitton Speedy.
  if v_model is not null and v_tier in ('ultra','premium') then
    v_kind := case
      when lower(coalesce(p_text,'')) ~ '\y(alhambra|love (bracelet|bangle)|trinity)\y' then 'jewellery'
      when lower(coalesce(p_text,'')) ~ '\y(submariner|datejust)\y' then 'watch'
      else 'bag' end;
    v_base := greatest(v_model, coalesce(lili.band_low(v_tier, v_kind), 0));
  else
    v_kind := lili.item_kind(p_text, p_category);
    v_base := lili.band_low(v_tier, v_kind);
  end if;

  if v_base is null then return null; end if;
  v_low := round(v_base * lili.condition_factor(p_condition));

  return jsonb_build_object(
    'low', v_low, 'tier', v_tier, 'kind', v_kind,
    'condition', coalesce(p_condition,'Excellent'),
    'model', v_model is not null);
end; $$;

-- ── the trigger ────────────────────────────────────────────────────────────
-- SECURITY DEFINER is kept from the previous version. The handover's trap —
-- "SECURITY DEFINER on a guard defeats the guard" — does not apply here,
-- because this function reads no caller identity. It only writes NEW.
create or replace function lili.screen_listing()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  blob text; whole text; band jsonb; band_low numeric; ratio numeric;
  score int := 0; findings jsonb := '[]'::jsonb; verdict text := 'live';
  EXTREME constant numeric := 0.35;
  THRESHOLD constant int := 3;
begin
  whole := coalesce(new.title,'') || ' ' || coalesce(new.subtitle,'');
  blob  := lower(whole || ' ' || coalesce(new.description,'') || ' ' || coalesce(new.brand,''));

  -- ── hard blocks: unlawful or unlistable, not merely suspicious ──────────
  if blob ~ '(replica|counterfeit|\yfake\y|mirror quality|1:1|aaa grade|\ydupe\y|\yclone\y)' then
    verdict := 'removed'; findings := findings || jsonb_build_array('counterfeit.self_declared');
  elsif blob ~ '(ivory|tortoiseshell|shahtoosh|python|crocodile|alligator)' then
    verdict := 'removed'; findings := findings || jsonb_build_array('cites');
  elsif blob ~ '(firearm|\ygun\y|ammunition|taser|pepper spray|\ydagger\y|\yknife\y)' then
    verdict := 'removed'; findings := findings || jsonb_build_array('weapons');
  elsif blob ~ '(tramadol|xanax|viagra|steroid|prescription|supplement)' then
    verdict := 'removed'; findings := findings || jsonb_build_array('pharma');
  elsif blob ~ '(whisky|vodka|\ywine\y|\yvape\y|e-cigarette|shisha|tobacco|alcohol)' then
    verdict := 'removed'; findings := findings || jsonb_build_array('restricted.substance');
  elsif blob ~ 'used (underwear|panties|lingerie|swimwear|socks)|worn underwear' then
    verdict := 'removed'; findings := findings || jsonb_build_array('hygiene');
  end if;

  if verdict <> 'removed' then
    -- ── scored signals ───────────────────────────────────────────────────
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

    -- ── price ────────────────────────────────────────────────────────────
    -- Authentication in hand removes the price signal entirely rather than
    -- reducing it: the question it stood in for has been answered by
    -- something better.
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

  new.status := verdict;
  new.screening := jsonb_build_object(
    'rules', 'v2.8',
    'verdict', verdict,
    'score', score,
    'threshold', THRESHOLD,
    'findings', findings,
    'band', band,
    'at', now());
  return new;
end; $$;
