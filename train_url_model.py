from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from sklearn.preprocessing import FunctionTransformer
from joblib import dump
from features import batch_features 

# Demo training data
urls = [
    "https://paypal.com/security",
    "http://192.168.1.10/login/verify",
    "https://secure.mybank.com/auth",
    "http://paypa1.com.verify-account.ru/login",
    "https://github.com/open-source/project",
    "http://free-gift.cards-winner.cn/claim?id=12345",
    "https://university.edu/notice/semester",
    "http://login.microsoft.com.verify-reset.pw/"
]
labels = [0,1,0,1,0,1,0,1]

Xtr, Xte, ytr, yte = train_test_split(urls, labels, test_size=0.25, random_state=42, stratify=labels)

pipe = Pipeline([
    ("feat", FunctionTransformer(batch_features, validate=False)),
    ("dict", DictVectorizer()),
    ("rf", RandomForestClassifier(n_estimators=150, random_state=42))
])

pipe.fit(Xtr, ytr)
print(classification_report(yte, pipe.predict(Xte)))

dump(pipe, "url_model.joblib")
print("✅ Saved models/url_model.joblib")
