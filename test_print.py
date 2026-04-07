import urllib.request
import urllib.error
import json
import ssl

payload = json.dumps({
    "number": "C-01",
    "dept":   "cashier",
    "qr_link": "https://etickette.web.app/tracker/?t=TEST-001&d=cashier",
    "userId": "02000385394",
    "reason": "Pay Tuition / Fees",
    "type":   "Walk-in"
}).encode("utf-8")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = urllib.request.Request(
    "https://localhost:8000/print",  
    data    = payload,
    headers = {"Content-Type": "application/json"},
    method  = "POST"
)

try:
    with urllib.request.urlopen(req, context=ctx) as res:
        print(res.read().decode())
except urllib.error.URLError as e:
    print(f"[ERROR] Could not connect: {e}")
    print("Make sure the eTickette server is running (start_etickette.bat)")