import copy,unittest
from prepare import validate
class Gates(unittest.TestCase):
    def setUp(self):self.doc={'project_id':'99999999-0000-4000-8000-000000000001','project_name':'Approved study','members':[{'email':'test-owner@example.org','role':'owner','approved':True}]}
    def reject(self,d):
        with self.assertRaises((ValueError,KeyError,TypeError)):validate(d)
    def test_plan_has_no_side_effect_actions(self):self.assertEqual(validate(self.doc)['actions_performed'],[])
    def test_pilot_project_rejected(self):self.doc['project_id']='10000000-0000-4000-8000-000000000001';self.reject(self.doc)
    def test_unapproved_member_rejected(self):self.doc['members'][0]['approved']=False;self.reject(self.doc)
    def test_no_owner_rejected(self):self.doc['members'][0]['role']='viewer';self.reject(self.doc)
    def test_service_role_rejected(self):self.doc['members'][0]['role']='service_role';self.reject(self.doc)
    def test_case_insensitive_duplicate_rejected(self):self.doc['members'].append(dict(self.doc['members'][0],email='TEST-OWNER@example.org'));self.reject(self.doc)
    def test_credentials_rejected(self):self.doc['members'][0]['password']='not-allowed';self.reject(self.doc)
    def test_test_domain_rejected(self):self.doc['members'][0]['email']='owner@lipidomic-pilot.invalid';self.reject(self.doc)
if __name__=='__main__':unittest.main()
