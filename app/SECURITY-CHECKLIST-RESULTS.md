# The eighteen-item security pass — v2.11.7

Each item checked against the project rather than assumed. **Three were real and
are fixed. Two of my own checks were wrong and are recorded as such. The rest
were already in place, and saying so is the point of the exercise** — a list of
eighteen "fixes" where only three things were broken would be theatre.

---

## Real, and fixed

### 1. The public deletion page showed a receipt for nothing

`web/delete-account.html` is the page Google Play requires so somebody can ask
for deletion **without reinstalling the app**, and the page a data subject uses
to exercise a right under PDPL Art. 16.

On submit it hid the form and displayed:

> ✓ **Request received** — We'll email you to confirm it's really you, then
> delete your account within 30 days.

The handler built a payload, `console.log`'d it, and threw it away. No server
received it. No email went out. Nothing was scheduled. The `fetch` was commented
out with a `// WIRE THIS UP` note above it.

That is this project's oldest defect — a control that only looks like a control
— sitting on the one page that exists for a legal right.

**Fixed honestly rather than plausibly.** There is no server to post to and no
SMTP configured, so the page now composes the request in her own mail client
with the details filled in, and says exactly that: *"Your email app should have
opened — the request reaches us when you press send."* It also points at the
faster route: in-app deletion works today and is immediate. Verified in a real
browser — form submits, mail client is invoked, confirmation text matches what
actually happened.

### 2. That page had no security policy, and would have got one wrong

It will be hosted publicly, possibly on a server nobody has configured. It now
carries its own CSP (`default-src 'none'`, no remote anything), `no-referrer`
and `noindex`.

My first version also declared `frame-ancestors`, which **a browser ignores in a
`<meta>` tag and logs an error for**. Caught by loading the page and reading the
console. It is removed from the meta and documented in the file as a header the
host must send, along with HSTS, `nosniff` and a `Permissions-Policy`.

### 3. Two staff-only functions were reachable without signing in

`lili_case_transcript` — which returns a captured conversation transcript —
and `lili_invite_code` both had `EXECUTE` granted to `anon`.

Not exploitable: the transcript function checks `lili_is_moderator()`, which
reads a JWT claim no anonymous caller can hold, and it writes an audit row on
every read. But a moderator-only endpoint answering at `/rest/v1/rpc/` without
authentication is surplus surface, and the next person to edit that guard should
not find an unauthenticated path waiting behind their mistake. Revoked.

`lili_redeem_invite` is deliberately **left** anon-callable: it replies
`{ok:false, reason:'sign_in_required'}` and the compliance screen turns that
into a sentence she can act on. Revoking it would replace that with a bare 403
the UI has no case for.

### Also: three dead packages

`@testing-library/dom`, `@testing-library/react` and `axe-core` were declared and
imported nowhere — there are no vitest tests and `axe-core` arrives transitively
through `@axe-core/playwright`. Removed, along with a `vitest.config.js` that
contained no vitest configuration and referenced a package that was never
installed. `@capacitor/cli` looked unused by the same scan and is not — it
provides the `cap` binary four npm scripts call.

---

## Two checks of mine that were wrong

Recorded because a wrong check is worse than no check.

**"`lili_shops` has no uniqueness on the owner."** It does —
`lili_shops_owner_uniq`. I surveyed `pg_constraint`, which does not list a unique
**index** created without a constraint, read the empty result as an absent rule,
and added a second weaker index saying the same thing. A probe caught it
immediately: my index refused the duplicate, and then the pre-existing one
refused a *closed* second shop my partial index would have allowed. Dropped.
Two indexes expressing one rule is worse than one.

**"Stale bundles are shipping in the APK."** `dist/assets/` holds three
`index-*.js` files and only one is the entry, so it looked like old builds
accumulating. They are live lazy-loaded chunks from `index.js` barrel modules,
all rebuilt with the same timestamp and both referenced by the entry chunk.
`dist` is emptied on every build. No finding.

---

## Already in place — verified, not assumed

| Item | State |
|---|---|
| **Secrets in the tree** | None. The only `sb_secret_` hit in the shipped bundle is supabase-js's own key-prefix test. No `.env` files exist. `.gitignore` covers keystores; there is no git repo to scan. |
| **API keys hidden** | The publishable key is *designed* to be public — access is decided by RLS. The service-role key is in no file, no bundle and no test; suites read it from the environment or report themselves unchecked. |
| **Password hashing** | We never store or hash a password. Supabase Auth does. The only thing we do with one is a breach check against HaveIBeenPwned using k-anonymity — SHA-1, first five characters of the hash only — and the screen says so to the user. |
| **XSS** | Zero `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `eval` or `new Function` in the entire source. React escapes by default. |
| **Form sanitising** | Nothing is interpolated into HTML; inputs are validated at the edge and again by CHECK constraints and RLS `with check` in the database. |
| **Security headers / CSP (app)** | `script-src 'self'` with no `unsafe-inline` and no `unsafe-eval`, `object-src 'none'`, `form-action 'none'`, `base-uri 'self'`, and an explicit `connect-src` allowlist naming the Supabase project and the breach API. |
| **Rate limiting** | Triggers on the five write surfaces that matter — items, messages, offers, conversations, moderation cases — plus `lili_rate_ok`, used inside `lili_redeem_invite` and placed *after* the cheap checks so a lockout cannot be probed for information about a code. Follows, saves and blocks are bounded by composite primary keys; push tokens by a unique `(user_id, token)`. |
| **User access / DB access** | All 22 lili tables have RLS enabled. Four carry zero policies — `lili_attempts`, `lili_audit`, `lili_case_evidence`, `lili_invites` — which is deny-all by design for server-only tables, and proved by a refused write rather than an empty read. |
| **Admin routes** | Every `admin_*` and `lili_moderation_*` function is closed to `anon` and guarded internally by `is_admin()` or `lili_is_moderator()`. The moderator claim lives in JWT `app_metadata`, which only the server can set. |
| **Authentication** | Email/password and Google through Supabase Auth. Sessions are not persisted by the test clients. The open item is not a weakness but a switch: anonymous sign-in is off, which `preflight` still blocks on. |
| **Dependencies** | **Zero vulnerabilities in production dependencies.** Four advisories (1 moderate, 3 high) are all dev-only — `vite`, `esbuild`, `playwright`, `@xmldom/xmldom` — and none ship in the APK. Left at current majors rather than force-upgraded, because a breaking bump to the toolchain trades a risk that cannot reach a user for one that can reach the build. |
| **Debug mode** | No debug flags, no `__DEV__`, no dev-server references. React is the production build — zero dev-build markers. Sourcemaps off; no `.map` files ship. The only logging in our own code is two `console.info` lines reporting backend state, with no personal data. |
| **Env variables** | There are none, and that is the design: configuration is a checked-in file holding a key that is meant to be public. |
| **Exposed files** | `dist` contains the app, `public/polyfills.js`, and nothing else. `web/` holds only the deletion page. |
| **CORS** | Not ours to set and not meaningful here. The app is a Capacitor WebView on `capacitor://localhost` calling Supabase directly; CORS on that API is Supabase's, and the control that matters is RLS, which decides per row what the key can reach. The only page we host is static and calls nothing. |

---

## What still matters more than any of the above

Anonymous sign-in is off, so nobody can create an account to sell. There are
zero live listings. And the data-controller boundary between this app and the
other product sharing its database is enforced in code but described in no
paperwork — that one is for counsel.
