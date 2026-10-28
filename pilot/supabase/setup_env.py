"""Generate fresh pilot-only credentials locally; never print secrets."""
import base64, hashlib, hmac, json, os, secrets, time
from pathlib import Path

def token(secret, role, sub=None):
    def enc(v): return base64.urlsafe_b64encode(json.dumps(v,separators=(',',':')).encode()).rstrip(b'=').decode()
    payload={'role':role,'iss':'lipidomic-isolated-pilot','iat':int(time.time()),'exp':int(time.time())+86400}
    if sub: payload['sub']=sub
    data=enc({'alg':'HS256','typ':'JWT'})+'.'+enc(payload)
    return data+'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),data.encode(),hashlib.sha256).digest()).rstrip(b'=').decode()
if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--rest',default='55431');p.add_argument('--storage',default='55432');a=p.parse_args()
    target=Path('.env')
    if target.exists(): raise SystemExit('Refusing to overwrite credentials')
    secret=secrets.token_hex(32)
    env={'DB_PASSWORD':secrets.token_hex(24),'JWT_SECRET':secret,'ANON_KEY':token(secret,'anon'),'SERVICE_KEY':token(secret,'service_role'),'REST_PORT':a.rest,'STORAGE_PORT':a.storage}
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:f.write(''.join(k+'='+v+'\n' for k,v in env.items()))
    print('Generated isolated credentials (not displayed).')
