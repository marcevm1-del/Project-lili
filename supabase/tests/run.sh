#!/usr/bin/env bash
# Rebuild-from-zero check for lili's database. CI runs this after
# `supabase start` has created a fresh database from supabase/migrations and
# loaded supabase/seed.sql. It answers one question: if production were lost,
# could the repository rebuild a database that behaves like it?
#
#   1. apply the pending owner SQL (production once the owner has run it)
#   2. run the end-to-end functional test and check every result it reports
#   3. run the audit regression test, which asserts as it goes
#
# Exit status is non-zero on any failure, with the full result line printed.
set -uo pipefail
DB="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "$0")" && pwd)"
fail=0

echo "== pending owner SQL"
if ! psql "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/../pending/20261008_needs_owner_approval.sql"; then
  echo "pending SQL did not apply cleanly"; exit 1
fi

# The tests end by raising an exception that carries their results (so they
# roll back); psql therefore always "fails" — read the message instead.
result_of() { psql "$DB" -q -f "$1" 2>&1 | sed -n 's/.*ERROR:  *\(P0001: \)\{0,1\}//p' | head -1; }

echo "== functional test"
r="$(result_of "$HERE/functional_test.sql")"
echo "$r"
expect=(
  "A1 mint=true" "A2 member_before=false" "A3 bad_code=unknown" "A4 redeem=welcome"
  "A5 member_after=true" "A6 anon_redeem=sign_in_required"
  "B1 listing=live" "B2 anon_sees=2" "B3 search=1" "B4 typo=1" "B6 accent=1" "B7 stats_live=2"
  "C1 saves=1" "C2 followers=1" "C3 price_drop_notif=1" "C4 prev_price=true" "C5 anon_sees_followers=0"
  "D2 last=true" "D3 can_edit_body=false" "D4 mark_read=1" "D5 anon_reads=false"
  "E1 offer_notif=1" "E2 seller_sees=1" "E3 accept=accepted/400" "E5 withdraw_after_accept=false"
  "E6 buyer_self_accept=false" "E7 expired=expired"
  "F1 self_confirm=false" "F2 meet=confirmed/fine"
  "G1 duplicate_report=false" "G2 in_queue=true" "G3 item=removed" "G4 shop=1/active"
  "H1 reported=true" "H3 non_mod_reads=false" "H4 evidence_editable=false"
  "I1 event_logged=ok" "I2 events_readable=false" "J1 rate=truetruefalse"
  "K2 seller_keeps_thread=1" "K4 evidence_kept=1"
)
for e in "${expect[@]}"; do
  if [[ "$r" != *"$e"* ]]; then echo "  ✗ expected: $e"; fail=1; fi
done
if [[ "$r" == *"ERASE_FAILED"* ]]; then echo "  ✗ erasure failed"; fail=1; fi
[[ $fail -eq 0 ]] && echo "  ✓ all ${#expect[@]} expected results"

echo "== audit regression test"
r="$(result_of "$HERE/audit_regressions.sql")"
echo "$r"
if [[ "$r" != ALL_PASSED* ]]; then fail=1; fi

exit $fail
