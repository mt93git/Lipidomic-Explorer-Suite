import os,json,urllib.request,urllib.error,io,zipfile,hashlib
from pathlib import Path
accounts=json.loads(Path('test-accounts.json').read_text());checks=[]
def call(port,path,method='GET',body=None,tok=None,raw=False):
 port += int(os.getenv('PILOT_TEST_PORT_OFFSET','0'))
 h={'Content-Type':'application/json'}
 if tok:h['Authorization']='Bearer '+tok
 try:
  with urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}'+path,headers=h,data=None if body is None else json.dumps(body).encode(),method=method),timeout=30) as r:
   b=r.read();return r.status,b if raw else json.loads(b) if b else None
 except urllib.error.HTTPError as e:return e.code,None
def check(n,ok):
 checks.append({'test':n,'passed':bool(ok)});assert ok,n
tokens={}
for role,a in accounts.items():
 code,r=call(55433,'/token?grant_type=password','POST',{'email':a['email'],'password':a['password']});check(role+' real password sign-in',code==200);tokens[role]=r
check('Invalid password denied',call(55433,'/token?grant_type=password','POST',{'email':accounts['owner']['email'],'password':'invalid-password'})[0]==400)
check('Self signup disabled',call(55433,'/signup','POST',{'email':'uninvited@pilot.invalid','password':'invalid-password-123'})[0] in (400,403,422))
for role in ('owner','viewer','outsider'):
 code,rows=call(55431,'/pilot_projects',tok=tokens[role]['access_token']);check(role+' project visibility',code==200 and len(rows)==(0 if role=='outsider' else 1))
code,rows=call(55431,'/pilot_files?order=created_at.desc',tok=tokens['owner']['access_token'])
zips=[x for x in rows if x['original_name'].endswith('.zip')]
check('Team saved new ZIP checkpoint',len(zips)>=2)
loaded=[]
for x in zips:
 code,data=call(55432,'/object/authenticated/case-files/'+x['object_path'],tok=tokens['owner']['access_token'],raw=True)
 check('Stored ZIP integrity '+x['sha256'][:8],code==200 and hashlib.sha256(data).hexdigest()==x['sha256'])
 z=zipfile.ZipFile(io.BytesIO(data));state=json.loads(z.read('state.json'))
 check('No library credentials serialized '+x['sha256'][:8],not any(k.startswith('team_library_') for k in state['inputs']))
 for a in accounts.values():check('No password bytes in ZIP state '+a['email'].split('@')[0]+' '+x['sha256'][:8],a['password'].encode() not in z.read('state.json'))
 loaded.append(sorted(hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith('data_files/') and not n.endswith('/')))
check('Saved and original checkpoint contain identical input data',all(x==loaded[0] for x in loaded))
key=zips[0]['object_path']
check('Real outsider cannot download checkpoint',call(55432,'/object/authenticated/case-files/'+key,tok=tokens['outsider']['access_token'],raw=True)[0] in (400,403,404))
code,_=call(55433,'/logout','POST',tok=tokens['outsider']['access_token']);check('Logout accepted',code in (200,204))
check('Logged-out refresh token rejected',call(55433,'/token?grant_type=refresh_token','POST',{'refresh_token':tokens['outsider']['refresh_token']})[0] in (400,401))
Path('team-auth-evidence.json').write_text(json.dumps({'checks':checks,'count':len(checks),'note':'HTTP real GoTrue identities plus archived state checks. Browser resume/save/logout evidence recorded separately.'},indent=2));print(f'{len(checks)} checks passed')
