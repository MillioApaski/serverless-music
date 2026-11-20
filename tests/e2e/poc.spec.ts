import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('button',{name:'试听自有音频',exact:true})).toBeEnabled();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('real browser sandbox, timeout recovery and Range',async({page})=>{
 await page.getByRole('button',{name:'运行技术验证',exact:true}).click();await expect(page.getByRole('button',{name:'重新验证',exact:true})).toBeEnabled({timeout:20000});await expect(page.locator('.result-symbol.passed')).toHaveCount(5);await expect(page.locator('.result-symbol.failed')).toHaveCount(0);
});
test('audio proxy, seek and navigation do not replace the player',async({page})=>{
 await page.getByRole('button',{name:'音源实验室',exact:true}).click();await page.getByRole('button',{name:'Proxy 同源流式返回，支持 Range',exact:true}).click();await page.getByRole('button',{name:'用 proxy 模式试听',exact:true}).click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();await page.getByRole('button',{name:'歌单导入',exact:true}).click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();await page.getByRole('slider',{name:'播放进度'}).press('Home');await page.getByRole('slider',{name:'播放进度'}).press('ArrowRight');await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.getByRole('button',{name:'播放',exact:true})).toBeVisible();
});
test('import preserves raw native identity and reports malformed JSON',async({page})=>{
 await page.getByRole('button',{name:'歌单导入',exact:true}).click();await page.getByRole('button',{name:'填入示例',exact:true}).click();await expect(page.getByText('tx:owned-example-id',{exact:true})).toBeVisible();await page.locator('#playlist-json').fill('{bad');await page.getByRole('button',{name:'预览歌单',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'SyntaxError'})).toBeVisible();
});

test('playback queue can schedule the next track and persist playback settings',async({page})=>{
 await page.getByRole('button',{name:'试听自有音频',exact:true}).click();
 await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'音源实验室',exact:true}).click();
 await page.getByLabel('试听曲目').selectOption('dusk');
 await page.getByRole('button',{name:'下一首播放',exact:true}).click();
 const queue=page.getByRole('complementary',{name:'播放队列',exact:true});
 await expect(queue.getByRole('listitem')).toHaveCount(2);
 await queue.getByLabel('播放顺序').selectOption('repeat-all');
 const duskResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/fixtures/dusk.wav'&&response.ok());
 await page.getByRole('button',{name:'下一首',exact:true}).click();
 await duskResponse;
 await expect(queue.locator('button[aria-current=true]')).toContainText('暮色');
 await expect(page.getByRole('slider',{name:'播放进度'})).toHaveAttribute('max','12');
 await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'上一首',exact:true}).click();
 await expect(queue.locator('button[aria-current=true]')).toContainText('微光');
 await page.reload();
 await page.getByRole('button',{name:'播放队列',exact:true}).click();
 await expect(queue.getByLabel('播放顺序')).toHaveValue('repeat-all');
});
