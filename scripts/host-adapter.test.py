import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import functools
import http.server
import threading
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('adapter', Path(__file__).with_name('host-adapter.py'))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)

class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'root'
        (self.root/'releases'/'baseline').mkdir(parents=True)
        (self.root/'assets').mkdir()
        (self.root/'releases'/'baseline'/'index.html').write_text('old')
        (self.root/'current').symlink_to('releases/baseline')
        self.artifact = Path(self.tmp.name) / 'candidate'
        (self.artifact/'team').mkdir(parents=True)
        (self.artifact/'assets').mkdir()
        for name, data in [('index.html','new'), ('team/index.html','board'), ('team/status.json','{}'), ('assets/hash.js','code')]:
            (self.artifact/name).write_text(data)
        self.manifest = {'version':1, 'source_sha':'a'*40, 'files':[
            {'path':p.relative_to(self.artifact).as_posix(), 'bytes':p.stat().st_size,
             'sha256':adapter.digest(p.read_bytes())} for p in sorted(self.artifact.rglob('*')) if p.is_file()]}
        (self.artifact/'release-manifest.json').write_text(json.dumps(self.manifest))
        self.config = {'local_url':'http://local/', 'public_url':'https://public/'}

    def promote(self, sha='a'*40):
        with patch.object(adapter, 'eligible'), patch.object(adapter, 'verify_served'):
            return adapter.apply(self.root,self.config,self.artifact,sha,self.manifest)

    def test_promotes_and_noops(self):
        self.assertEqual(self.promote()['status'],'deployed')
        self.assertEqual((self.root/'current'/'index.html').read_text(),'new')
        self.assertEqual(self.promote()['status'],'unchanged')

    def test_failed_health_restores_prior(self):
        with patch.object(adapter,'eligible'), patch.object(adapter,'verify_served', side_effect=[ValueError('bad'), None]):
            with self.assertRaises(ValueError):
                adapter.apply(self.root,self.config,self.artifact,'a'*40,self.manifest)
        self.assertEqual((self.root/'current'/'index.html').read_text(),'old')
        self.assertFalse((self.root/'pending.json').exists())

    def test_interrupted_promotion_recovers(self):
        adapter.atomic_json(self.root/'pending.json', {'prior':'releases/baseline','prior_state':{}})
        with patch.object(adapter,'verify_served'):
            adapter.recover(self.root,self.config)
        self.assertEqual(adapter.current_target(self.root),'releases/baseline')

    def test_cached_asset_retained(self):
        (self.root/'assets'/'old.js').write_text('old client')
        self.promote()
        self.assertEqual((self.root/'current'/'assets'/'old.js').read_text(),'old client')

    def test_asset_collision_blocks_before_switch(self):
        (self.root/'assets'/'hash.js').write_text('different')
        with self.assertRaises(ValueError):
            self.promote()
        self.assertEqual((self.root/'current'/'index.html').read_text(),'old')

    def test_dashboard_only_preserves_game_source(self):
        self.promote()
        self.assertEqual(self.promote('b'*40)['status'],'dashboard-only')
        self.assertEqual(json.loads((self.root/'state.json').read_text())['game_source_sha'],'a'*40)

    def test_eligibility_rejects_superseded_source(self):
        with patch.dict('os.environ',{'RUSTWAKE_GITHUB_TOKEN':'test'}), patch.object(adapter,'get',return_value=json.dumps({'object':{'sha':'b'*40}}).encode()):
            with self.assertRaises(ValueError): adapter.eligible('a'*40)

    def test_served_spa_fallback_is_failure(self):
        with patch.object(adapter,'get',return_value=b'new'):
            with self.assertRaises(ValueError): adapter.verify_served(self.config,self.artifact)

    def test_invalid_recovery_target_rejected(self):
        adapter.atomic_json(self.root/'pending.json',{'prior':'../../unrelated','prior_state':{}})
        with self.assertRaises(ValueError): adapter.recover(self.root,self.config)

    def test_real_http_serves_atomic_release(self):
        class QuietHandler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *args): pass
        handler = functools.partial(QuietHandler, directory=str(self.root/'current'))
        server = http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
        thread = threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            url = 'http://127.0.0.1:' + str(server.server_port) + '/'
            config = {'local_url':url,'public_url':url}
            with patch.object(adapter,'eligible'):
                result = adapter.apply(self.root,config,self.artifact,'a'*40,self.manifest)
            self.assertTrue(result['verified'])
            self.assertEqual(adapter.get(url+'team/status.json'),b'{}')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_failed_rollback_keeps_recovery_record(self):
        with patch.object(adapter,'eligible'), patch.object(adapter,'verify_served',side_effect=ValueError('unhealthy')):
            with self.assertRaises(ValueError):
                adapter.apply(self.root,self.config,self.artifact,'a'*40,self.manifest)
        self.assertTrue((self.root/'pending.json').exists())

    def test_eligibility_requires_successful_ci(self):
        responses = [json.dumps({'object':{'sha':'a'*40}}).encode(), json.dumps({'workflow_runs':[]}).encode()]
        with patch.dict('os.environ',{'RUSTWAKE_GITHUB_TOKEN':'test'}), patch.object(adapter,'get',side_effect=responses):
            with self.assertRaises(ValueError): adapter.eligible('a'*40)

if __name__ == '__main__': unittest.main()
