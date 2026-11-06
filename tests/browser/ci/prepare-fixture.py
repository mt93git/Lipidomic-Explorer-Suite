"""Build a deterministic synthetic session archive; no user files needed."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib,json
root=Path(__file__).parent
with ZipFile(root/'fixtures/synthetic-session.zip','w') as z:
    for source,target in [('state.json','state.json'),('shared-state-v1.json','shared-state-v1.json'),('abundance.csv','data_files/abundance.csv')]:
        info=ZipInfo(target,(2020,1,1,0,0,0)); info.compress_type=ZIP_DEFLATED
        z.writestr(info,(root/'fixtures'/source).read_bytes())
print(hashlib.sha256((root/'fixtures/synthetic-session.zip').read_bytes()).hexdigest())
