import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
spec = importlib.util.spec_from_file_location('delivery', Path(__file__).with_name('deploy-artifact.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.sha = 'a'*40
        files = []
        for name in ['index.html', 'team/index.html', 'team/status.json']:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'test')
            files.append({'path':name,'bytes':4,'sha256':hashlib.sha256(b'test').hexdigest()})
        self.manifest = {'version':1,'source_sha':self.sha,'files':files}
        self.write()
    def tearDown(self):
        self.temp.cleanup()
    def write(self):
        (self.root/'release-manifest.json').write_text(json.dumps(self.manifest))
    def test_valid(self):
        m.verify_artifact(self.root,self.sha)
    def test_tamper(self):
        (self.root/'index.html').write_bytes(b'evil')
        with self.assertRaises(ValueError):m.verify_artifact(self.root,self.sha)
    def test_extra(self):
        (self.root/'secret.env').write_text('secret')
        with self.assertRaises(ValueError):m.verify_artifact(self.root,self.sha)
    def test_traversal(self):
        self.manifest['files'][0]['path']='../index.html';self.write()
        with self.assertRaises(ValueError):m.verify_artifact(self.root,self.sha)
    def test_symlink(self):
        (self.root/'team/status.json').unlink();(self.root/'team/status.json').symlink_to(self.root/'index.html')
        with self.assertRaises(ValueError):m.verify_artifact(self.root,self.sha)

if __name__=='__main__':unittest.main()
