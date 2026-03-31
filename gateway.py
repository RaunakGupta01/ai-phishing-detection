from fastapi import FastAPI
from pydantic import BaseModel
import requests

app = FastAPI(title="Phishing Detection Gateway")

PY_BACKEND = "http://127.0.0.1:8001"

class TextRequest(BaseModel):
    text: str

class UrlRequest(BaseModel):
    url: str

@app.post("/api/predict-text")
def predict_text(req: TextRequest):
    resp = requests.post(f"{PY_BACKEND}/predict-text", json=req.dict())
    return resp.json()

@app.post("/api/predict-url")
def predict_url(req: UrlRequest):
    resp = requests.post(f"{PY_BACKEND}/predict-url", json=req.dict())
    return resp.json()

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "gateway": "running"}
