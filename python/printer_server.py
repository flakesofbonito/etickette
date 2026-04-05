from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime
import usb.core
import usb.util
import usb.backend.libusb1
import os

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

ID_VENDOR  = 0x0416
ID_PRODUCT = 0x5011

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBSITE_DIR = os.path.join(BASE_DIR, 'website')
KIOSK_DIR   = os.path.join(WEBSITE_DIR, 'kiosk')

def get_printer():
    dll_path = os.path.join(os.getcwd(), 'libusb-1.0.dll')
    backend  = usb.backend.libusb1.get_backend(find_library=lambda x: dll_path)
    dev      = usb.core.find(idVendor=ID_VENDOR, idProduct=ID_PRODUCT, backend=backend)

    if dev:
        try:
            if dev.is_kernel_driver_active(0):
                dev.detach_kernel_driver(0)
        except Exception:
            pass
        dev.set_configuration()
    return dev

@app.route('/')
def serve_index():
    return send_from_directory(KIOSK_DIR, 'index.html')

@app.route('/kiosk/')
def serve_kiosk_index():
    return send_from_directory(KIOSK_DIR, 'index.html')

@app.route('/kiosk/<path:path>')
def serve_kiosk(path):
    return send_from_directory(KIOSK_DIR, path)

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(WEBSITE_DIR, path)

@app.route('/print', methods=['POST', 'OPTIONS'])
def print_ticket():
    if request.method == 'OPTIONS':
        return '', 204

    data     = request.json or {}
    dept     = data.get('dept', '').strip()
    number   = data.get('number', '').strip()
    qr_link  = data.get('qr_link', '').strip()
    user_id  = data.get('userId', '—').strip()
    reason   = data.get('reason', '—').strip()
    tktype   = data.get('type', 'Walk-in').strip()

    if not dept or not number or not qr_link:
        return jsonify({"status": "Error", "message": "Missing required fields"}), 400

    dev = get_printer()
    if not dev:
        return jsonify({"status": "Error", "message": "Printer not found"}), 500

    try:
        now    = datetime.now()
        date_s = now.strftime("%Y-%m-%d")
        time_s = now.strftime("%I:%M %p")

        ESC_INIT    = b'\x1b\x40'
        CENTER      = b'\x1b\x61\x01'
        LEFT        = b'\x1b\x61\x00'
        BOLD_ON     = b'\x1b\x45\x01'
        BOLD_OFF    = b'\x1b\x45\x00'
        INVERT_ON   = b'\x1d\x42\x01'
        INVERT_OFF  = b'\x1d\x42\x00'
        SIZE_NORMAL = b'\x1d\x21\x00'
        SIZE_2X     = b'\x1d\x21\x11'
        FEED_2      = b'\x1b\x64\x02'
        DIV_SOLID   = b'================================\n'
        DIV_DASH    = b'--------------------------------\n'

        def padded(label, value, width=32):
            value = (value[:20] + '..') if len(value) > 22 else value
            gap   = width - len(label) - len(value)
            if gap < 1: gap = 1
            return (label + ' ' * gap + value + '\n').encode()

        dev.write(1, ESC_INIT)

        # Logo
        try:
            dev.write(1, CENTER)
            dev.write(1, b'\x1c\x70\x01\x00')
        except Exception:
            pass

        # Department
        dev.write(1, CENTER + BOLD_ON)
        dev.write(1, b'================================\n')
        dev.write(1, b'>> ' + dept.upper().encode() + b' <<\n')
        dev.write(1, b'================================\n')
        dev.write(1, BOLD_OFF)

        # Queue number
        dev.write(1, CENTER + SIZE_2X + BOLD_ON)
        dev.write(1, number.encode() + b'\n')
        dev.write(1, BOLD_OFF + SIZE_NORMAL)
        dev.write(1, DIV_SOLID)

        # Details
        dev.write(1, LEFT)
        dev.write(1, padded('ID  :', user_id))
        dev.write(1, padded('For :', reason))
        dev.write(1, padded('Date:', date_s + '  ' + time_s))
        dev.write(1, DIV_DASH)

        # QR
        dev.write(1, CENTER)
        dev.write(1, b'\x1b\x33\x18')
        dev.write(1, b'\x1b\x5a\x00\x01\x05')
        dev.write(1,
            bytes([len(qr_link) % 256, len(qr_link) // 256]) +
            qr_link.encode()
        )
        dev.write(1, b'\x1b\x33\x00')
        dev.write(1, b'Scan to track your queue live\n')
        dev.write(1, b'\x1b\x32')
        dev.write(1, DIV_DASH)

        # Footer
        dev.write(1, CENTER + BOLD_ON)
        dev.write(1, b'WAIT FOR YOUR NUMBER\n')
        dev.write(1, BOLD_OFF)
        dev.write(1, b'Watch the lobby monitor.\n')
        dev.write(1, b'Proceed when called.\n')
        dev.write(1, FEED_2)

        return jsonify({"status": "Success"})

    except Exception as e:
        print(f"[Print Error] {e}")
        return jsonify({"status": "Error", "message": str(e)}), 500

    finally:
        if dev is not None:
            usb.util.dispose_resources(dev)

@app.route('/health', methods=['GET', 'OPTIONS'])
def health():
    if request.method == 'OPTIONS':
        return '', 204
    dev = get_printer()
    printer_ok = dev is not None
    if dev: usb.util.dispose_resources(dev)
    return jsonify({
        "status": "ok",
        "printer": "connected" if printer_ok else "not found"
    })
    
@app.route('/setup')
def setup_page():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "127.0.0.1"

    tablet_url = f"http://{local_ip}:8000/kiosk/"

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>eTickette Tablet Setup</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *{{ box-sizing:border-box; margin:0; padding:0; }}
    body{{ font-family:'Plus Jakarta Sans',sans-serif; background:#0d1f4e;
          display:flex; align-items:center; justify-content:center;
          min-height:100vh; padding:24px; }}
    .card{{ background:#fff; border-radius:24px; padding:40px 48px;
            max-width:520px; width:100%; text-align:center;
            box-shadow:0 24px 80px rgba(0,0,0,.4); }}
    .badge{{ display:inline-block; background:#e3cf57; color:#0d1f4e;
             font-size:11px; font-weight:800; letter-spacing:1.5px;
             padding:5px 14px; border-radius:20px; margin-bottom:20px;
             text-transform:uppercase; }}
    h1{{ font-size:26px; font-weight:800; color:#1f3c88; margin-bottom:8px; }}
    p{{ font-size:14px; color:#64748b; margin-bottom:24px; line-height:1.6; }}
    .qr-wrap{{ background:#f1f5f9; border-radius:16px; padding:24px;
               display:inline-block; margin-bottom:20px;
               border:2px solid #e2e8f0; }}
    .url-box{{ background:#eff6ff; border:2px solid #bfdbfe;
               border-radius:12px; padding:14px 20px; margin-bottom:24px;
               font-size:17px; font-weight:700; color:#1d4ed8;
               word-break:break-all; }}
    .steps{{ text-align:left; background:#f8fafc; border-radius:12px;
             padding:18px 22px; border:1px solid #e2e8f0; }}
    .steps h3{{ font-size:12px; font-weight:800; letter-spacing:1px;
                text-transform:uppercase; color:#94a3b8; margin-bottom:12px; }}
    .step{{ display:flex; gap:12px; align-items:flex-start;
            margin-bottom:10px; font-size:14px; color:#334155; }}
    .step:last-child{{ margin-bottom:0; }}
    .num{{ width:24px; height:24px; background:#1f3c88; color:#e3cf57;
           border-radius:50%; display:flex; align-items:center;
           justify-content:center; font-size:11px; font-weight:800;
           flex-shrink:0; margin-top:1px; }}
    .status{{ display:flex; align-items:center; gap:8px; justify-content:center;
              margin-top:20px; font-size:13px; font-weight:600; color:#16a34a; }}
    .dot{{ width:8px; height:8px; border-radius:50%; background:#16a34a;
           animation:pulse 2s infinite; }}
    @keyframes pulse{{
      0%,100%{{ box-shadow:0 0 0 0 rgba(22,163,74,.4); }}
      50%{{ box-shadow:0 0 0 6px rgba(22,163,74,0); }}
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Tablet Setup</div>
    <h1>eTickette Kiosk</h1>
    <p>Scan the QR code below on your tablet,<br/>or type the URL into any browser.</p>

    <div class="qr-wrap">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data={tablet_url}&color=1f3c88"
           alt="Tablet QR Code" width="180" height="180" />
    </div>

    <div class="url-box">{tablet_url}</div>

    <div class="steps">
      <h3>How to Connect Tablet</h3>
      <div class="step">
        <div class="num">1</div>
        <span>Connect the tablet to the <strong>same WiFi</strong> as this laptop</span>
      </div>
      <div class="step">
        <div class="num">2</div>
        <span>Scan the QR code above or type the URL into Chrome / Safari</span>
      </div>
      <div class="step">
        <div class="num">3</div>
        <span>The kiosk will open — printing goes through this laptop automatically</span>
      </div>
      <div class="step">
        <div class="num">4</div>
        <span>Bookmark or add to home screen for one-tap launch next time</span>
      </div>
    </div>

    <div class="status">
      <div class="dot"></div>
      Server running — printer ready
    </div>
  </div>
</body>
</html>"""
    return html

if __name__ == '__main__':
    print("[eTickette] Printer server running on http://localhost:8000")
    print("[eTickette] Kiosk available at http://localhost:8000/kiosk/")
    app.run(host='0.0.0.0', port=8000, debug=False)
