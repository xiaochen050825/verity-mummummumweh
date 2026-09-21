import unittest,runpy,pathlib,json
m=runpy.run_path(str(pathlib.Path(__file__).with_name('check-submission.py')))
class ExportChecks(unittest.TestCase):
    def fixture(self):
        c={'id':'fresh-id','category':'GENERAL','fields':{}}
        row={'category':'GENERAL','status':'OK','review_reason':None,'has_defect':False,'defect_fields':[]}
        audit={'fresh-id':{'case_id':'fresh-id','mapping_version':'test','source_pointer':{'case_id':'fresh-id'}}}
        return {'fresh-id':row},['fresh-id'],{'fresh-id':c},audit
    def test_valid_and_deleted(self):
        args=self.fixture();self.assertTrue(m['check'](*args)['complete'])
        args[0].clear();self.assertFalse(m['check'](*args)['complete'])
    def test_duplicate_json(self):
        with self.assertRaises(ValueError):json.loads('{"x":{},"x":{}}',object_pairs_hook=m['no_duplicates'])
    def test_invalid_enum_and_extra_field(self):
        args=self.fixture();args[0]['fresh-id']['status']='PASS';self.assertFalse(m['check'](*args)['valid_partial'])
        args=self.fixture();args[0]['fresh-id']['confidence']=1;self.assertFalse(m['check'](*args)['valid_partial'])
    def test_no_audit(self):
        args=self.fixture();args[3].clear();self.assertFalse(m['check'](*args)['valid_partial'])
    def test_default_ok_cannot_hide_unresolved(self):
        args=self.fixture();args[0]['fresh-id']['category']='BL_COMPARISON';args[2]['fresh-id']['category']='BL_COMPARISON'
        self.assertFalse(m['check'](*args)['valid_partial'])
if __name__=='__main__':unittest.main()
