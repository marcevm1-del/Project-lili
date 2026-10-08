// ─────────────────────────────────────────────────────────────────────────────
//  BACKEND CONFIG — live
//
//  Project:  MVM.Corp / yjsmkjwvoolsszsedony
//  Schema:   lili   (NOT public — this project already runs another app whose
//                    public schema owns tables named follows, reports, blocks
//                    and notifications. lili has its own schema so the two
//                    cannot collide.)
//
//  The publishable key is not a secret. It identifies the project; it grants
//  nothing. Access is decided by the row-level policies in the database, which
//  is why it is safe to ship in a client bundle. A service-role key never is,
//  and must never appear in this file.
// ─────────────────────────────────────────────────────────────────────────────
export default {
  url: "https://yjsmkjwvoolsszsedony.supabase.co",
  publishableKey: "sb_publishable_zMez4WfCgn5JB0NGIp2p6A_oP1R2_-P",
  schema: "public",   // tables are prefixed lili_* — see BACKEND-STATUS.md
};
