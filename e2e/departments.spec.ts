import {test,expect} from '@playwright/test';

test('CEO and dynamic department routes survive framework upgrades',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of ['/ceo','/content','/email','/design']){
  const response=await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.getByLabel('Business',{exact:true})).toBeVisible();
 }
 expect(errors).toEqual([]);
});

test('department tabs, legacy links and sandboxed email preview',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/lifecycle?preview=welcome');
 await expect(page).toHaveURL(/\/email\?tab=previews&preview=welcome/);
 await expect(page.frameLocator('iframe').getByRole('heading',{name:'Synthetic welcome'})).toBeVisible();
 await expect(page.locator('iframe')).toHaveAttribute('sandbox','');
 expect(await page.evaluate(()=>('__previewExecuted' in window))).toBe(false);
 await page.getByLabel('Mobile preview',{exact:true}).click();
 await page.getByLabel('Plain text').check();
 await expect(page.getByText('Synthetic plain text',{exact:true})).toBeVisible();
 for(const tab of ['Overview','Accounts','Tools & Skills']){
  await page.getByRole('navigation',{name:'Email and lifecycle views'}).getByRole('link',{name:tab,exact:true}).click();
  await expect(page.getByRole('heading',{name:'Email & Lifecycle',exact:true})).toBeVisible();
 }
 // Approving, testing, modes and delivery moved to the lifecycle centre: the old tabs go there.
 for(const old of ['workflows','delivery']){
  await page.goto('/email?tab='+old);
  await expect(page).toHaveURL(/\/lifecycle$/);
  await expect(page.getByRole('heading',{name:/Lifecycle centre/})).toBeVisible();
 }
 for(const tab of ['overview','guidelines','assets','reviews','tools']){
  await page.goto('/design?tab='+tab);
  await expect(page.getByRole('heading',{name:'Design & Brand',exact:true})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Welcome HTML'})).toHaveCount(0);
 }
 expect(errors).toEqual([]);
});

test('downloads respect business selection and cannot escape the asset folder',async({page})=>{
 await page.goto('/design?tab=assets');
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download',exact:true}).click();
 expect((await download).suggestedFilename()).toBe('mark.svg');
 const asset=await page.request.get('/api/brand-assets?file=mark.svg');
 expect(asset.status()).toBe(200);expect(asset.headers()['cache-control']).toBe('no-store');
 expect((await page.request.get('/api/brand-assets?file=..%2Fprofile.json')).status()).toBe(404);
 await page.getByLabel('Business',{exact:true}).selectOption('sample-two');
 await expect(page.getByText('No brand kit connected for this business.')).toBeVisible();
 expect((await page.request.get('/api/brand-assets?file=mark.svg')).status()).toBe(404);
 await page.getByLabel('Business',{exact:true}).selectOption('sample-one');
 await expect(page.getByRole('heading',{name:'Asset library',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('lifecycle centre and a flow page answer the three questions, on desktop and phone',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/lifecycle');
 await expect(page.getByRole('heading',{name:/^Needs you \(\d+\)$/})).toBeVisible();
 await expect(page.getByText('Is it working?').first()).toBeVisible();
 await expect(page.getByText('Waiting for you').first()).toBeVisible();
 await expect(page.getByText(/^n\/a$/)).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.goto('/workflows/onboarding-to-first-value');
 await expect(page.getByRole('heading',{name:/Is it working, what's waiting, what next/})).toBeVisible();
 await expect(page.getByRole('article',{name:/Week one review/})).toBeVisible();
 await expect(page.getByRole('group',{name:/Mode for/})).toBeVisible();
 await expect(page.getByRole('button',{name:/^Approve \d+$/}).first()).toBeVisible();
 await expect(page.locator('iframe').first()).toHaveAttribute('sandbox','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});
