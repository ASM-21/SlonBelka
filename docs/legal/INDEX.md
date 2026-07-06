# Legal docs, index

User-facing (link these in the app):
- TERMS_OF_SERVICE.md
- PRIVACY_POLICY.md
- CONTENT_ATTRIBUTION.md

Internal only, don't publish or link in-app:
- DATA_BREACH_RESPONSE.md

## Where to wire these in

- Signup screen: required checkbox "I agree to the Terms and Privacy Policy" linking to both, blocking account creation until checked.
- Footer or Settings > Legal: links to all three user-facing docs.
- Settings > About > Licenses: renders CONTENT_ATTRIBUTION.md, satisfies the Wiktionary/Commons/Tatoeba attribution requirement.
- Checkout/upgrade screen: show plan price, billing frequency, and "renews automatically" text before payment, don't rely on the ToS clause alone.

## Suggested repo location

Drop this whole `legal/` folder at `docs/legal/` in the Slonbelka repo. If you want the ToS/Privacy Policy served as actual app routes (not just repo docs), convert to HTML/JSX and add a simple markdown renderer, or just paste the markdown into static pages under `frontend/src/pages/legal/`.

Still placeholders in all docs: `[YOUR NAME]`, `[DATE]`, `[SUPPORT EMAIL]`. Fill these before publishing.
