from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import datetime, socket, os

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, u"eTickette")])

try:
    local_ip = socket.gethostbyname(socket.gethostname())
except:
    local_ip = "127.0.0.1"

cert = (
    x509.CertificateBuilder()
    .subject_name(name)
    .issuer_name(name)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.datetime.utcnow())
    .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=3650))
    .add_extension(x509.SubjectAlternativeName([
        x509.DNSName(u"localhost"),
        x509.IPAddress(__import__('ipaddress').ip_address(local_ip)),
        x509.IPAddress(__import__('ipaddress').ip_address("127.0.0.1")),
    ]), critical=False)
    .sign(key, hashes.SHA256())
)

out = os.path.dirname(__file__)
with open(os.path.join(out, "key.pem"), "wb") as f:
    f.write(key.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()))
with open(os.path.join(out, "cert.pem"), "wb") as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))

print(f"Done — cert.pem and key.pem saved to {out}")
print(f"Tablet URL will be: https://{local_ip}:8000/kiosk/")
print("On the tablet, open that URL and accept the security warning once.")