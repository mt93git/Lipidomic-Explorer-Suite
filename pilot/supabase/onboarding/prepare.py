"""Offline enrollment-plan validator. Does not create users, send mail or grant access."""
import argparse,json,re,uuid
from pathlib import Path
PILOT='10000000-0000-4000-8000-000000000001'
def validate(doc):
    project=str(uuid.UUID(doc['project_id']))
    if project==PILOT:raise ValueError('Real enrollment must not reuse the pilot project')
    if not doc.get('project_name','').strip():raise ValueError('Project name required')
    members=doc.get('members',[])
    if not members:raise ValueError('Explicit member list required')
    seen=set()
    for m in members:
        email=m.get('email','').strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or email.endswith(('.invalid','.example')):raise ValueError('Real member email required')
        if email in seen:raise ValueError('Duplicate member email')
        seen.add(email)
        if m.get('role') not in ('owner','editor','viewer'):raise ValueError('Role must be owner, editor or viewer')
        if m.get('approved') is not True:raise ValueError('Every member and role require explicit approval')
        if set(m)-{'email','role','approved'}:raise ValueError('Unexpected member field; do not include passwords or tokens')
    if not any(m['role']=='owner' for m in members):raise ValueError('At least one approved owner required')
    return {'mode':'PLAN_ONLY','project_id':project,'member_count':len(members),'roles':{r:sum(m['role']==r for m in members) for r in ('owner','editor','viewer')},'gates':['invitation_and_recovery_browser_test','new_project_without_pilot_members','https_and_websocket_check','backup_restore_with_real_auth','rollback_rehearsal'],'actions_performed':[]}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('private_roster');a=p.parse_args()
    try: result=validate(json.loads(Path(a.private_roster).read_text()))
    except (ValueError,KeyError,TypeError) as e:raise SystemExit('Enrollment plan rejected: '+str(e))
    print(json.dumps(result,indent=2))
