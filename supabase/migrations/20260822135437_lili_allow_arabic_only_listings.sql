-- title was NOT NULL, so a seller writing only in Arabic could not list at all.
-- In a market where half the sellers write عباية سوداء and never touch a Latin
-- keyboard, that is not a schema detail — it is a category of woman excluded
-- from the app.
--
-- Now: at least ONE title is required, in either language.
alter table public.lili_items alter column title drop not null;

alter table public.lili_items drop constraint if exists lili_items_title_check;
alter table public.lili_items drop constraint if exists lili_title_present;
alter table public.lili_items add constraint lili_title_present check (
  coalesce(btrim(title), '') <> '' or coalesce(btrim(title_ar), '') <> ''
);

-- length limits still apply to whichever is given
alter table public.lili_items drop constraint if exists lili_title_length;
alter table public.lili_items add constraint lili_title_length check (
  (title is null or length(title) <= 120) and
  (title_ar is null or length(title_ar) <= 120)
);
