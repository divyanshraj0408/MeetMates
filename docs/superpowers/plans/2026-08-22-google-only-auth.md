# Google-Only Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Pingo to everyone by making Google the only way in — removing password signup/signin and the ADGIPS ID-card flow — and fix the defects in the Google path that is now the sole entry point.

**Architecture:** The Google handler's decision logic is extracted into a pure `buildUserFieldsFromGooglePayload`, so the four defects can be unit-tested without a live token; `verifyIdToken` stays at the edge. Chat display names come from the Google profile name, carried in the JWT and cached on the socket. The login page collapses to branding plus the Google button, keeping the video toggle that currently lives inside the doomed password form.

**Tech Stack:** Node.js, Express, Mongoose, `google-auth-library`, `jsonwebtoken`, React 19 (Vite). Backend tests `node:test`, frontend tests `vitest`.

**Spec:** [../specs/2026-08-22-google-only-auth-design.md](../specs/2026-08-22-google-only-auth-design.md)

**Branch:** `main` is currently 1 commit ahead of `origin/main`. Branch before starting. Each task commits. **Do not push.**

---

## File Structure

**Backend**
- Modify `backend/routes/auth.js` — delete `/signup`, `/login`, `isValidEmailOrUserID`; extract and use `buildUserFieldsFromGooglePayload`; add `name` to the JWT.
- Create `backend/googleIdentity.js` — the pure payload-to-fields function.
- Create `backend/googleIdentity.test.js` — `node:test` for it.
- Delete `backend/routes/imageAuth.js`, `backend/config/auth.js`.
- Modify `backend/server.js` — drop the imageAuth mount.
- Modify `backend/models/User.js` — password optional, drop bcrypt hook and `comparePassword`.
- Modify `backend/socketIdentity.js` — cache `socket.userName`; `displayNameFor(socket)`.
- Modify `backend/globalchat.js` — three `displayNameFor` call sites.
- Modify `backend/moderation.js` — generalise the policy's opening line.
- Modify `backend/package.json` — drop `tesseract.js`, `multer`, `bcrypt`.

**Frontend**
- Modify `frontend/src/components/Login.jsx` — collapse to Google only, keep the video toggle, fix the stale-closure capture.
- Modify `frontend/src/components/HomePage.jsx` — drop the ADGIPS line.
- Modify `frontend/src/App.jsx` — `collegeEmail` → `userEmail` with a fallback read.
- Modify `README.md`.

---

## Task 1: Pure Google payload handling (TDD)

**Files:**
- Create: `backend/googleIdentity.js`
- Create: `backend/googleIdentity.test.js`

All four Google defects live in logic that is currently tangled with network calls. Extracting it makes them testable.

- [ ] **Step 1: Write the failing tests**

Create `backend/googleIdentity.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { buildUserFieldsFromGooglePayload } = require("./googleIdentity");

const payload = (over = {}) => ({
  email: "someone@gmail.com",
  email_verified: true,
  name: "Divyansh Raj",
  picture: "https://example.com/p.png",
  sub: "google-123",
  ...over,
});

test("accepts a verified Google account and returns the fields to persist", () => {
  const r = buildUserFieldsFromGooglePayload(payload(), { withVideo: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.fields.email, "someone@gmail.com");
  assert.strictEqual(r.fields.googleId, "google-123");
  assert.strictEqual(r.fields.name, "Divyansh Raj");
  assert.strictEqual(r.fields.isGoogleUser, true);
});

test("normalizes the email, so case differences cannot create a second account", () => {
  const r = buildUserFieldsFromGooglePayload(
    payload({ email: "  SomeOne@GMAIL.com " }),
    { withVideo: true }
  );
  assert.strictEqual(r.fields.email, "someone@gmail.com");
});

test("rejects an unverified Google email", () => {
  const r = buildUserFieldsFromGooglePayload(
    payload({ email_verified: false }),
    { withVideo: true }
  );
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /not verified/i);
});

test("rejects a payload with no email", () => {
  const r = buildUserFieldsFromGooglePayload(payload({ email: "" }), {});
  assert.strictEqual(r.ok, false);
});

test("preserves withVideo:false instead of forcing video on", () => {
  // `withVideo || true` is always true. This is the regression guard.
  const r = buildUserFieldsFromGooglePayload(payload(), { withVideo: false });
  assert.strictEqual(r.fields.withVideo, false);
});

test("defaults withVideo to true when the client omits it", () => {
  const r = buildUserFieldsFromGooglePayload(payload(), {});
  assert.strictEqual(r.fields.withVideo, true);
});

test("never returns a password field", () => {
  const r = buildUserFieldsFromGooglePayload(payload(), { withVideo: true });
  assert.strictEqual("password" in r.fields, false);
});

test("tolerates a missing name and picture", () => {
  const r = buildUserFieldsFromGooglePayload(
    payload({ name: undefined, picture: undefined }),
    {}
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.fields.name, "");
  assert.strictEqual(r.fields.profilePicture, "");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './googleIdentity'`.

- [ ] **Step 3: Write the implementation**

Create `backend/googleIdentity.js`:

```js
// googleIdentity.js - turn a verified Google ID-token payload into the fields
// we persist. Kept free of network and database calls so the rules below are
// testable; token verification stays in the route.

/**
 * @param {object} payload  the decoded Google ID token payload
 * @param {object} options  { withVideo } from the client request
 * @returns {{ok:true, fields:object} | {ok:false, reason:string}}
 */
function buildUserFieldsFromGooglePayload(payload = {}, options = {}) {
  // The password path normalized; this one did not, so a payload differing
  // only in case created a second account for the same person.
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "Email not provided by Google" };

  // Google sends email_verified false for some federated Workspace accounts.
  // Only an explicit false is a rejection; absent is treated as verified,
  // since Google omits it on some legacy payloads.
  if (payload.email_verified === false) {
    return { ok: false, reason: "This Google account's email is not verified" };
  }

  return {
    ok: true,
    fields: {
      email,
      name: payload.name || "",
      googleId: payload.sub,
      profilePicture: payload.picture || "",
      isGoogleUser: true,
      isVerified: true,
      // ?? not ||: `withVideo || true` is always true, so opting out of video
      // never took effect.
      withVideo: options.withVideo ?? true,
    },
  };
}

module.exports = { buildUserFieldsFromGooglePayload };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npm test`
Expected: 52 tests pass (44 existing + 8 new).

- [ ] **Step 5: Commit**

```bash
git add backend/googleIdentity.js backend/googleIdentity.test.js
git commit -m "feat: extract and test Google payload handling"
```

---

## Task 2: Rewrite the auth routes

**Files:**
- Modify: `backend/routes/auth.js`

- [ ] **Step 1: Delete the password routes and the domain gate**

In `backend/routes/auth.js`, delete:

1. The whole `function isValidEmailOrUserID(input) { ... }`.
2. The whole `router.post("/signup", ...)` handler.
3. The whole `router.post("/login", ...)` handler.
4. The `normalize` helper.

Note a deviation from the spec here. The spec said `normalize` would be kept
because the Google route would start using it. Extracting
`buildUserFieldsFromGooglePayload` changed that: normalization now lives inside
that module, next to the rule that needs it, so the helper in `auth.js` has no
caller left. Deleting it is better than keeping a duplicate.

- [ ] **Step 2: Use the extracted builder in the Google route**

Add to the requires at the top of the file:

```js
const { buildUserFieldsFromGooglePayload } = require("../googleIdentity.js");
```

In `router.post('/google-login', ...)`, replace everything from

```js
    const payload = ticket.getPayload();
```

down to and including the closing of the `else { ... }` block that creates the
new user, with:

```js
    const payload = ticket.getPayload();

    const built = buildUserFieldsFromGooglePayload(payload, { withVideo });
    if (!built.ok) {
      return res.status(400).json({ error: built.reason });
    }
    const fields = built.fields;

    let user = await User.findOne({
      $or: [{ email: fields.email }, { googleId: fields.googleId }],
    });

    if (user) {
      // Linking an existing account. isGoogleUser was previously left false
      // here, which contradicts the model's own password-required rule.
      if (!user.googleId) {
        user.googleId = fields.googleId;
        user.name = user.name || fields.name;
        user.profilePicture = user.profilePicture || fields.profilePicture;
        user.isGoogleUser = true;
        await user.save();
      }
    } else {
      user = new User(fields);
      await user.save();
    }
```

- [ ] **Step 3: Carry the display name in the JWT**

In the same handler, change the `jwt.sign` payload from:

```js
      {
        userId: user._id,
        email: user.email,
        isGoogleUser: user.isGoogleUser
      },
```

to:

```js
      {
        userId: user._id,
        email: user.email,
        name: user.name || "",
        isGoogleUser: user.isGoogleUser,
      },
```

- [ ] **Step 4: Verify the removals**

Run: `cd backend && grep -n "isValidEmailOrUserID\|adgitmdelhi\|normalize\|router.post(\"/signup\"\|router.post(\"/login\"" routes/auth.js`
Expected: NO output.

Run: `cd backend && grep -n "router.post" routes/auth.js`
Expected: only the `/google-login` route.

- [ ] **Step 5: Verify tests and boot**

Run: `cd backend && npm test`
Expected: 52 tests pass.

Run: `cd backend && PORT=39999 node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 500)"`
Expected: prints `Server running on port 39999` then `booted`.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/auth.js
git commit -m "feat: Google is the only auth route"
```

---

## Task 3: Delete the ID-card flow and dead gate

**Files:**
- Delete: `backend/routes/imageAuth.js`, `backend/config/auth.js`
- Modify: `backend/server.js`, `backend/models/User.js`, `backend/package.json`

- [ ] **Step 1: Confirm nothing else imports what is being removed**

Run: `cd backend && grep -rn "tesseract\|multer\|bcrypt\|imageAuth\|config/auth" --include='*.js' . | grep -v node_modules`

Expected hits only in: `routes/imageAuth.js`, `models/User.js` (bcrypt), and
`server.js` (the imageAuth require and mount). If anything else appears, STOP
and report rather than removing a live dependency.

- [ ] **Step 2: Delete the files**

```bash
git rm backend/routes/imageAuth.js backend/config/auth.js
```

`config/auth.js` holds a second `verifyCollegeEmail` gate that nothing imports —
already dead before this change.

- [ ] **Step 3: Unmount the route**

In `backend/server.js`, delete both of these lines:

```js
const imageAuthRoute = require("./routes/imageAuth.js");
```

```js
app.use("/api/auth", imageAuthRoute);
```

- [ ] **Step 4: Strip password machinery from the model**

In `backend/models/User.js`:

1. Delete the `const bcrypt = require("bcrypt");` line.
2. Replace the `password` field definition:

```js
  password: {
    type: String,
    required: function() {
      // Password is required only if user is not a Google user
      return !this.isGoogleUser;
    },
    minlength: 6
  },
```

with:

```js
  // Retained so documents created before Google-only auth stay readable.
  // Nothing writes it any more — there is no password login.
  password: {
    type: String,
  },
```

3. Delete the `userSchema.pre("save", ...)` hook that hashes the password, and
   the `userSchema.methods.comparePassword` method. Both lost their only caller
   with `/login` gone.

- [ ] **Step 5: Drop the dependencies**

```bash
cd backend && npm uninstall tesseract.js multer bcrypt
```

- [ ] **Step 6: Verify**

Run: `cd backend && grep -rn "bcrypt\|tesseract\|multer" --include='*.js' . | grep -v node_modules`
Expected: NO output.

Run: `cd backend && npm test`
Expected: 52 tests pass.

Run: `cd backend && PORT=39999 node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 500)"`
Expected: prints `Server running on port 39999` then `booted`.

- [ ] **Step 7: Commit**

```bash
git add -A backend
git commit -m "chore: remove the ID-card flow, dead college gate and password machinery"
```

---

## Task 4: Display names from the Google profile

**Files:**
- Modify: `backend/socketIdentity.js`
- Modify: `backend/globalchat.js`
- Modify: `backend/googleIdentity.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `backend/googleIdentity.test.js`:

```js
const { displayNameFor } = require("./socketIdentity");

test("displayNameFor uses the first word of the Google name", () => {
  assert.strictEqual(
    displayNameFor({ userName: "Divyansh Raj", userEmail: "d0408@gmail.com" }),
    "Divyansh"
  );
});

test("displayNameFor falls back to the email prefix with no name", () => {
  assert.strictEqual(
    displayNameFor({ userName: "", userEmail: "divyanshraj0408@gmail.com" }),
    "divyanshraj0408"
  );
});

test("displayNameFor tolerates a socket with neither", () => {
  assert.strictEqual(displayNameFor({}), "someone");
});

test("displayNameFor trims surrounding whitespace", () => {
  assert.strictEqual(displayNameFor({ userName: "  Aditi  Sharma " }), "Aditi");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test`
Expected: FAIL — `displayNameFor` still takes an email string, so these return the wrong values.

- [ ] **Step 3: Update socketIdentity.js**

In `backend/socketIdentity.js`, inside `lookupGlobalSender`, cache the name
alongside the email. Change the token branch from:

```js
  if (decoded.email) {
    socket.userEmail = decoded.email;
    return decoded.email;
  }
```

to:

```js
  if (decoded.email) {
    socket.userEmail = decoded.email;
    socket.userName = decoded.name || "";
    return decoded.email;
  }
```

and the database branch from:

```js
    const user = await User.findById(id).select("email");
    if (!user) return null;
    socket.userEmail = user.email;
    return user.email;
```

to:

```js
    const user = await User.findById(id).select("email name");
    if (!user) return null;
    socket.userEmail = user.email;
    socket.userName = user.name || "";
    return user.email;
```

Then replace `displayNameFor` entirely:

```js
// Takes the socket, not an email: the display name now comes from the Google
// profile, with the email prefix only as a fallback. An email handle carries a
// surname and digits, so the first name actually reveals less.
function displayNameFor(socket) {
  const name = String(socket?.userName || "").trim();
  if (name) return name.split(/\s+/)[0];

  const email = String(socket?.userEmail || "");
  return email.split("@")[0] || "someone";
}
```

- [ ] **Step 4: Update the three call sites**

In `backend/globalchat.js`, `displayNameFor(email)` appears three times. Change
each to `displayNameFor(socket)`.

Run: `cd backend && grep -n "displayNameFor" globalchat.js`
Expected: three lines, all reading `displayNameFor(socket)`.

- [ ] **Step 5: Run tests**

Run: `cd backend && npm test`
Expected: 56 tests pass (52 + 4 new).

- [ ] **Step 6: Commit**

```bash
git add backend/socketIdentity.js backend/globalchat.js backend/googleIdentity.test.js
git commit -m "feat: show the Google given name in chat"
```

---

## Task 5: Collapse the login page

**Files:**
- Modify: `frontend/src/components/Login.jsx`

Two things to preserve that are easy to lose: the **"Enable video chat" checkbox
currently sits inside the password form**, so deleting the form would remove the
only way to turn video off. And the Google callback is captured once when the
button renders, so it closes over the initial `withVideo` — toggling it later
has no effect today. A ref fixes that.

- [ ] **Step 1: Replace the whole file**

Replace `frontend/src/components/Login.jsx` with:

```jsx
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./login.css";
import { renderGoogleButton } from "../googleAuth.js";
import Navbar from "./Navbar.jsx";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function Login({
  onStart,
  setToken = () => {},
  goBack,
  doBackDisplay,
  doLoginDisplay,
}) {
  const [withVideo, setWithVideo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Google renders its button once and keeps the callback it was given, so a
  // callback closing over `withVideo` would be frozen at its initial value.
  // The ref is read at click time instead.
  const withVideoRef = useRef(withVideo);
  useEffect(() => {
    withVideoRef.current = withVideo;
  }, [withVideo]);

  const handleGoogleResponse = async (response) => {
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/auth/google-login`,
        {
          credential: response.credential,
          withVideo: withVideoRef.current,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const { token, user } = res.data;
      if (!token) {
        setError("Sign-in did not complete. Try again.");
        return;
      }

      localStorage.setItem("token", token);
      setToken(token);
      onStart(user.email, withVideoRef.current);
    } catch (err) {
      console.error("Google login error:", err);
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Could not reach the server. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return renderGoogleButton("google-signin-btn", CLIENT_ID, handleGoogleResponse);
    // Mounted once: the container is no longer conditionally rendered, and the
    // callback reads withVideo through a ref rather than a closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Navbar
        goBack={goBack}
        doBackDisplay={doBackDisplay}
        doLoginDisplay={doLoginDisplay}
      />
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Welcome to the party!</h1>
            <h2>Sign in to Pingo with Google</h2>
          </div>

          <div id="google-signin-btn" className="google-sdk-button" />

          {loading && <div className="loader" style={{ marginTop: "10px" }} />}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={withVideo}
              onChange={() => setWithVideo((on) => !on)}
              disabled={loading}
            />
            <span className="checkbox-text">Enable video chat</span>
          </label>
        </div>
      </div>
    </>
  );
}

export default Login;
```

Note the `Trash2` import from `lucide-react` is gone with the image preview that
used it.

- [ ] **Step 2: Add the error style**

Append to `frontend/src/components/login.css`:

```css
.login-error {
  margin-top: 12px;
  color: #d43f24;
  font-size: 0.9rem;
}
```

This replaces the `alert()` calls the old flows used.

- [ ] **Step 3: Verify the removals**

Run: `cd frontend && grep -n "isSignup\|postCardPassword\|generatedUserId\|image-login\|Trash2\|type=\"password\"" src/components/Login.jsx`
Expected: NO output.

Run: `cd frontend && grep -c "withVideo" src/components/Login.jsx`
Expected: a non-zero count — the video toggle must survive.

- [ ] **Step 4: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds, 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Login.jsx frontend/src/components/login.css
git commit -m "feat: login page is Google only"
```

---

## Task 6: Frontend copy and the storage key

**Files:**
- Modify: `frontend/src/components/HomePage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Drop the ADGIPS line**

In `frontend/src/components/HomePage.jsx`, the line has already been commented
out by hand and now reads:

```jsx
              {/* Made exclusive for ADGIPS */}
```

Delete that commented line outright rather than leaving dead markup, and put the
replacement text in its place:

```jsx
              Meet someone new
```

- [ ] **Step 2: Rename the storage key with a fallback**

In `frontend/src/App.jsx`, add this helper directly above the `function App()`
declaration:

```jsx
// The key was renamed from collegeEmail when Pingo stopped being college-only.
// Reading the old one keeps existing sessions signed in through the rename.
const EMAIL_KEY = "userEmail";
function readStoredEmail() {
  return (
    localStorage.getItem(EMAIL_KEY) ||
    localStorage.getItem("collegeEmail") ||
    ""
  );
}
function storeEmail(email) {
  localStorage.setItem(EMAIL_KEY, email);
  localStorage.removeItem("collegeEmail");
}
```

Then replace every read and write. There are seven sites:

- `localStorage.getItem("collegeEmail")` → `readStoredEmail()` (four sites)
- `localStorage.getItem("collegeEmail") || ""` → `readStoredEmail()` (one site)
- `localStorage.setItem("collegeEmail", email)` → `storeEmail(email)` (two sites)

- [ ] **Step 3: Verify**

Run: `cd frontend && grep -n "collegeEmail" src/App.jsx`
Expected: only the two lines inside `readStoredEmail` and `storeEmail`.

Run: `cd frontend && grep -rn "ADGIPS\|adgips" src`
Expected: NO output.

- [ ] **Step 4: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds, 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HomePage.jsx frontend/src/App.jsx
git commit -m "feat: drop college framing from the frontend"
```

---

## Task 7: Documentation and the moderation policy

**Files:**
- Modify: `README.md`
- Modify: `backend/moderation.js`

- [ ] **Step 1: Update the README**

In `README.md`, replace the description line:

```
### Pingo is a college-exclusive platform that allows students to connect via random video calls. By using their college email IDs for authentication, students can interact in a safe and verified environment, fostering new connections within the campus.  
```

with:

```
### Pingo is a platform for meeting new people over random video calls. Sign in with Google and you are matched with someone new, with a moderated public room alongside.  
```

Replace the first feature bullet:

```
1. **College Email Authentication** – Ensures only students from the college can join.  
```

with:

```
1. **Google Sign-In** – One-tap authentication; no passwords are stored.  
```

And in the architecture section, replace:

```
   Users sign in using Google OAuth restricted to college email domains. Their token is validated on the backend (`/api/verify-token`) before connecting to the Socket.IO server.
```

with:

```
   Users sign in with Google. The ID token is verified server-side against `GOOGLE_CLIENT_ID`, and the resulting JWT is validated on the backend (`/api/verify-token`) before connecting to the Socket.IO server.
```

- [ ] **Step 2: Generalise the moderation policy**

In `backend/moderation.js`, in `MODERATION_POLICY`, change the opening line:

```
You are a content moderation classifier for a college student chat room.
```

to:

```
You are a content moderation classifier for a public chat room where strangers meet.
```

Leave the six categories and the output format exactly as they are.

- [ ] **Step 3: Verify the policy still classifies correctly**

The policy string is what the classifier acts on, so a wording change needs a
live check. Create `backend/_policycheck.cjs`:

```js
require("dotenv").config();
const { moderateMessage } = require("./moderation.js");
const cases = [
  ["ALLOW", "hey, anyone around?"],
  ["ALLOW", "arre yaar bahut mushkil hai ye subject"],
  ["BLOCK", "meet me outside and I will hurt you badly"],
  ["BLOCK", "you are genuinely the most worthless person alive"],
  ["BLOCK", "her number is 9876543210, everyone spam her"],
];
(async () => {
  let wrong = 0;
  for (const [want, text] of cases) {
    const r = await moderateMessage(text);
    const got = r.ok ? "ALLOW" : "BLOCK";
    if (got !== want) wrong++;
    console.log(`${got === want ? "ok " : "MISS"} want=${want} got=${got} ${text}`);
  }
  console.log(wrong ? `${wrong} WRONG` : "all correct");
})();
```

Run: `cd backend && node _policycheck.cjs`
Expected: `all correct`. If any case flips, report it rather than proceeding —
the wording change altered classifier behaviour.

Then: `rm backend/_policycheck.cjs`

- [ ] **Step 4: Run the suite**

Run: `cd backend && npm test`
Expected: 56 tests pass.

- [ ] **Step 5: Commit**

```bash
git add README.md backend/moderation.js
git commit -m "docs: Pingo is open to everyone"
```

---

## Task 8: Manual end-to-end verification

No code. Start both servers: `cd backend && npm start`, and `cd frontend && npm run dev`.

- [ ] The login page shows branding, the Google button, and the video checkbox — **no email or password field anywhere**.
- [ ] Sign in with a Google account that has never used Pingo. A user is created and you reach the lobby.
- [ ] Sign out and sign in again with the same account. No duplicate user is created.
- [ ] Sign in with a **non-ADGIPS** Google account (any gmail.com). It is accepted.
- [ ] **Untick "Enable video chat" before signing in.** Confirm the session is text-only — this is the `?? true` fix and the stale-closure fix together, and it was broken two ways before.
- [ ] The public room shows a first name ("Divyansh"), not an email prefix.
- [ ] `curl -i -X POST http://localhost:3001/api/auth/login` returns 404.
- [ ] `curl -i -X POST http://localhost:3001/api/auth/signup` returns 404.
- [ ] `curl -i -X POST http://localhost:3001/api/auth/image-login` returns 404.
- [ ] With an existing session in localStorage under the old `collegeEmail` key, reload and confirm you stay signed in and the key is migrated to `userEmail`.
- [ ] Send a message in the public room and confirm moderation still blocks a word-list hit.
