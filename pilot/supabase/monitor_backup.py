#!/usr/bin/env python3
"""RTX-only backup checks and state-change alerts; no mail or external transport."""
import datetime,hashlib,json,os,shutil,subprocess
from pathlib import Path

def assess(root,result,now=None):
    now=now or datetime.datetime.now(datetime.timezone.utc)
    problems=[]; latest=None
    if result!='success':problems.append('Backup service failed: '+result)
    candidates=sorted((root/'backups').glob('*/COMPLETE'))
    if not candidates:problems.append('No completed backup')
    else:
        folder=candidates[-1].parent;latest=folder.name
        try:
            stamp=datetime.datetime.strptime(latest,'%Y%m%dT%H%M%S.%fZ').replace(tzinfo=datetime.timezone.utc)
            if (now-stamp).total_seconds()>36*3600:problems.append('Latest backup is over 36 hours old')
            m=json.loads((folder/'manifest.json').read_text());archive=folder/'pilot-backup.enc'
            h=hashlib.sha256()
            with archive.open('rb') as f:
                for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
            if archive.stat().st_size!=m['encrypted_bytes'] or h.hexdigest()!=m['encrypted_sha256']:problems.append('Encrypted backup integrity mismatch')
            if not m.get('authenticated_roundtrip'):problems.append('Backup is not verified')
            key=root/'backup-keys'/(latest+'.key')
            if not key.exists() or key.stat().st_size!=32:problems.append('Recovery key missing or invalid')
        except Exception:problems.append('Backup manifest or archive unreadable')
    if shutil.disk_usage(root).free<5*1024**3:problems.append('Less than 5 GiB free disk space')
    return {'status':'alert' if problems else 'healthy','checked_at':now.isoformat(),'latest_backup':latest,'problems':problems}

def record(root,state):
    path=root/'backup-health.json';previous=json.loads(path.read_text()) if path.exists() else {}
    changed=(previous.get('status'),previous.get('problems'))!=(state['status'],state['problems'])
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(state,indent=2)+'\n');temp.replace(path)
    if changed:
        event={'event':'ALERT' if state['status']=='alert' else 'RECOVERED' if previous.get('status')=='alert' else 'HEALTHY',**state}
        with (root/'backup-alerts.jsonl').open('a') as f:f.write(json.dumps(event)+'\n')
        print(event['event']+': '+('; '.join(state['problems']) or 'Backup checks passed'),flush=True)
    return changed

if __name__=='__main__':
    os.umask(0o077);root=Path(__file__).resolve().parent
    try:result=subprocess.check_output(['systemctl','--user','show','lipidomic-pilot-backup.service','-p','Result','--value'],text=True,timeout=15).strip()
    except Exception:result='unavailable'
    record(root,assess(root,result))
