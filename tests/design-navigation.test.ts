import {test} from 'node:test';
import assert from 'node:assert/strict';
import {designTab,designAsset,designReview,DESIGN_TABS} from '../lib/design-navigation';
test('design tabs default safely and keep email templates out of the asset library',()=>{
 for(const t of DESIGN_TABS)assert.equal(designTab(t),t);
 assert.equal(designTab('emails'),'overview');
 for(const file of ['logo.svg','social.png','tokens.json'])assert.equal(designAsset(file),true);
 for(const file of ['welcome.html','proposed-welcome.html','brand-guide.md'])assert.equal(designAsset(file),false);
 assert.equal(designReview('brand-review.md'),true);
 assert.equal(designReview('brand-guide.md'),false);
 assert.equal(designReview('welcome.html'),false);
});
