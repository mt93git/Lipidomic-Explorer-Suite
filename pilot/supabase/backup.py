#!/usr/bin/env python3
"""Consistent encrypted pilot backup. No retention deletion; keys stay outside archives."""
import argparse, datetime, fcntl, hashlib, json, os, shutil, subprocess, tempfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

MAGIC = b'LIPIDBK1'

def encrypt(source, destination, key):
    nonce = os.urandom(12)
    enc = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
    enc.authenticate_additional_data(MAGIC)
    with open(source, 'rb') as src, open(destination, 'xb') as out:
        out.write(MAGIC + nonce)
        for block in iter(lambda: src.read(1024*1024), b''):
            out.write(enc.update(block))
        out.write(enc.finalize()); out.write(enc.tag)

def decrypt(source, destination, key):
    # Publish plaintext only after authentication; never extract an unverified archive.
    tmp = Path(str(destination) + '.partial')
    try:
        with open(source, 'rb') as src, open(tmp, 'xb') as out:
            if src.read(8) != MAGIC: raise ValueError('Invalid backup format')
            nonce = src.read(12); src.seek(-16, 2); tag = src.read(16)
            remaining = src.tell()-36; src.seek(20)
            dec = Cipher(algorithms.AES(key), modes.GCM(nonce, tag)).decryptor()
            dec.authenticate_additional_data(MAGIC)
            while remaining:
                chunk = src.read(min(1024*1024, remaining))
                if not chunk: raise ValueError('Truncated backup')
                remaining -= len(chunk); out.write(dec.update(chunk))
            out.write(dec.finalize())
        if Path(destination).exists(): raise ValueError('Refusing to overwrite restored archive')
        tmp.rename(destination)
    finally:
        tmp.unlink(missing_ok=True)

def backup(root):
    os.umask(0o077)
    root = root.resolve(); os.chdir(root)
    lock = open('.backup.lock', 'a'); fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    dest = root/'backups'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    dest.mkdir(parents=True)
    # Temporary dump + tar + encrypted payload require spare capacity. Fail before pausing APIs.
    used = sum(p.stat().st_size for p in (root/'data/objects').rglob('*') if p.is_file())
    if shutil.disk_usage(root).free < max(1024**3, 4*used): raise RuntimeError('Insufficient backup disk headroom')
    keydir = root/'backup-keys'; keydir.mkdir(mode=0o700, exist_ok=True)
    keypath = keydir/(dest.name+'.key'); key = os.urandom(32); keypath.write_bytes(key)
    compose = ['docker','compose','-p','lipidomic-pilot','-f','compose.yml']
    def run(args, **kw): subprocess.run(args, check=True, **kw)
    with tempfile.TemporaryDirectory(prefix='.backup-', dir=root) as tmp:
        work = Path(tmp)
        try:
            run(compose+['stop','rest','storage','auth'])
            with open(work/'database.dump','wb') as out:
                run(compose+['exec','-T','db','pg_dump','-U','supabase_admin','-d','postgres','-Fc'],stdout=out)
            run(['tar','-C','data','-czf',str(work/'objects.tar.gz'),'objects'])
            shutil.copyfile('.env',work/'recovery.env')
        finally:
            run(compose+['up','-d','--wait','rest','storage','auth'])
        run(['tar','-C',str(work),'-cf',str(work/'payload.tar'),'database.dump','objects.tar.gz','recovery.env'])
        encrypt(work/'payload.tar',dest/'pilot-backup.enc',key)
        decrypt(dest/'pilot-backup.enc',work/'verified.tar',key)
        def sha(p):
            h=hashlib.sha256()
            with open(p,'rb') as f:
                for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
            return h.hexdigest()
        if sha(work/'payload.tar') != sha(work/'verified.tar'): raise RuntimeError('Backup verification failed')
        report={'status':'complete','format':'AES-256-GCM','created_utc':dest.name,'encrypted_sha256':sha(dest/'pilot-backup.enc'),'encrypted_bytes':(dest/'pilot-backup.enc').stat().st_size,'authenticated_roundtrip':True,'scope':'pilot database, auth, memberships, storage objects and recovery environment','key_location':'separate backup-keys directory; copy separately off host'}
        (dest/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
        # Completeness marker is written last, and only after APIs are healthy again.
        (dest/'COMPLETE').write_text('verified\n')
    print(dest)
    return dest

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=Path(__file__).parent)
    p.add_argument('--decrypt',type=Path);p.add_argument('--key',type=Path);p.add_argument('--output',type=Path);a=p.parse_args()
    os.umask(0o077)
    if a.decrypt:
        if not a.key or not a.output:p.error('--key and --output required')
        decrypt(a.decrypt,a.output,a.key.read_bytes())
    else:backup(a.root)
