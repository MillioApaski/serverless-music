import {test,expect} from '@playwright/test';
test('real browser sandbox, timeout recovery and Range',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'运行技术验证',exact:true}).click();await expect(page.getByRole('button',{name:'重新验证',exact:true})).toBeEnabled({timeout:20000});await expect(page.locator('.result-symbol.passed')).toHaveCount(5);await expect(page.locator('.result-symbol.failed')).toHaveCount(0);
});
test('audio proxy, seek and navigation do not replace the player',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'音源实验室',exact:true}).click();await page.getByRole('button',{name:'Proxy 同源流式返回，支持 Range',exact:true}).click();await page.getByRole('button',{name:'用 proxy 模式试听',exact:true}).click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();await page.getByRole('button',{name:'歌单导入',exact:true}).click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();await page.getByRole('slider',{name:'播放进度'}).press('Home');await page.getByRole('slider',{name:'播放进度'}).press('ArrowRight');await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.getByRole('button',{name:'播放',exact:true})).toBeVisible();
});
test('import preserves raw native identity and reports malformed JSON',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'歌单导入',exact:true}).click();await page.getByRole('button',{name:'填入示例',exact:true}).click();await expect(page.getByText('tx:owned-example-id',{exact:true})).toBeVisible();await page.locator('#playlist-json').fill('{bad');await page.getByRole('button',{name:'预览歌单',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'SyntaxError'})).toBeVisible();
});
