# Rizz Master

Analyze your dating app stats across **Tinder**, **Bumble**, and **Hinge** — running inside a Trusted Execution Environment (TEE) with hardware attestation.

Your credentials never leave the server. All computation happens inside an Intel TDX Confidential VM on [Phala Network](https://phala.network), with cryptographic proof via dstack attestation.

## How It Works

1. **Choose your platform** — Tinder, Bumble, or Hinge
2. **Authenticate** — Phone OTP or token paste
3. **View your stats** — Matches, conversations, reply rate, and Rizz Master evaluation
4. **TEE attestation** — Results are signed by the hardware enclave

### Rizz Master Criteria

| Criterion | Requirement |
|-----------|-------------|
| Total Matches | 40+ |
| Conversations Started | 18+ |
| Reply Rate | 35%+ |

Meet all three and you're certified as a **Rizz Master** with a TDX-attested proof.

## Architecture

```
rizz-master-v2/
├── packages/
│   ├── shared/          # Shared types, constants, evaluation logic
│   ├── web/             # Next.js 16 PWA (App Router)
│   └── mobile/          # React Native + Expo (WIP)
├── scripts/             # Token capture utilities
├── docker-compose.yml           # Local dev with TEE simulator
├── docker-compose.prod.yml      # Production with real TEE
└── docker-compose.phala.yml     # Phala Cloud deployment
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1 (App Router, Turbopack) |
| Frontend | React 19, TailwindCSS 4 |
| Sessions | iron-session (encrypted, httpOnly cookies) |
| HTTP Client | undici (proxy support) |
| Protocols | protobufjs (Tinder v3), MD5-signed JSON (Bumble/Badoo), Firebase Phone Auth (Hinge) |
| Browser Automation | puppeteer-core + Chromium (CAPTCHA handling) |
| TEE | @phala/dstack-sdk (Intel TDX attestation) |
| Container | Docker with Chromium + Xvfb |
| Deployment | Phala Cloud (dstack CVM) |

## Platform Auth Flows

### Tinder
- **v3 Protobuf OTP**: Phone → SMS code → Email code (if required) → Token
- Device fingerprinting with `persistent-device-id`, `app-session-id`, `install-id`, `funnel-session-id`
- Automatic v2 REST fallback if v3 fails
- Browser-based login via Puppeteer for CAPTCHA handling

### Bumble
- **Badoo protocol** via `bumble.com/mwebapi.phtml`
- MD5 signing with `X-Pingback` header
- Message types: `SERVER_APP_STARTUP` (2) → `SERVER_SUBMIT_PHONE_NUMBER` (678) → `SERVER_CHECK_PHONE_PIN` (680)
- Session cookie-based authentication

### Hinge
- **Firebase Phone Auth** with reCAPTCHA verification
- Flow: Register install → Solve reCAPTCHA → Firebase sends SMS → Verify OTP → Exchange JWT for Hinge Bearer token
- Firebase Identity Toolkit v1 API with Android package attestation headers
- Token paste supported as alternative

## Stats Collection

Each platform adapter fetches:

- **Profile** — User ID, name
- **Matches** — Full paginated match list with conversation metadata
- **Likes** — Count of people who liked you
- **Conversations** — Who started, reply detection, message counts

Reply rate is calculated using the `message_count` field on match objects (Tinder returns limited messages per match in the list endpoint).

## TEE Attestation

When deployed on Phala Cloud (dstack), the evaluation result is attested by the Intel TDX hardware:

```json
{
  "quote": "<tdx-attestation-quote>",
  "reportDataHex": "<sha256-of-evaluation>",
  "timestamp": "2026-03-18T..."
}
```

The attestation covers: user ID, platform, match count, conversations started, reply rate, and the Rizz Master verdict.

## Proxy Architecture

- **Residential proxy** (iproyal) for auth requests with country targeting based on phone number
- Sticky sessions with 30-minute TTL
- Automatic fallback to direct connection on proxy failure
- 197 country code mappings for geographic targeting

## Development

### Prerequisites

- Node.js 20+
- Docker (for TEE simulator and Chromium)

### Local Setup

```bash
# Install dependencies
npm install

# Start dev server with TEE simulator
docker compose up -d tappd-simulator
npm run dev --workspace=packages/web

# Open http://localhost:3069
```

### Build

```bash
npm run build --workspace=packages/web
```

### Docker Build

```bash
docker build -t rizz-master-v2 -f packages/web/Dockerfile --platform linux/amd64 .
```

## Deployment

### Phala Cloud (Production)

```bash
# Install Phala CLI
npm install -g @phala/cloud-cli

# Deploy
phala deploy -c docker-compose.phala.yml --wait

# Update
phala deploy --cvm-id <app-id> -c docker-compose.phala.yml --wait

# Check status
phala ps --cvm-id <app-id>

# View logs
phala logs --cvm-id <app-id> dstack-rizz-master-1 --stderr
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | Yes | 32+ char encryption key for iron-session |
| `PROXY_URL` | No | Residential proxy URL (`http://user:pass@host:port`) |
| `DSTACK_SIMULATOR_ENDPOINT` | No | TEE simulator URL (dev only) |
| `NODE_ENV` | No | `production` or `development` |

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/send-code` | Send OTP (phone, platform, recaptchaToken) |
| POST | `/api/auth/verify-code` | Verify OTP code |
| POST | `/api/auth/set-token` | Set token directly (paste) |
| GET | `/api/auth/status` | Check auth status |
| GET | `/api/auth/logout` | Clear session |

### Stats
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | Fetch platform stats + TEE attestation |

### Debug
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/debug/proxy` | Test proxy connectivity |
| GET | `/api/debug/matches` | Debug Tinder matches endpoint |

### Browser Auth (Tinder)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/browser/start` | Start Puppeteer session |
| GET | `/api/auth/browser/stream` | Stream CDP screencast |
| GET | `/api/auth/browser/screenshot` | Capture + extract token |
| POST | `/api/auth/browser/interact` | Click, type, scroll |

## Mobile Support

The `/api/stats` endpoint supports header-based auth for mobile clients:

```
Authorization: Bearer <token>
X-Platform: tinder|bumble|hinge
```

A React Native + Expo app is in `packages/mobile/` (WIP).

## Security

- **Encrypted sessions** — iron-session with httpOnly, secure, sameSite cookies
- **TEE isolation** — Credentials processed inside Intel TDX confidential VM
- **No data persistence** — Stats are fetched on-demand, never stored
- **Proxy anonymization** — Auth requests routed through residential proxy
- **Device fingerprinting** — Platform-appropriate device IDs per session

## License

Burnt - ZA
