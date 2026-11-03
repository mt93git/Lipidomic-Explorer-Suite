import datetime,hashlib,json,tempfile,unittest
from pathlib import Path
from monitor_backup import assess,record
class MonitorTests(unittest.TestCase):
 def test_failure_recovery_integrity_staleness(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);now=datetime.datetime.now(datetime.timezone.utc);stamp=now.strftime('%Y%m%dT%H%M%S.%fZ')
   p=root/'backups'/stamp;p.mkdir(parents=True);(p/'COMPLETE').touch();(p/'pilot-backup.enc').write_bytes(b'encrypted')
   (p/'manifest.json').write_text(json.dumps({'encrypted_bytes':9,'encrypted_sha256':hashlib.sha256(b'encrypted').hexdigest(),'authenticated_roundtrip':True}))
   keys=root/'backup-keys';keys.mkdir();(keys/(stamp+'.key')).write_bytes(b'k'*32)
   good=assess(root,'success',now);self.assertEqual(good['status'],'healthy')
   bad=assess(root,'exit-code',now);self.assertEqual(bad['status'],'alert');self.assertTrue(record(root,bad));self.assertFalse(record(root,bad));self.assertTrue(record(root,good))
   events=[json.loads(x)['event'] for x in (root/'backup-alerts.jsonl').read_text().splitlines()];self.assertEqual(events,['ALERT','RECOVERED'])
   self.assertIn('36 hours',' '.join(assess(root,'success',now+datetime.timedelta(hours=37))['problems']))
   (p/'pilot-backup.enc').write_bytes(b'tampered!');self.assertIn('integrity',' '.join(assess(root,'success',now)['problems']))
   (keys/(stamp+'.key')).unlink();self.assertIn('key',' '.join(assess(root,'success',now)['problems']))
 def test_missing_backup(self):
  with tempfile.TemporaryDirectory() as d:self.assertEqual(assess(Path(d),'success')['status'],'alert')
if __name__=='__main__':unittest.main()
