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
    
    data    = request.json or {}
    dept    = data.get('dept', '').strip()
    number  = data.get('number', '').strip()
    qr_link = data.get('qr_link', '').strip()

    if not dept or not number or not qr_link:
        return jsonify({"status": "Error", "message": "Missing required fields: dept, number, qr_link"}), 400

    dev = get_printer()
    
    if not dev:
        return jsonify({"status": "Error", "message": "Printer not found"}), 500

    try:
        now    = datetime.now()
        dt_str = now.strftime("Date: %Y-%m-%d  Time: %I:%M%p")

        dev.write(1, b'\x1b\x40')
        dev.write(1, b'\x1b\x42\x02\x01')
        dev.write(1, b'\x1b\x61\x01')
        dev.write(1, b'\x1c\x70\x01\x00')

        dev.write(1,
            b'\x1b\x45\x01'
            b'DEPARTMENT: ' + dept.upper().encode() +
            b'\x1b\x45\x00\n'
        )

        dev.write(1,
            b'\x1d\x21\x33'
            b'#' + number.encode() + b'\n'
            b'\x1d\x21\x00'
        )

        dev.write(1, dt_str.encode() + b'\n')

        qr_link = data['qr_link']
        
        dev.write(1, b'\x1b\x5a\x00\x01\x04')
        dev.write(1,
            bytes([len(qr_link) % 256, len(qr_link) // 256]) +
            qr_link.encode() + b'\x0a'
        )

        dev.write(1, b'Scan to track digitally\n')
        dev.write(1, b'Please wait for your number\n')
        dev.write(1, b'on the lobby monitor.\n')
        dev.write(1, b'\x1b\x64\x02')

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

if __name__ == '__main__':
    print("[eTickette] Printer server running on http://localhost:8000")
    print("[eTickette] Kiosk available at http://localhost:8000/kiosk/")
    app.run(port=8000, debug=False)