#!/usr/bin/env node
/**
 * Simple MITM proxy to capture Tinder X-Auth-Token from iOS app.
 *
 * Alternative (easier): Use Proxyman app on your Mac (free trial).
 * 1. Install Proxyman: brew install --cask proxyman
 * 2. Open Proxyman → enable iOS device setup (it guides you)
 * 3. Open Tinder on iPhone → Proxyman captures X-Auth-Token
 */
console.log(`
=== Easiest way to get your Tinder token from iOS ===

Option A: Proxyman (recommended, 2 minutes)
  1. Install:  brew install --cask proxyman
  2. Open Proxyman on your Mac
  3. Menu → Certificate → Install on iOS → follow the QR code steps
  4. Open Tinder on your iPhone (swipe around)
  5. In Proxyman, find any request to api.gotinder.com
  6. Look for "X-Auth-Token" in the request headers
  7. Copy that token → paste into Rizz Master "Use token instead"

Option B: Charles Proxy (similar to Proxyman)

Option C: Manual from Tinder Web (if you can log in via Google/Facebook)
  1. Open tinder.com in Safari/Chrome on your Mac
  2. Log in with Google or Facebook (no SMS needed)
  3. DevTools (F12) → Network → find api.gotinder.com request
  4. Copy X-Auth-Token header value

Option D: Wait for SMS rate limit reset (few hours)
  Then retry OTP on Rizz Master with Belgian number
`);
