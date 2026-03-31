# AI Phishing Shield — v2 (Enhanced)

An AI-powered phishing detection system with **Google Authentication**, interactive UI, charts, and persistent history.

---

## 🆕 What's New in v2

| Feature | v1 | v2 |
|---|---|---|
| Google Sign-In | ❌ | ✅ |
| JWT authentication | ❌ | ✅ |
| Password hashing | ❌ (plain text) | ✅ (bcrypt) |
| Persistent scan history | ❌ | ✅ (SQLite) |
| Statistics charts | ❌ | ✅ (Chart.js) |
| Dark mode | ❌ | ✅ |
| Admin dashboard | Basic | Full with live data |
| Mobile-friendly | Partial | ✅ Fully responsive |

---

## 📁 Project Structure

```
python-ml-enhanced/
├── ml_api.py            ← FastAPI backend (main server)
├── gateway.py           ← Optional API gateway
├── index.html           ← Frontend app
├── script.js            ← Frontend logic
├── styles.css           ← Styles + dark mode
├── features.py          ← ML feature helpers
├── train_text_model.py  ← Train the text classifier
├── train_url_model.py   ← Train the URL classifier
├── text_model.joblib    ← Trained text ML model
├── url_model.joblib     ← Trained URL ML model
├── phishing_detection.db ← SQLite database (auto-created)
├── models/              ← Model storage folder
└── requirements.txt     ← Python dependencies
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Python 3.10+ (recommended: 3.13)
- pip

### 2. Install Dependencies

```bash
# (Recommended) Create a virtual environment
python -m venv .venv

# Activate it:
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

# Install packages
pip install -r requirements.txt
```

### 3. Run the API Server

```bash
python ml_api.py
```

You should see:
```
🚀 Starting AI Phishing Detection API v2...
✅ Text model loaded
✅ URL model loaded
🌐 API: http://127.0.0.1:8001
📚 Docs: http://127.0.0.1:8001/docs
```

### 4. Open the Frontend

Open `index.html` directly in your browser — **no web server needed**.

> Or serve it with Python:
> ```bash
> python -m http.server 3000
> ```
> Then visit http://localhost:3000

### 5. Default Admin Login

| Username | Password |
|---|---|
| `admin` | `admin123` |

---

## 🔑 Google Authentication Setup

To enable "Sign in with Google":

### Step 1: Create a Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Create a new project (or select existing)
3. Navigate to **APIs & Services → Credentials**
4. Click **"+ Create Credentials"** → **OAuth 2.0 Client ID**

### Step 2: Configure OAuth Client

- **Application type**: Web application
- **Name**: AI Phishing Shield (or any name)
- **Authorized JavaScript origins**:
  - `http://localhost:3000`
  - `http://127.0.0.1:3000`
  - `null` (for file:// access — only during development)
- **Authorized redirect URIs**: (leave empty for ID token flow)

Click **Create** and copy your **Client ID** (looks like `1234567890-abc.apps.googleusercontent.com`).

### Step 3: Add Client ID to Your Files

**In `script.js`** (line 9):
```js
const GOOGLE_CLIENT_ID = "YOUR_ACTUAL_CLIENT_ID_HERE";
```

**In `ml_api.py`** (set environment variable OR edit line 15):
```python
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "YOUR_ACTUAL_CLIENT_ID_HERE")
```

Or set environment variable before starting:
```bash
# Windows
set GOOGLE_CLIENT_ID=your_client_id_here
python ml_api.py

# Mac/Linux
GOOGLE_CLIENT_ID=your_client_id_here python ml_api.py
```

### Step 4: Enable required Google APIs

In your Google Cloud project, enable:
- **Google Identity** (usually enabled by default)

That's it! The Google Sign-In button will now appear on the login page.

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/login` | No | Login + get JWT token |
| POST | `/auth/google` | No | Google OAuth login |
| GET | `/auth/me` | JWT | Get current user |
| POST | `/predict-text` | Optional | Scan text/email |
| POST | `/predict-url` | Optional | Scan URL |
| POST | `/advanced-analysis` | Optional | Deep multi-layer scan |
| GET | `/history` | JWT | User scan history |
| GET | `/stats` | JWT | User statistics |
| GET | `/admin/stats` | JWT+Admin | Admin dashboard stats |
| GET | `/health` | No | Health check |

Interactive API docs: http://127.0.0.1:8001/docs

---

## 🛡️ Security Notes

- Passwords are hashed with **bcrypt** (never stored plain text)
- Authentication uses **JWT tokens** (24-hour expiry)
- Google tokens are verified against Google's token info endpoint
- For production, set a strong `SECRET_KEY` environment variable:
  ```bash
  SECRET_KEY=my-super-secret-key-change-this python ml_api.py
  ```

---

## 🎨 Features Overview

### Detection
- **Text/Email scan** — ML classifier + risk scoring
- **URL scan** — URL-based ML model
- **Deep Analysis** — Sentiment analysis, entity extraction, pattern detection, recommendations

### UI
- Dark / Light mode toggle
- Animated background particles
- Password strength meter
- Character counter
- Scan history with filters (type, label, risk)
- Export history as CSV
- Interactive doughnut + bar charts for statistics

### Admin
- Total users, scans, detection rate
- Live recent activity feed across all users

---

## 🔄 Retraining Models (Optional)

```bash
python train_text_model.py
python train_url_model.py
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` |
| Google Sign-In button not showing | Check `GOOGLE_CLIENT_ID` is set correctly |
| CORS errors in browser | Ensure `ml_api.py` is running on port 8001 |
| Models not loading | Ensure `text_model.joblib` and `url_model.joblib` are in same folder as `ml_api.py` |
| Port 8001 already in use | Change port in `ml_api.py`: `uvicorn.run(..., port=8002)` |
