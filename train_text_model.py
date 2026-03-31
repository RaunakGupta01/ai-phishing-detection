# quick demo trainer for text (email/SMS) model
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from joblib import dump

# tiny illustrative dataset – replace with your real corpora
texts = [
    "URGENT action required verify your bank account now",
    "Win a FREE iPhone click this link",
    "Your package has been shipped and will arrive tomorrow",
    "Meeting rescheduled to 3 pm please confirm",
    "Security alert: update your password immediately",
    "Lunch plan for today?",
    "Claim your lottery winnings here",
    "Invoice for April attached kindly review",
]
labels = [1,1,0,0,1,0,1,0]  # 1 = phishing/suspicious, 0 = safe/ham

Xtr, Xte, ytr, yte = train_test_split(texts, labels, test_size=0.25, random_state=42, stratify=labels)

pipe = Pipeline([
    ("tfidf", TfidfVectorizer(min_df=1, ngram_range=(1,2))),
    ("lr", LogisticRegression(max_iter=200))
])

pipe.fit(Xtr, ytr)
print(classification_report(yte, pipe.predict(Xte)))

dump(pipe, "text_model.joblib")
print("Saved text_model.joblib")