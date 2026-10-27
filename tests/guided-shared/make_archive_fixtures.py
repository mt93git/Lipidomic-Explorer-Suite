"""Adversarial ZIP fixtures containing only synthetic text; no external reads."""
import json
import pathlib
import stat
import sys
import zipfile

root = pathlib.Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
state = json.dumps({'inputs': {}, 'uploads': {'raw': 'data_files/raw.csv'}})
for label, path in [('traversal', '../escape.csv'), ('absolute', '/escape.csv'), ('alias', 'data_files/./raw.csv')]:
    with zipfile.ZipFile(root / f'{label}.zip', 'w') as z:
        z.writestr('state.json', state)
        z.writestr(path, 'synthetic')
with zipfile.ZipFile(root / 'symlink.zip', 'w') as z:
    z.writestr('state.json', state)
    link = zipfile.ZipInfo('data_files/raw.csv')
    link.create_system = 3
    link.external_attr = (stat.S_IFLNK | 0o777) << 16
    z.writestr(link, str(root / 'outside-sentinel.txt'))
(root / 'outside-sentinel.txt').write_text('DO_NOT_READ_THIS_SENTINEL')
with zipfile.ZipFile(root / 'symlink-chain.zip', 'w') as z:
    z.writestr('state.json', state)
    link = zipfile.ZipInfo('data_files/link')
    link.create_system = 3
    link.external_attr = (stat.S_IFLNK | 0o777) << 16
    z.writestr(link, str(root))
    z.writestr('data_files/link/escape.csv', 'synthetic')
