# Pawvana backend (Node · Express · MongoDB)

API for the Pawvana pet-store mobile app (`pawvana-app`). Adapted from the EcoBazar backend so it matches
exactly what the app sends and expects — **no changes to the app are needed**.

## Run
```bash
npm install
# edit .env  (MONGODB_URL is already set; set ACCESS_TOKEN_SECRET and PUBLIC_API_URL)
npm run dev        # nodemon   (npm start = plain node)
```
`PUBLIC_API_URL` must be the address the **phone** uses (same value as `EXPO_PUBLIC_API_URL` in the app),
e.g. `http://192.168.0.100:5000`. Open it in the phone's browser — you should see `{"ok":true,"name":"Pawvana API"}`.
Atlas → Network Access must allow your IP.

## What changed (all the points from the app's README)
| Area | Before | Now |
|---|---|---|
| Brand | EcoBazar (SKU `Eco-…`, emails, texts) | Pawvana (SKU `PAW-…`, emails in the app's green) |
| Database | old cluster | your Atlas cluster, database name `pawvana` |
| Discounts | `/payment` charged full price | prices come from the DB with the discount rules the app uses (`utils/pricing.js`) |
| Shipping | any number trusted | only the app's fees (`SHIPPING_FEES` in `config/settings.js`: 60 / 120) |
| Stock | never checked at checkout / reduced | checked before payment, reduced once after a verified payment |
| Order status | always `pending` | `approved` / `reject`, set from aamarPay's verified result |
| Payment return | same URL for everything | `/payment/success|fail|cancel` records the result, then redirects to `/order-success?pay_status=success|failed|cancelled` (the app's WebView reads this). Cart is emptied on success. Pending orders are also re-checked when "My orders" opens |
| Password hashes | leaked by `/allusers`, `/cart/:userId`, `/search` | removed everywhere |
| Email links | `http://localhost:5173/...` | https link that opens the app (`pawvana://verifyemail/<token>`, `pawvana://resetpassword/<token>`); the raw deep link is also shown for "I have the link" |
| Tokens | login returned none | login returns a JWT (`token`); verify / reset / login tokens can't be swapped (`purpose`) |
| Missing `await` | `cart/create`, `/category` answered before saving | fixed (the app's short wait is now harmless) |
| Validation bugs | `empty field` check sent a reply then kept running; `percentage` vs `percent`; crash when `deleteImage` missing; image index bugs | fixed |
| Bulk Excel | failed (no `slug`) | slug / sku / defaults generated, row errors reported |
| Other | `/get-single-slug-product/:slug` failed for products without a slug | falls back to the `_id` (what the app sends) |
| Email credentials | hard-coded Gmail password in `utils/email.js` | `SMTP_USER` / `SMTP_PASS` in `.env` (empty = links are printed in the console) |

## Things you must do
1. **Rotate the MongoDB password** (it was pasted into a chat) and the old Gmail app password (it was in the uploaded code), then update `.env`.
2. Put a long random `ACCESS_TOKEN_SECRET` in `.env`.
3. For email: create a Gmail app password and fill `SMTP_USER` / `SMTP_PASS`.

## Route protection (ENFORCE_AUTH)
Login already returns a token and every admin/cart/order route is wired to `protect(...)`, but enforcement is **off**
(`ENFORCE_AUTH=false`) because the current app does not send the token yet — turning it on now would give the app
"Unauthorized" everywhere. Until then, anyone who knows the URLs can call admin endpoints, so don't expose this
server publicly. To switch it on, add this to `src/lib/api.js` in the app (after `const http = axios.create(...)`):
```js
import { storage } from './storage';
http.interceptors.request.use(async (cfg) => {
  const u = await storage.get('user');
  if (u?.token) cfg.headers.Authorization = `Bearer ${u.token}`;
  return cfg;
});
```
then set `ENFORCE_AUTH=true`. Roles: admin/editor/vendor manage products & categories; admin manages customers;
customers can only read/change their own cart, orders and profile.

## Not tested here
Checked with syntax checks, unit tests of pricing/slug, and a boot test of the routes that don't need a database.
I could not reach MongoDB Atlas or aamarPay from my environment, so registration → login → cart → payment with a real
database and the aamarPay sandbox still needs a test run on your side (aamarPay's verification call is
`/api/v1/trxcheck/request.php` — if your account returns a different field than `pay_status`, adjust `reconcile()` in
`controllers/paymentController.js`).
The old EcoBazar product photos were not carried over (`uploads/` starts empty).
