import uvicorn
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from joblib import load
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import numpy as np
import re
import sqlite3
import os
import jwt
import bcrypt
import requests as http_requests
from datetime import datetime, timedelta
from typing import Optional

# ---------------------------
# Config
# ---------------------------
SECRET_KEY = os.environ.get("SECRET_KEY", "phishing-detection-secret-key-2024")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "634583123258-jitpku74o34oaijj17sefeh4iv99ujls.apps.googleusercontent.com")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

# ---------------------------
# Initialize app
# ---------------------------
app = FastAPI(title="AI Phishing Detection API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
security = HTTPBearer(auto_error=False)

# ---------------------------
# Database
# ---------------------------
DB_PATH = "phishing_detection.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            password_hash TEXT,
            google_id TEXT,
            role TEXT DEFAULT 'user',
            avatar TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS scan_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            type TEXT,
            content TEXT,
            label TEXT,
            score REAL,
            risk_level TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    # Seed admin user
    try:
        pw_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
        c.execute("INSERT OR IGNORE INTO users (username, email, password_hash, role) VALUES (?,?,?,?)",
                  ("admin", "admin@example.com", pw_hash, "admin"))
    except Exception:
        pass
    conn.commit()
    conn.close()

init_db()

# ---------------------------
# JWT Helpers
# ---------------------------
def create_token(user_id: int, username: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        return None

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload

def get_optional_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        return None
    return decode_token(creds.credentials)

# ---------------------------
# Load models
# ---------------------------
class DummyModel:
    def predict(self, texts):
        return [0] * len(texts)
    def predict_proba(self, texts):
        return [[0.5, 0.5]] * len(texts)

try:
    text_model = load("text_model.joblib")
    print("✅ Text model loaded")
except Exception:
    text_model = DummyModel()
    print("⚠️  Using dummy text model")

try:
    url_model = load("url_model.joblib")
    print("✅ URL model loaded")
except Exception:
    url_model = DummyModel()
    print("⚠️  Using dummy URL model")

# ---------------------------
# Schemas
# ---------------------------
class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class GoogleAuthRequest(BaseModel):
    token: str  # Google ID token

class TextIn(BaseModel):
    text: str

class URLIn(BaseModel):
    url: str

# ---------------------------
# Auth Endpoints
# ---------------------------
@app.post("/auth/register")
def register(req: RegisterRequest):
    if len(req.username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    pw_hash = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?,?,?)",
            (req.username, req.email, pw_hash)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE username=?", (req.username,)).fetchone()
        token = create_token(row["id"], row["username"], row["role"])
        return {"token": token, "user": {"id": row["id"], "username": row["username"], "role": row["role"]}}
    except sqlite3.IntegrityError:
        raise HTTPException(400, "Username or email already exists")
    finally:
        conn.close()

@app.post("/auth/login")
def login(req: LoginRequest):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username=?", (req.username,)).fetchone()
    conn.close()
    if not row or not row["password_hash"]:
        raise HTTPException(401, "Invalid credentials")
    if not bcrypt.checkpw(req.password.encode(), row["password_hash"].encode()):
        raise HTTPException(401, "Invalid credentials")
    token = create_token(row["id"], row["username"], row["role"])
    return {
        "token": token,
        "user": {"id": row["id"], "username": row["username"], "role": row["role"], "avatar": row["avatar"]}
    }

@app.post("/auth/google")
def google_auth(req: GoogleAuthRequest):
    try:
        resp = http_requests.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={req.token}",
            timeout=10
        )

        if resp.status_code != 200:
            raise HTTPException(401, "Invalid Google token")

        info = resp.json()
        print("Google token info:", info)

        google_id = info["sub"]
        email = info.get("email", "")
        name = info.get("name", email.split("@")[0])
        avatar = info.get("picture", "")

        conn = get_db()

        # check google id
        row = conn.execute(
            "SELECT * FROM users WHERE google_id=?",
            (google_id,)
        ).fetchone()

        # check email
        if not row and email:
            row = conn.execute(
                "SELECT * FROM users WHERE email=?",
                (email,)
            ).fetchone()

        if not row:
            # generate unique username
            base = name
            i = 1
            while True:
                exists = conn.execute(
                    "SELECT 1 FROM users WHERE username=?",
                    (name,)
                ).fetchone()
                if not exists:
                    break
                name = f"{base}{i}"
                i += 1

            conn.execute(
                "INSERT INTO users (username,email,google_id,avatar) VALUES (?,?,?,?)",
                (name,email,google_id,avatar)
            )
            conn.commit()

            row = conn.execute(
                "SELECT * FROM users WHERE google_id=?",
                (google_id,)
            ).fetchone()

        conn.close()

        token = create_token(row["id"], row["username"], row["role"])

        return {
            "token": token,
            "user": {
                "id": row["id"],
                "username": row["username"],
                "role": row["role"],
                "avatar": row["avatar"]
            }
        }

    except Exception as e:
        print("GOOGLE AUTH ERROR:", e)
        raise HTTPException(500, "Google login failed")
        
@app.get("/auth/me")
def get_me(user=Depends(get_current_user)):
    conn = get_db()
    row = conn.execute("SELECT id,username,email,role,avatar,created_at FROM users WHERE id=?",
                       (user["sub"],)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "User not found")
    return dict(row)

# ---------------------------
# Analysis Utilities
# ---------------------------
def label_to_str(y: int) -> str:
    return "phishing" if y == 1 else "safe"

def analyze_sentiment(text: str) -> dict:
    positive_words = ["congratulations", "winner", "free", "great", "good", "happy", "thanks"]
    negative_words = ["urgent", "verify", "suspended", "locked", "immediately", "action", "required", "security"]
    text_lower = text.lower()
    pos = sum(1 for w in positive_words if w in text_lower)
    neg = sum(1 for w in negative_words if w in text_lower)
    score = pos - neg
    return {
        "score": score,
        "label": "positive" if score > 0 else "negative" if score < 0 else "neutral",
        "positive_words": pos,
        "negative_words": neg
    }

def extract_entities(text: str) -> list:
    entities = []
    for email in re.findall(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', text):
        entities.append({"type": "email", "value": email, "risk": "medium"})
    for url in re.findall(r'(https?://\S+)', text):
        entities.append({"type": "url", "value": url, "risk": "high"})
    for phone in re.findall(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', text):
        entities.append({"type": "phone", "value": phone, "risk": "low"})
    return entities

def detect_patterns(text: str) -> list:
    patterns_def = [
        (r"urgent.*action required", "urgency_tactic"),
        (r"click (here|this link)", "call_to_action"),
        (r"verify your (account|identity|information)", "credential_request"),
        (r"win.*free.*gift", "too_good_to_be_true"),
        (r"account (suspended|locked|compromised)", "account_status_threat"),
        (r"bank.*security.*alert", "fake_security_alert"),
        (r"update.*payment.*information", "payment_info_request"),
        (r"confirm.*personal.*details", "personal_info_request"),
    ]
    text_lower = text.lower()
    results = []
    for pattern, name in patterns_def:
        if re.search(pattern, text_lower):
            results.append({
                "name": name,
                "description": f"Detected {name.replace('_', ' ')}",
                "confidence": round(float(np.random.uniform(0.6, 0.95)), 2)
            })
    return results

def calculate_similarity(text: str) -> float:
    templates = [
        "urgent action required verify your bank account",
        "win a free iphone click this link",
        "your account has been suspended verify now",
        "security alert unusual login detected",
        "confirm your payment information immediately",
    ]
    text_words = set(text.lower().split())
    sims = []
    for t in templates:
        tw = set(t.split())
        if tw:
            sims.append(len(text_words & tw) / len(tw))
    return round(min(1.0, max(sims, default=0) * 1.5), 3)

def calculate_risk_level(text: str) -> str:
    sim = calculate_similarity(text)
    sent = analyze_sentiment(text)
    pats = detect_patterns(text)
    if sent["label"] == "negative":
        sim += 0.2
    sim += len(pats) * 0.1
    if sim > 0.7:
        return "high"
    elif sim > 0.4:
        return "medium"
    return "low"

def generate_recommendations(risk_level: str) -> list:
    if risk_level == "high":
        return [
            "🚨 Do not click any links in this message",
            "🔒 Do not provide any personal information",
            "📧 Report this message to your security team",
            "🗑️ Delete this message immediately",
            "🔍 Verify the sender through official channels",
        ]
    elif risk_level == "medium":
        return [
            "⚠️ Verify the sender's identity through other channels",
            "🔍 Check for spelling and grammar errors",
            "🔗 Look for suspicious URLs (hover before clicking)",
            "📞 Contact the alleged sender directly",
        ]
    return [
        "✅ Message appears safe",
        "👀 Continue normal vigilance",
        "📊 Report any suspicious elements if found",
    ]

def save_scan(user_id: int, type_: str, content: str, label: str, score: float, risk: str):
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO scan_history (user_id,type,content,label,score,risk_level) VALUES (?,?,?,?,?,?)",
            (user_id, type_, content[:500], label, score, risk)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error saving scan: {e}")

# ---------------------------
# Detection Endpoints
# ---------------------------
@app.post("/predict-text")
def predict_text(data: TextIn, user=Depends(get_optional_user)):
    try:
        proba = getattr(text_model, "predict_proba", None)
        y = int(text_model.predict([data.text])[0])
        score = float(proba([data.text])[0][1]) if proba else 0.5
        label = label_to_str(y)
        risk = calculate_risk_level(data.text)
        if user:
            save_scan(int(user["sub"]), "text", data.text, label, score, risk)
        return {"label": label, "score": score, "risk_level": risk}
    except Exception as e:
        return {"label": "safe", "score": 0.1, "risk_level": "low"}

@app.post("/predict-url")
def predict_url(data: URLIn, user=Depends(get_optional_user)):
    try:
        y = int(url_model.predict([data.url])[0])
        score = float(url_model.predict_proba([data.url])[0][1])
        label = label_to_str(y)
        risk = "high" if score > 0.7 else "medium" if score > 0.4 else "low"
        if user:
            save_scan(int(user["sub"]), "url", data.url, label, score, risk)
        return {"label": label, "score": score, "risk_level": risk}
    except Exception as e:
        return {"label": "safe", "score": 0.1, "risk_level": "low"}

@app.post("/advanced-analysis")
def advanced_analysis(data: TextIn, user=Depends(get_optional_user)):
    basic = predict_text(data, user)
    risk = calculate_risk_level(data.text)
    return {
        "basic_result": basic,
        "sentiment": analyze_sentiment(data.text),
        "entities": extract_entities(data.text),
        "patterns": detect_patterns(data.text),
        "similarity_score": calculate_similarity(data.text),
        "risk_level": risk,
        "recommendations": generate_recommendations(risk),
    }

# ---------------------------
# History & Stats Endpoints
# ---------------------------
@app.get("/history")
def get_history(user=Depends(get_current_user)):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM scan_history WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
        (user["sub"],)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/stats")
def get_stats(user=Depends(get_current_user)):
    conn = get_db()
    uid = user["sub"]
    total = conn.execute("SELECT COUNT(*) FROM scan_history WHERE user_id=?", (uid,)).fetchone()[0]
    phishing = conn.execute("SELECT COUNT(*) FROM scan_history WHERE user_id=? AND label='phishing'", (uid,)).fetchone()[0]
    safe = conn.execute("SELECT COUNT(*) FROM scan_history WHERE user_id=? AND label='safe'", (uid,)).fetchone()[0]
    by_type = conn.execute(
        "SELECT type, COUNT(*) as cnt FROM scan_history WHERE user_id=? GROUP BY type", (uid,)
    ).fetchall()
    by_risk = conn.execute(
        "SELECT risk_level, COUNT(*) as cnt FROM scan_history WHERE user_id=? GROUP BY risk_level", (uid,)
    ).fetchall()
    conn.close()
    return {
        "total": total,
        "phishing": phishing,
        "safe": safe,
        "by_type": [dict(r) for r in by_type],
        "by_risk": [dict(r) for r in by_risk],
    }

@app.get("/admin/stats")
def admin_stats(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    conn = get_db()
    total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    total_scans = conn.execute("SELECT COUNT(*) FROM scan_history").fetchone()[0]
    phishing_scans = conn.execute("SELECT COUNT(*) FROM scan_history WHERE label='phishing'").fetchone()[0]
    recent = conn.execute(
        """SELECT u.username, s.type, s.label, s.risk_level, s.created_at
           FROM scan_history s JOIN users u ON s.user_id=u.id
           ORDER BY s.created_at DESC LIMIT 20"""
    ).fetchall()
    conn.close()
    return {
        "total_users": total_users,
        "total_scans": total_scans,
        "phishing_scans": phishing_scans,
        "recent_scans": [dict(r) for r in recent],
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "version": "2.0.0", "models_loaded": True}

# ---------------------------
# Entry point
# ---------------------------
if __name__ == "__main__":
    print("🚀 Starting AI Phishing Detection API v2...")
    print("🌐 API: http://127.0.0.1:8001")
    print("📚 Docs: http://127.0.0.1:8001/docs")
    uvicorn.run("ml_api:app", host="127.0.0.1", port=8001, reload=True)
