# DBCanvas — Authentication Flow

## Desktop App Login (Device Auth)

Follows the GitHub/Figma device authorization pattern. The user never types credentials in the Electron app.

```
┌─────────────┐        ┌─────────────┐        ┌─────────────┐
│  Desktop    │        │  Railway    │        │  Vercel     │
│  (Electron) │        │  (API)      │        │  (Website)  │
└──────┬──────┘        └──────┬──────┘        └──────┬──────┘
       │                      │                      │
       │ 1. POST /api/auth/   │                      │
       │    device/code        │                      │
       │─────────────────────►│                      │
       │                      │                      │
       │ {device_code,        │                      │
       │  user_code: "A3F2B1"}│                      │
       │◄─────────────────────│                      │
       │                      │                      │
       │ 2. Open browser ─────────────────────────► │
       │    /auth/device?code=A3F2B1                 │
       │                      │                      │
       │                      │   3. Auto-authorize  │
       │                      │   (if logged in)     │
       │                      │◄─────────────────────│
       │                      │   POST /api/auth/    │
       │                      │   device/authorize   │
       │                      │                      │
       │ 4. Poll every 3s     │                      │
       │    POST /api/auth/   │                      │
       │    device/poll        │                      │
       │─────────────────────►│                      │
       │                      │                      │
       │ {token, user, license}│                     │
       │◄─────────────────────│                      │
       │                      │                      │
       │ 5. Save session      │                      │
       │    ~/.dbcanvas_session.json                  │
       │    + localStorage    │                      │
```

### Key Design Decisions

- **Desktop opens Vercel website** (not Railway API) for the auth page
- **Auto-authorize**: Website reads `?code=` from URL and authorizes immediately if user is logged in — no manual code entry needed (Postman-style UX)
- **If not logged in**: Redirects to OAuth login, preserving the `?code=` param, then auto-authorizes after login
- **Session persistence**: Saved to disk (`~/.dbcanvas_session.json`) via IPC and to Electron localStorage
- **Session check on startup**: App validates session via IPC before showing dashboard or login screen

## Website Login (OAuth)

```
User clicks "Login with GitHub/Google"
  → Redirect to /api/auth/github (or /google) on Railway
  → OAuth provider flow
  → Callback to Railway
  → Railway generates JWT
  → Redirect to Vercel: /auth/callback?token=xxx&provider=github
  → Website stores token in localStorage
```

## Session State Management

### Desktop (Electron)
- **Disk**: `~/.dbcanvas_session.json` — persistent across app restarts
- **IPC**: `dbcanvas:auth-get-session`, `dbcanvas:auth-start-login`, `dbcanvas:auth-poll`, `dbcanvas:auth-logout`
- **Renderer**: Zustand store `session` field + localStorage fallback
- **Preload**: `window.dbcanvas.getSession()`, `.startLogin()`, `.pollAuth()`, `.logout()`

### Website
- **localStorage**: JWT token stored after OAuth callback
- **API calls**: Token sent as `Authorization: Bearer xxx` header

## Logout

- Desktop: Clears `~/.dbcanvas_session.json` + localStorage + Zustand store
- Website: Clears localStorage token
