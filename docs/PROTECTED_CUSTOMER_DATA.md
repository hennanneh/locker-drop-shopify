# LockerDrop — Protected Customer Data (PCD) access request

> Everything needed to complete the **Protected customer data access** request in the Partner
> Dashboard (Apps → LockerDrop → **API access** → *Protected customer data access* → Request
> access). Required before App Store submission because LockerDrop reads order + customer PII.

## Level to request
**Level 2 — Protected customer data + customer PII fields.** LockerDrop reads the specific
customer fields below (not just order-level data), so it needs the higher tier with a
per-field reason.

## Data we access + justification (paste each reason into the matching field)

| Data | Why LockerDrop needs it |
|------|-------------------------|
| **Orders** (line items, quantities, product refs) | Size each package against product dimensions to reserve the smallest locker that fits, and to fulfill the order on pickup. |
| **Customer name** | Shown to the merchant on the drop-off screen and included in the customer's pickup notifications so they can identify their order. |
| **Customer email** | Send the order confirmation and the secure drop-off/pickup links, plus "ready for pickup" reminders (via Resend). |
| **Customer phone** | Send SMS pickup notifications and reminders (via Twilio). Optional — only used if provided. |
| **Shipping address** | Find the nearest Harbor locker to the customer and confirm the order is within pickup range; determines whether LockerDrop is offered at checkout. |

> Keep reasons specific and tied to the app's core function — Shopify rejects vague or
> "future use" justifications.

## Data-protection requirements — LockerDrop's readiness

Shopify asks you to confirm you meet each requirement. Current status:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Encrypt data **in transit** | ✅ | All traffic over HTTPS (`app.lockerdrop.it`); Harbor/Shopify calls over TLS. |
| Encrypt sensitive data **at rest** | ✅ | Shopify access tokens encrypted AES-256-GCM (`enc:v1:` — S2-10). Confirm DB volume/PII handling meets your bar. |
| **Data minimization** | ✅ | Scopes trimmed 10→6 with per-scope justifications in `shopify.app.toml` (S3-6). Only the fields above are read. |
| Up-to-date **privacy policy** naming processors | ✅ | `public/privacy-policy.html` lists Shopify, Harbor, Twilio, Resend, DigitalOcean + links. |
| **Deletion / redaction** on request | ✅ | Mandatory compliance webhooks wired: `customers/redact`, `customers/data_request`, `shop/redact` (in `shopify.app.toml`, HMAC-verified). |
| **Incident response** process | ✅ | `docs/INCIDENT_RESPONSE_POLICY.md`. |
| **Least-privilege / limited staff access** | ⚠️ confirm | Confirm who has DB/server access and that it's limited; note it in the attestation. |
| **Retention limits** (don't keep data longer than needed) | ⚠️ confirm | Decide/state a retention window for completed-order PII; redaction webhook handles deletion requests. |
| No use of PCD **outside the app's function** (no selling/ads) | ✅ | Data is only used to route lockers + notify customers. |
| **Security/privacy contact** | ⚠️ fill in | Provide a monitored email for security reports. |

## Steps to submit
1. Partner Dashboard → **Apps → LockerDrop → API access**.
2. Under **Protected customer data access**, click **Request access**.
3. Select **customer data** + each **PII field** above (name, email, phone, address).
4. Paste the matching **reason** for each from the table above.
5. Work through the **data protection questionnaire**, confirming the requirements (see table).
6. Confirm the **compliance webhooks** are detected (they're already configured).
7. **Submit.** Approval is required before the app can be submitted for App Store review.

## Before submitting — fill these in
- [ ] Security/privacy contact email
- [ ] Retention window statement for completed-order PII
- [ ] Confirm least-privilege access to the DB/server
