import tempfile, unittest
from pathlib import Path
from cryptography.exceptions import InvalidTag
from backup import encrypt, decrypt
class BackupTests(unittest.TestCase):
    def test_authenticated_backup(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d); src=d/'source'; src.write_bytes(b'case-study'*300000); key=b'k'*32
            enc=d/'encrypted';encrypt(src,enc,key);decrypt(enc,d/'restored',key)
            self.assertEqual(src.read_bytes(),(d/'restored').read_bytes())
            with self.assertRaises(InvalidTag):decrypt(enc,d/'wrong-key',b'x'*32)
            self.assertFalse((d/'wrong-key').exists())
            content=bytearray(enc.read_bytes());content[40]^=1;enc.write_bytes(content)
            with self.assertRaises(InvalidTag):decrypt(enc,d/'tampered',key)
            self.assertFalse((d/'tampered').exists());self.assertFalse((d/'tampered.partial').exists())
    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);s=d/'s';s.write_bytes(b'original');e=d/'e';encrypt(s,e,b'k'*32)
            with self.assertRaises(ValueError):decrypt(e,s,b'k'*32)
            self.assertEqual(s.read_bytes(),b'original')
if __name__=='__main__':unittest.main()
