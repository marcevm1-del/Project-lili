-- Local / CI only. `supabase start` loads this into the throwaway database it
-- builds from supabase/migrations; it never runs against a real project.
--
-- Three accounts, because the database tests play a seller (the founder
-- address the functional test looks up), a buyer and a third person.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'marcevm1@gmail.com', '', now(),
   now() - interval '3 days', now(), '{"provider":"email"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'buyer@test.lili', '', now(),
   now() - interval '2 days', now(), '{"provider":"email"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'third@test.lili', '', now(),
   now() - interval '1 day', now(), '{"provider":"email"}', '{}')
on conflict (id) do nothing;
