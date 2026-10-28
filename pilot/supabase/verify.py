"""Real HTTP storage/RLS roundtrip. Output contains assertions and hashes, no tokens/data."""
import argparse, hashlib, json, uuid, urllib.request, urllib.error
from pathlib import Path
from setup_env import token
p=argparse.ArgumentParser();p.add_argument('--read-only',action='store_true');p.add_argument('--output',default='evidence.json');a=p.parse_args()
env=dict(line.split('=',1) for line in Path('.env').read_text().splitlines())
rest='http://127.0.0.1:'+env['REST_PORT']; storage='http://127.0.0.1:'+env['STORAGE_PORT']
P='10000000-0000-4000-8000-000000000001'
users={k:token(env['JWT_SECRET'],'authenticated',f'20000000-0000-4000-8000-00000000000{n}') for k,n in [('owner',1),('outsider',2),('viewer',3)]}
checks=[]
def check(name,ok):
    checks.append({'test':name,'passed':bool(ok)})
    if not ok:
        Path(a.output).write_text(json.dumps({'checks':checks},indent=2));raise AssertionError(name)
def req(base,path,user='owner',method='GET',data=None,content='application/json',extra=None):
    headers={'Content-Type':content}
    if user:headers['Authorization']='Bearer '+users[user]
    if extra:headers.update(extra)
    if isinstance(data,(dict,list)):data=json.dumps(data).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(base+path,data=data,headers=headers,method=method),timeout=60) as r:return r.status,r.read()
    except urllib.error.HTTPError as e:return e.code,e.read()
def digest(b):return hashlib.sha256(b).hexdigest()
check('Owner sees project',len(json.loads(req(rest,'/pilot_projects')[1]))==1)
check('Outsider sees no projects',req(rest,'/pilot_projects','outsider')==(200,b'[]'))
check('Anonymous cannot list projects',req(rest,'/pilot_projects',None)[0] in (401,403))
manifest=[]
if not a.read_only:
    for f in sorted(Path('inputs').iterdir()):
        if not f.is_file():continue
        b=f.read_bytes();h=digest(b);key=P+'/'+h
        status,_=req(storage,'/object/case-files/'+key,method='POST',data=b,content='application/octet-stream')
        check('Upload real case object '+str(len(manifest)+1),status==200)
        record={'project_id':P,'object_path':key,'original_name':f.name,'sha256':h,'size_bytes':len(b)}
        check('Commit file record '+str(len(manifest)+1),req(rest,'/pilot_files',method='POST',data=record)[0]==201)
        manifest.append(record)
else:
    status,data=req(rest,'/pilot_files');check('Restore catalog accessible',status==200);manifest=json.loads(data)
check('Real case catalog has at least 5 objects',len(manifest)>=5)
for i,rec in enumerate(manifest):
    key=rec['object_path'];status,b=req(storage,'/object/authenticated/case-files/'+key)
    check('Owner bytes match SHA256 object '+str(i+1),status==200 and digest(b)==rec['sha256'])
    status,b=req(storage,'/object/authenticated/case-files/'+key,'viewer')
    check('Viewer reads exact object '+str(i+1),status==200 and digest(b)==rec['sha256'])
    check('Outsider cannot download object '+str(i+1),req(storage,'/object/authenticated/case-files/'+key,'outsider')[0] in (400,401,403,404))
    check('Public URL cannot expose object '+str(i+1),req(storage,'/object/public/case-files/'+key,None)[0] in (400,401,403,404))
check('Outsider cannot sign download URL', req(storage,'/object/sign/case-files/'+manifest[0]['object_path'],'outsider','POST',{'expiresIn':60})[0] in (400,401,403,404))
check('Outsider catalog empty',req(rest,'/pilot_files','outsider')==(200,b'[]'))
check('Outsider cannot list bucket contents',json.loads(req(storage,'/object/list/case-files','outsider','POST',{'prefix':P,'limit':100})[1])==[])
if manifest:
    key=manifest[0]['object_path']
    check('Overwrite original denied',req(storage,'/object/case-files/'+key,method='PUT',data=b'changed',content='application/octet-stream')[0] in (400,401,403,404))
    check('Deleting original denied',req(storage,'/object/case-files',method='DELETE',data={'prefixes':[key]})[0] in (200,400,401,403,404))
    check('Delete attempt retains original',digest(req(storage,'/object/authenticated/case-files/'+key)[1])==manifest[0]['sha256'])
    h=digest(b'unauthorized test');newkey=P+'/'+h
    for who in ('viewer','outsider'):
        check(who+' cannot upload',req(storage,'/object/case-files/'+newkey,who,'POST',b'unauthorized test','application/octet-stream')[0] in (400,401,403))
        check(who+' cannot insert metadata',req(rest,'/pilot_files',who,'POST',{'project_id':P,'object_path':newkey,'sha256':h,'original_name':'denied','size_bytes':17})[0] in (401,403))
    check('Membership escalation denied',req(rest,'/pilot_members','outsider','POST',{'project_id':P,'user_id':'20000000-0000-4000-8000-000000000002','role':'owner'})[0] in (401,403))
    check('Catalog update denied',req(rest,'/pilot_files?id=eq.'+str(uuid.uuid4()),method='PATCH',data={'original_name':'changed'})[0] in (401,403))
    rec={k:manifest[0][k] for k in ('project_id','object_path','original_name','sha256','size_bytes')}
    check('Duplicate catalog record rejected',req(rest,'/pilot_files',method='POST',data=rec)[0]==409)
result={'phase':'restored' if a.read_only else 'initial','checks':checks,'object_count':len(manifest),'objects':[{'sha256':x['sha256'],'bytes':x['size_bytes']} for x in manifest], 'scope':'Storage persistence and HTTP authorization; test identities signed by isolated harness, not production login or Shiny integration.'}
Path(a.output).write_text(json.dumps(result,indent=2))
print(json.dumps({'passed':len(checks),'objects':len(manifest),'phase':result['phase']}))
