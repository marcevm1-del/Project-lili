-- Something has to call lili_expire_offers.
--
-- The OffersPage comment argues that deriving expiry from the clock means
-- "nothing stays open because a job failed to run". That is right, and it is
-- why the DISPLAY still comes from the clock and the accept path is guarded by
-- a trigger rather than by this sweep. The sweep exists to move the stored
-- state and send the buyer a message; if it stops running, nothing becomes
-- acceptable that should not be — she just isn't told as promptly.

create extension if not exists pg_cron with schema extensions;

-- Hourly. Forty-eight-hour offers do not need minute precision, and an hourly
-- job is one a human can reason about when reading the notification times.
select cron.unschedule('lili-expire-offers')
 where exists (select 1 from cron.job where jobname = 'lili-expire-offers');

select cron.schedule('lili-expire-offers', '7 * * * *',
                     $$select public.lili_expire_offers(500);$$);
