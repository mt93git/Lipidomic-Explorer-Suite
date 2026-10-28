"""Operator-only renewal, retaining JWT signing key and database password."""
from pathlib import Path
import os
from setup_env import token
p=Path('.env');env=dict(x.split('=',1) for x in p.read_text().splitlines() if '=' in x)
for key,role in [('ANON_KEY','anon'),('SERVICE_KEY','service_role')]:env[key]=token(env['JWT_SECRET'],role,lifetime=365*86400)
tmp=p.with_suffix('.new');fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write(''.join(k+'='+v+'\n' for k,v in env.items()))
os.replace(tmp,p)
print('Infrastructure tokens renewed privately; user accounts and signing key unchanged.')
