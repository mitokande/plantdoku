# Store Privacy Disclosures — Plantdoku

Fill-in answers for the App Store **App Privacy** questionnaire and Google Play
**Data Safety** form. These must match [privacy-policy.md](./privacy-policy.md)
and the app's actual behavior (PostHog anonymous analytics on the EU host;
all game progress stored on-device only; no ads, no IAP, no accounts).

Keep this in sync whenever you add an SDK (ads, IAP, crash reporting, etc.).

---

## What the app actually collects

| Data | Where it goes | Linked to identity? | Used for tracking? |
|---|---|---|---|
| Game progress (levels, times, stars, streaks) | **On device only** (AsyncStorage) — never transmitted | No | No |
| Gameplay events (level start/complete, time, hints, fails, screen views) | PostHog (EU) | No (anonymous) | No |
| Random app-generated analytics ID | PostHog (EU) | No | No |
| Device info (model, OS, app version, type, locale, time zone) | PostHog (EU) | No | No |
| IP address → coarse region (country/region) | PostHog (EU) | No | No |

**Not collected:** name, email, phone, contacts, photos, precise/GPS location,
health, financial info, advertising identifier (IDFA/AAID), user content.

Because we do **not** use the advertising identifier and do **not** track across
other apps/sites, **no App Tracking Transparency (ATT) prompt is required.**

---

## Apple — App Store Connect "App Privacy"

### Q: Do you or your third-party partners collect data from this app?
**Yes** (PostHog analytics).

### Data types to declare

| Category → Type | Collected | Linked to user | Used to track | Purpose |
|---|---|---|---|---|
| **Identifiers → Device ID** (random analytics ID; **not** IDFA) | Yes | **Not linked** | No | Analytics, App Functionality |
| **Usage Data → Product Interaction** | Yes | **Not linked** | No | Analytics |
| **Diagnostics → Performance Data** *(only if you later enable PostHog error/perf tracking)* | *No (today)* | — | — | — |
| **Location → Coarse Location** *(IP-derived region — see note)* | Optional | **Not linked** | No | Analytics |

**Tracking question:** Answer **"No, we do not use data for tracking."**
(No IDFA, no data brokers, no cross-app/site tracking.)

> **Coarse Location note:** PostHog derives an approximate country/region from
> the IP address. Two compliant options:
> 1. **Declare** "Coarse Location → Analytics → Not linked, not tracking" (kept
>    in the table above), **or**
> 2. **Disable IP geolocation** in PostHog (project settings, or send events
>    with geoip disabled) and then you may omit the Location declaration.
> Pick one and keep the policy + this sheet consistent.

---

## Google Play — Data Safety form

### Does your app collect or share any required user data types?
**Yes.**

### Data collected

| Category → Type | Collected | Shared | Processed ephemerally | Required/Optional | Purpose |
|---|---|---|---|---|---|
| **Device or other IDs** (random analytics ID) | Yes | No | No | Required | Analytics |
| **App activity → App interactions** (gameplay events, screens) | Yes | No | No | Required | Analytics |
| **App info & performance → Diagnostics** *(only if error/perf tracking is later enabled)* | *No (today)* | — | — | — | — |
| **Location → Approximate location** *(IP-derived; see Apple note above — declare only if you keep PostHog geoip on)* | Optional | No | No | Required | Analytics |

> **"Shared" = No:** PostHog acts as a **processor** on our behalf (we control
> the data), which Google classifies as **collected, not shared**. Do not tick
> "shared" for PostHog.

### Security practices
- **Is data encrypted in transit?** → **Yes** (HTTPS/TLS).
- **Can users request that data be deleted?** → **Yes** — in-app reset/flush
  data, and by emailing benmithat18@gmail.com. Provide the data-deletion contact
  / URL in the form.
- **Committed to Play Families Policy?** → Only if you target children; see the
  children's note in the policy. Otherwise set the content rating to a general
  audience.

---

## Listing requirements checklist (both stores)

- [ ] Host **privacy-policy.md** at a public HTTPS URL (see hosting note below)
      and paste that URL into:
  - App Store Connect → App Privacy → Privacy Policy URL
  - Google Play Console → Store listing → Privacy policy
- [ ] App Store: complete the **App Privacy** questions above; answer the
      **ATT/tracking** question as **No**.
- [ ] Google Play: complete the **Data Safety** form above and the **content
      rating** questionnaire (a logic puzzle with no objectionable content →
      Everyone / PEGI 3).
- [x] Export compliance: `app.json` already sets
      `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`, which is correct for
      an HTTPS/TLS-only app (standard encryption is exempt). No further action
      unless you add non-exempt crypto.
- [ ] If/when ads, IAP, or crash reporting are added, **update the policy and
      both forms** before that build ships.

---

## Hosting the policy (you need a public URL)

Both stores require a publicly reachable HTTPS URL. Easiest options:

- **GitHub Pages** — push `docs/` to a public repo and enable Pages
  (Settings → Pages → source `docs/`). The Markdown renders at
  `https://<user>.github.io/<repo>/privacy-policy`.
- **GitHub Gist / raw file** — quick but renders as plain text; acceptable but
  less polished.
- **Any static host** (Netlify, Vercel, Cloudflare Pages) pointed at `docs/`.

Use the same URL in both store listings and in the in-app "Privacy Policy" link
(recommended to add to the Settings screen).
