-- ─────────────────────────────────────────────────────────────────────────────
-- 38 · App health, for moderators (audit A2-10)
--
-- Nobody would have known if the app broke: crash reports went into a table
-- no screen read, and nothing showed whether the scheduled jobs (offer expiry,
-- the order clock, pruning) were running. Until real alerting exists, this is
-- one place to look: crashes in the last day and week with the commonest
-- messages, each lili job's last run and failures, the work waiting on a
-- person, and where orders and money stand. Moderators only; nothing personal
-- (crash messages are already scrubbed of personal data by the app).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.lili_app_health()
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.lili_is_moderator() then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'at', now(),
    'crashes_24h', (select count(*) from public.lili_client_errors where at > now() - interval '24 hours'),
    'crashes_7d',  (select count(*) from public.lili_client_errors where at > now() - interval '7 days'),
    'top_crashes', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
                      select left(message, 140) as message, count(*) as n, max(at) as last_at,
                             max(version) as version, max(screen) as screen
                        from public.lili_client_errors where at > now() - interval '7 days'
                       group by left(message, 140) order by count(*) desc limit 5) x),
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object(
                'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
                'last_run', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
                'last_status', (select d.status from cron.job_run_details d where d.jobid = j.jobid
                                 order by d.start_time desc limit 1),
                'failures_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid
                                   and d.status = 'failed' and d.start_time > now() - interval '24 hours'))
              order by j.jobname), '[]'::jsonb)
             from cron.job j where j.jobname like 'lili-%'),
    'waiting', jsonb_build_object(
        'listings_in_review', (select count(*) from public.lili_items where status = 'in_review'),
        'reports_open',       (select count(*) from public.lili_moderation_cases where state in ('pending', 'reviewing')),
        'appeals',            (select count(*) from public.lili_moderation_cases where state = 'appealed'),
        'order_disputes',     (select count(*) from public.lili_orders where state = 'disputed')),
    'orders', jsonb_build_object(
        'payments_enabled',   public.lili_payments_enabled(),
        'awaiting_payment',   (select count(*) from public.lili_orders where state = 'awaiting_payment'),
        'to_send',            (select count(*) from public.lili_orders where state = 'paid'),
        'on_the_way',         (select count(*) from public.lili_orders where state = 'shipped'),
        'payout_due',         (select count(*) from public.lili_orders where money_state = 'payout_due'),
        'refund_due',         (select count(*) from public.lili_orders where money_state = 'refund_due'),
        'money_failed',       (select count(*) from public.lili_orders where money_state = 'failed'))
  );
end; $$;
revoke all on function public.lili_app_health() from public, anon;
grant execute on function public.lili_app_health() to authenticated, service_role;
