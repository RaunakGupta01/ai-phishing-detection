# features.py
import re
import tldextract

def url_to_features(url: str):
    ext = tldextract.extract(url)
    domain = f"{ext.domain}.{ext.suffix}" if ext.suffix else ext.domain
    path = url.split(domain, 1)[-1] if domain else url
    return {
        "len": len(url),
        "num_digits": sum(ch.isdigit() for ch in url),
        "num_specials": sum(ch in "-_?=&%." for ch in url),
        "num_subdomains": len([s for s in ext.subdomain.split(".") if s]) if ext.subdomain else 0,
        "has_ip": 1 if re.search(r"(?:\d{1,3}\.){3}\d{1,3}", url) else 0,
        "https": 1 if url.lower().startswith("https") else 0,
        "path_len": len(path),
        "has_at": 1 if "@" in url else 0
    }

def batch_features(urls):
    return [url_to_features(u) for u in urls]
