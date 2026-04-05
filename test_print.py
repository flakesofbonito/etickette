import urllib.request
import json

payload = json.dumps({
    "number": "C-01",
    "dept":   "cashier",
    "qr_link": "https://etickette.web.app/tracker/?t=TEST-001&d=cashier",
    "userId": "02000385394",
    "reason": "Pay Tuition / Fees",
    "type":   "Walk-in"
}).encode("utf-8")

req = urllib.request.Request(
    "http://localhost:8000/print",
    data    = payload,
    headers = {"Content-Type": "application/json"},
    method  = "POST"
)

with urllib.request.urlopen(req) as res:
    print(res.read().decode())