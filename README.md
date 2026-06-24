# Gram Panchayat WhatsApp Document Bot 🏛

A complete WhatsApp chatbot system for gram panchayats that allows villagers to retrieve official documents through a conversational interface. Authenticated users can request password-protected PDFs delivered directly via WhatsApp.

---

## 🏗 Architecture

```
WhatsApp → Twilio → /webhook/whatsapp → Conversation Flow
                                              ↓
                              Session Manager (In-memory + Supabase)
                                              ↓
                              Auth Service (Mobile → Name → Aadhaar)
                                              ↓
                              Google Drive → PDF Service → Twilio → WhatsApp
```

**Stack:**
| Layer         | Technology                              |
|---------------|-----------------------------------------|
| Bot API       | Node.js + Express.js                    |
| Database      | Supabase (PostgreSQL)                   |
| Sessions      | In-memory + Supabase `bot_sessions`     |
| Cloud Storage | Google Drive API (Service Account)      |
| PDF           | pdf-lib (cover page + metadata)         |
| WhatsApp      | Twilio WhatsApp Business API            |
| Admin UI      | Next.js 15 + Tailwind CSS               |
| Deployment    | Docker + Nginx                          |

---

## 📂 Project Structure

```
GramPanchayatAutomation/
├── backend/                    # Express.js bot + API
│   ├── src/
│   │   ├── config/             # Supabase, Twilio clients
│   │   ├── controllers/        # Conversation flow state machine
│   │   ├── routes/             # webhook, auth, citizens, analytics
│   │   ├── services/           # session, auth, drive, pdf
│   │   ├── utils/              # encryption, validators, fuzzyMatch
│   │   └── server.js           # Entry point
│   ├── .env                    # Environment variables
│   └── Dockerfile
├── dashboard/                  # Next.js admin dashboard
│   └── src/app/
│       ├── login/              # Login page
│       └── dashboard/          # Protected admin pages
│           ├── page.tsx        # Overview
│           ├── citizens/       # Citizen management
│           ├── analytics/      # Charts & stats
│           ├── audit/          # Transaction logs
│           ├── blocked/        # Blocked numbers
│           ├── documents/      # Upload documents
│           └── settings/       # Configuration
├── nginx/                      # Reverse proxy config
├── docker-compose.yml
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Supabase account (already provisioned → `kkbaddxfvtfiyzcfwpaw`)
- Twilio account with WhatsApp Business sandbox
- Google Cloud project with Drive API enabled (optional for testing)

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in your Twilio + Google Drive credentials in .env
npm run dev
```

Server starts at **http://localhost:3000**

### 2. Dashboard Setup

```bash
cd dashboard
npm install
npm run dev
```

Dashboard at **http://localhost:3001** (Next.js default port 3000 is taken by backend — run on 3001)

> Update `dashboard/package.json` scripts to add `-p 3001` if needed.

### 3. Create First Admin

```bash
curl -X POST http://localhost:3000/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@panchayat.gov.in","password":"Admin@123","fullName":"Admin User"}'
```

### 4. Configure Twilio Webhook

In your Twilio Console:
```
Webhook URL: https://your-domain.com/webhook/whatsapp
HTTP Method: POST
```

For local testing use [ngrok](https://ngrok.com/):
```bash
ngrok http 3000
# Set your ngrok URL in Twilio Console
```

---

## 🤖 Bot Conversation Flow

```
User sends any message
        ↓
Step 1: Enter mobile number (10-digit Indian)
        ↓
Step 2: Enter full name (fuzzy matched, 75%+ similarity)
        ↓
Step 3: Enter 12-digit Aadhaar number
        ↓
Step 4: Select document from list (Google Drive)
        ↓
Step 5: PDF delivered (password = DOB in DDMMYYYY)
        ↓
Step 6: "Another document?" → Yes/No
```

**Security:**
- Max 3 attempts before 30-minute block
- Aadhaar encrypted with AES-256 at rest
- Only last 4 digits logged
- Twilio signature validation in production

---

## 🗃 Database Tables (Supabase)

| Table              | Purpose                                      |
|--------------------|----------------------------------------------|
| `citizens`         | Registered citizen records (Aadhaar encrypted) |
| `admin_users`      | Dashboard admin accounts                     |
| `bot_sessions`     | Active conversation sessions                 |
| `transaction_logs` | Full audit trail of document requests        |
| `failed_attempts`  | Failed auth tracking + block state           |
| `panchayat_config` | Bot message templates + settings             |

**Sample citizens pre-loaded:**
| Mobile     | Name               | Aadhaar (last4) | DOB        |
|------------|--------------------|-----------------|------------|
| 9876543210 | Ramesh Kumar Verma | 9012            | 1985-06-15 |
| 8765432109 | Sunita Devi Sharma | 0123            | 1990-03-22 |
| 7654321098 | Mohan Lal Gupta    | 1234            | 1978-11-08 |

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable                          | Description                        |
|-----------------------------------|------------------------------------|
| `SUPABASE_URL`                    | Supabase project URL               |
| `SUPABASE_SERVICE_ROLE_KEY`       | Service role key (bypasses RLS)    |
| `TWILIO_ACCOUNT_SID`              | Twilio Account SID                 |
| `TWILIO_AUTH_TOKEN`               | Twilio Auth Token                  |
| `TWILIO_WHATSAPP_NUMBER`          | `whatsapp:+14155238886` (sandbox)  |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` | Service account email           |
| `GOOGLE_DRIVE_PRIVATE_KEY`        | RSA private key (replace `\n`)     |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID`     | Root folder ID in Drive            |
| `JWT_SECRET`                      | Admin JWT signing secret           |
| `ENCRYPTION_KEY`                  | 32-char AES key for Aadhaar        |

---

## 🐳 Docker Deployment

```bash
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f backend

# Stop
docker-compose down
```

---

## 📡 API Endpoints

### Webhook
| Method | Endpoint                 | Description              |
|--------|--------------------------|--------------------------|
| POST   | `/webhook/whatsapp`      | Twilio incoming messages |
| GET    | `/webhook/whatsapp/health` | Health check           |

### Admin Auth
| Method | Endpoint           | Description                |
|--------|--------------------|----------------------------|
| POST   | `/api/auth/setup`  | Create first super admin   |
| POST   | `/api/auth/login`  | Admin login → JWT token    |
| GET    | `/api/auth/me`     | Get current admin info     |

### Citizens
| Method | Endpoint                      | Description            |
|--------|-------------------------------|------------------------|
| GET    | `/api/citizens`               | List (paginated+search)|
| POST   | `/api/citizens`               | Create citizen         |
| GET    | `/api/citizens/:id`           | Get single citizen     |
| PUT    | `/api/citizens/:id`           | Update citizen         |
| DELETE | `/api/citizens/:id`           | Deactivate citizen     |
| POST   | `/api/citizens/bulk-upload`   | CSV bulk import        |

### Analytics
| Method | Endpoint                           | Description          |
|--------|------------------------------------|----------------------|
| GET    | `/api/analytics/overview`          | Dashboard stats      |
| GET    | `/api/analytics/daily-trend`       | N-day trend          |
| GET    | `/api/analytics/popular-documents` | Top docs             |
| GET    | `/api/analytics/transactions`      | Audit log (filtered) |
| GET    | `/api/analytics/blocked-numbers`   | Currently blocked    |
| DELETE | `/api/analytics/blocked/:number`   | Unblock a number     |

---

## 🔒 Security Features

- **AES-256-CBC** encryption for Aadhaar numbers at rest
- **Fuzzy name matching** with 75% Levenshtein similarity threshold
- **Rate limiting** — 300 req/15min globally, 20 req/15min for auth
- **Twilio signature validation** in production mode
- **JWT authentication** for all Admin API routes
- **Soft deletes** — citizens are deactivated, never hard-deleted
- **Parameterised queries** via Supabase SDK (SQL injection safe)
- **Aadhaar masking** in all logs (`XXXX XXXX 9012`)

---

## 📅 Phase 2 Roadmap

- [ ] OTP via SMS as additional verification factor
- [ ] Hindi / regional language support (i18n)
- [ ] Voice message support (speech-to-text Aadhaar input)
- [ ] Proactive notifications (new document available)
- [ ] Bulk ZIP download of all documents
- [ ] UPI payment integration for certificate fees
- [ ] Appointment booking system

---

## ⚖️ Legal & Compliance

- Follow **UIDAI guidelines** for Aadhaar storage and masking
- Comply with **IT Act 2000** and applicable data protection laws
- Maintain **90-day** transaction log retention (configurable)
- Citizens may request data deletion under Right to be Forgotten
- Obtain **written consent** before enrolling citizens

---

## 📞 Support

For gram panchayat staff assistance:
- Check `/dashboard/audit` for transaction details
- Check `/dashboard/blocked` to unblock users
- Restart sessions by asking the citizen to send **"Hi"**

---

*Built by INNOCREW | Gram Panchayat Digital Document Service v1.0*
