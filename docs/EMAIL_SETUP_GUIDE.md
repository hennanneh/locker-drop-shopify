# LockerDrop Email Template Setup Guide

This guide explains how to install the custom LockerDrop order confirmation email template in your Shopify store.

## What This Template Does

The LockerDrop order confirmation email replaces Shopify's default order confirmation. It:

- Shows a **locker pickup card** (location, address, pickup date) for LockerDrop orders
- Shows a **"How Locker Pickup Works"** section with numbered steps
- Displays the standard order summary, totals, and payment info for all orders
- **Gracefully handles both** LockerDrop pickup and regular shipping orders

For regular (non-LockerDrop) orders, the email looks like a normal order confirmation with shipping address.

## How Detection Works

The template detects LockerDrop orders using two methods (in priority order):

1. **Note attributes** (preferred): Reads the `LockerDrop Pickup` order attribute set during checkout
2. **Shipping line title** (fallback): Parses the carrier service title for backward compatibility

This means the template works with both new and legacy orders.

---

## Installation Steps

### Step 1: Copy the Template

Open the file `docs/email-template-order-confirmation.liquid` and copy the **entire contents**.

You can also find it on GitHub in your repository under `docs/email-template-order-confirmation.liquid`.

### Step 2: Open Shopify Notifications

1. Log in to your Shopify Admin
2. Go to **Settings** (bottom-left gear icon)
3. Click **Notifications**
4. Under **Order notifications**, click **Order confirmation**

### Step 3: Replace the Template

1. In the **Email body (HTML)** editor, select all existing content (`Ctrl+A` / `Cmd+A`)
2. Delete it
3. Paste the LockerDrop template you copied in Step 1
4. Click **Save**

### Step 4: Preview and Test

1. Click **Preview** to see how the email looks
2. Click **Send test notification** to send a test email to yourself
3. Verify:
   - The header shows your store name/logo
   - The order summary section renders correctly
   - The footer shows your store email

> **Note:** The LockerDrop pickup card will only appear on actual LockerDrop orders. Preview/test emails may not show it since they use sample data.

### Step 5: Test with a Real Order

Place a test order using LockerDrop shipping to verify:
- The purple pickup card appears with location and date
- The "How Locker Pickup Works" steps are shown
- The totals row says "Locker Pickup" instead of "Shipping"
- The Contact/Location section shows "Pickup Location" instead of "Ship To"

Then place a regular order to verify:
- No LockerDrop sections appear
- Standard shipping address is shown
- Everything looks like a normal order confirmation

---

## Template Sections

| Section | LockerDrop Orders | Regular Orders |
|---------|------------------|----------------|
| Header | Store logo/name | Store logo/name |
| Pickup Card | Purple card with location + date | Hidden |
| How It Works | 3-step guide + tip | Hidden |
| Order Summary | Line items with images | Line items with images |
| Totals | "Locker Pickup" label | "Shipping" label |
| Contact & Location | Pickup location | Ship-to address |
| Payment | Card/payment details | Card/payment details |
| CTA Button | "View Order Status" | "View Order Status" |
| Footer | Includes "Powered by LockerDrop" | Standard footer |

---

## Customization

### Colors

The template uses your store's `email_accent_color` for the header and buttons. The LockerDrop pickup card uses `#5c6ac4` (indigo). To change the pickup card color, find all instances of `#5c6ac4` in the template and replace them.

### Accent Colors Used

| Element | Color | Purpose |
|---------|-------|---------|
| `#5c6ac4` | Indigo | Pickup card background, step numbers, locker pickup label |
| `#7c8adb` | Light indigo | Pickup card divider |
| `#c7d2fe` | Pale indigo | Pickup card labels |
| `#e0e7ff` | Very pale indigo | Pickup card address text |
| `#fef3c7` | Amber | Tip box background |
| `#92400e` | Dark amber | Tip box text |

### Store Logo

The template automatically uses your store's email logo (`shop.email_logo_url`). If no logo is set, it displays your store name in white text.

To set your email logo: **Settings > Brand > Logo for emails**

---

## Troubleshooting

### LockerDrop section not appearing

- Verify the order was placed with LockerDrop shipping selected
- Check that the order has a `LockerDrop Pickup` note attribute (visible in order details under "Additional details")
- If using an older version without note attributes, ensure the shipping line title contains "LockerDrop"

### Pickup date is empty

- The pickup date comes from either the note attribute value or the shipping line title
- Ensure the carrier service is including the pickup date in its response

### Email looks broken in some email clients

- The template uses table-based layout for maximum email client compatibility
- All styles are inline (no `<style>` tag) for Gmail compatibility
- Tested patterns: Gmail, Apple Mail, Outlook. If issues persist, check that no custom CSS from your theme is interfering

---

## File Location

```
docs/
  email-template-order-confirmation.liquid   <-- The template (paste into Shopify)
  EMAIL_SETUP_GUIDE.md                       <-- This guide
```

The original template (before this update) is preserved at:
```
public/docs/shopify-order-confirmation-email.html
```
