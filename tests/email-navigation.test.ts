import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailTab,legacyLifecycleUrl,EMAIL_TABS} from '../lib/email-navigation';
test('email department tabs have a safe default',()=>{
 for(const tab of EMAIL_TABS)assert.equal(emailTab(tab),tab);
 for(const value of [undefined,'missing','../accounts',[],null])assert.equal(emailTab(value),'overview');
});
test('legacy lifecycle links preserve preview intent without query injection',()=>{
 assert.equal(legacyLifecycleUrl(),'/email');
 assert.equal(legacyLifecycleUrl('help'),'/email?tab=previews&preview=help#email-previews');
 assert.equal(legacyLifecycleUrl('help&tab=accounts'),'/email?tab=previews&preview=help%26tab%3Daccounts#email-previews');
});
