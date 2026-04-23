// docs/PHONE_AUTH_SETUP.md
// Place this in your project root for reference.

# Phone Authentication Setup — Spup

Supabase supports phone OTP but requires an external SMS provider.
From your screenshot, the options are: Twilio, Messagebird, Textlocal, Vonage, Twilio Verify.

---

## Recommended provider for Nigeria: Twilio

Twilio has the best deliverability to Nigerian numbers (MTN, Airtel, Glo, 9Mobile).
Textlocal is UK-focused and has poor Nigerian delivery rates.
Vonage is a solid backup.

---

## Step-by-Step: Twilio + Supabase

### 1. Create a Twilio account
1. Go to https://www.twilio.com and sign up
2. Verify your own phone number during setup
3. Go to Console → Get a phone number (choose a US number — cheapest for SMS)
4. Note your: Account SID, Auth Token, Phone number (+1XXXXXXXXXX)

### 2. Enable Phone in Supabase
1. Supabase Dashboard → Authentication → Providers → Phone
2. Toggle "Enable Phone provider" ON
3. Set SMS provider to: **Twilio**
4. Fill in:
   - Account SID: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Auth Token: `your_auth_token`
   - Twilio phone number: `+1XXXXXXXXXX`
   - Message Service SID: leave blank (unless you create a messaging service)
5. Under "OTP" settings:
   - Enable phone confirmations: ON
   - SMS OTP expiry: 60 seconds (or 300 for 5 min — better UX)
6. Save

### 3. Test with your own number
In Supabase Dashboard → Authentication → Users → Invite user
Or use the Supabase JS client directly to test an OTP send.

### 4. Twilio trial limitations
On a free Twilio trial you can ONLY send SMS to numbers you've verified in the Twilio console.
To send to any Nigerian number: upgrade to a paid account (starts ~$15/month minimum).

### 5. SMS template (customize in Supabase)
Authentication → Settings → SMS OTP template:
```
Your Spup verification code is: {{ .Token }}
Valid for 5 minutes.
```

---

## Cost estimate for Nigeria

| Provider | Cost per SMS to Nigeria | Notes |
|----------|------------------------|-------|
| Twilio   | ~$0.035 (~₦55)        | Most reliable |
| Vonage   | ~$0.028 (~₦44)        | Good fallback |
| Textlocal| ~$0.04                | UK-focused, skip |

For 10,000 users signing up: ~$350 in SMS costs.
Consider enabling email as an alternative to reduce SMS spend.

---

## Alternative: Twilio Verify (shown in screenshot)

Twilio Verify is a higher-level product that handles OTP logic for you.
It costs $0.05 per verification but gives you:
- Automatic retry via WhatsApp if SMS fails (huge for Nigeria)
- Built-in fraud prevention
- Better delivery rates

To use it in Supabase: select "Twilio Verify" as the provider,
then use your Verify Service SID instead of the phone number.

**Recommendation: Use Twilio Verify for production.**

---

## Code side: nothing to change

The code in `src/lib/actions/auth.ts` already calls:
```ts
supabase.auth.signUp({ phone: e164Phone, password, options: { channel: 'sms' } })
supabase.auth.verifyOtp({ phone, token, type: 'sms' })
```
This works with whichever provider you configure in Supabase — no code changes needed.

---

## .env.local: nothing new needed

Twilio credentials go ONLY into Supabase Dashboard.
The Supabase server handles SMS on your behalf.
You never put Twilio credentials in your Next.js app.

---

## Testing locally without paying for SMS

In Supabase Dashboard → Authentication → Phone:
You can add "test phone numbers" with fixed OTPs.
e.g. Phone: +2348000000001 → OTP: 123456
These bypass SMS and are free. Use for development.