"""Operator-only isolated test accounts. Credentials never printed or committed."""
import json,secrets,urllib.request,urllib.error,subprocess,os
from pathlib import Path
from setup_env import token
env=dict(l.split('=',1) for l in Path('.env').read_text().splitlines() if '=' in l)
admin=token(env['JWT_SECRET'],'service_role')
def req(path,body,tok=None):
    headers={'Content-Type':'application/json'}
    if tok:headers['Authorization']='Bearer '+tok
    with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:55433'+path,data=json.dumps(body).encode(),headers=headers),timeout=30) as r:return json.load(r)
assert not Path('test-accounts.json').exists(),'Do not overwrite existing accounts'
accounts={}
for kind in ('owner','viewer','outsider'):
    email=kind+'@lipidomic-pilot.invalid';pw=secrets.token_urlsafe(25)
    user=req('/admin/users',{'email':email,'password':pw,'email_confirm':True},admin)
    login=req('/token?grant_type=password',{'email':email,'password':pw})
    assert login['user']['id']==user['id']
    accounts[kind]={'email':email,'password':pw,'id':user['id']}
    if kind!='outsider':
        import uuid
        uid=str(uuid.UUID(user['id']))
        sql=f"INSERT INTO public.pilot_members VALUES('10000000-0000-4000-8000-000000000001','{uid}','{kind}');"
        subprocess.run(['docker','compose','-p','lipidomic-pilot','-f','compose.yml','exec','-T','db','psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=sql.encode(),check=True,stdout=subprocess.DEVNULL)
fd=os.open('test-accounts.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump(accounts,f)
print('Three individual accounts created and password sign-in verified; credentials kept private.')
