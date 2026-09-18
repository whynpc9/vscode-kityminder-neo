// Exercise the real webview bundle and DOM, including native browser key defaults.
// Run after npm run build; no local .km fixtures are needed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const doc = { root: { data: { id: 'root', text: 'Root' }, children: [
  { data: { id: 'alpha', text: 'Alpha', note: 'needle note' }, children: [] },
  { data: { id: 'beta', text: 'Beta' }, children: [] },
] }, template: 'right', version: '1.4.43' };
const mock = `<script>
window.testMessages = [];
window.acquireVsCodeApi = () => ({
  postMessage(msg) {
    window.testMessages.push(msg);
    if (msg.type === 'ready') window.postMessage({ type: 'init', filename: 'keyboard.km',
      text: ${JSON.stringify(JSON.stringify(doc))}, config: {} }, '*');
  }, setState() {}, getState() { return {}; }
});
</script>`;
const html = (await readFile(new URL('test/render-test.html', root), 'utf8'))
  .replace(/<script>[\s\S]*?<\/script>/, mock);
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  try {
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    const file = { '/dist/webview.js': 'text/javascript', '/dist/webview.css': 'text/css' }[pathname];
    if (!file) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file);
    res.end(await readFile(new URL(pathname.slice(1), root)));
  } catch (error) { res.writeHead(500).end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const value = id => page.locator(`#${id}`).inputValue();
const expectNodes = count => page.waitForFunction(count => document.querySelectorAll('.x6-node').length === count, count);
const focus = () => page.evaluate(() => document.activeElement.id || document.activeElement.className);
async function select(id) { await page.locator(`.x6-node[data-cell-id="${id}"]`).click(); }
async function reset() {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#node-title').value === 'Root');
}
async function key(target, key, options = {}) {
  return page.evaluate(({target, key, options}) => {
    const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...options});
    document.querySelector(target).dispatchEvent(event);
    return event.defaultPrevented;
  }, {target, key, options});
}
// Simulates the VS Code webview preload, which preventDefaults find/clipboard
// chords before extension handlers see them.
async function preemptedKey(target, key, options = {}) {
  return page.evaluate(({target, key, options}) => {
    const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...options});
    event.preventDefault();
    document.querySelector(target).dispatchEvent(event);
  }, {target, key, options});
}
const tests = [
  ['search editing, selection and native shortcuts', async () => {
    await select('alpha');
    await key('#mindmap-container', 'f', {ctrlKey:true});
    const input = page.locator('#search-input');
    await input.fill('abcd');
    await input.press('ArrowLeft'); await input.press('Backspace');
    assert.equal(await value('search-input'), 'abd');
    await input.press('Delete'); await input.press('ArrowLeft'); await input.press('Shift+ArrowRight');
    assert.deepEqual(await input.evaluate(e => [e.value,e.selectionStart,e.selectionEnd]), ['ab',1,2]);
    for (const k of ['a','c','v','x','z','y']) assert.equal(await key('#search-input',k,{ctrlKey:true}),false);
    await expectNodes(3);
    await input.press('Escape'); assert.equal(await focus(),'mindmap-container');
  }],
  ['toolbar Enter/Space activate buttons; Tab traverses controls', async () => {
    await select('alpha');
    const zoomBefore = await page.locator('#btn-zoom-value').textContent();
    await page.locator('#btn-zoom-in').press('Enter');
    await expectNodes(3);
    assert.equal(await page.locator('.km-edit-input').count(),0);
    assert.notEqual(await page.locator('#btn-zoom-value').textContent(),zoomBefore);
    await page.locator('#btn-zoom-in').press('Tab');
    assert.notEqual(await focus(),'btn-zoom-in'); await expectNodes(3);
    await page.locator('#btn-add-child').press('Space');
    await expectNodes(4);
    await page.locator('#btn-delete').press('Enter'); await expectNodes(3);
  }],
  ['search buttons keep native activation and focus', async () => {
    await key('#mindmap-container','f',{ctrlKey:true});
    await page.locator('#search-input').fill('a');
    await page.locator('#search-input').press('Enter');
    const before = await page.locator('#search-count').textContent();
    await page.locator('#btn-search-next').press('Enter');
    assert.notEqual(await page.locator('#search-count').textContent(),before);
    await expectNodes(3); assert.equal(await focus(),'btn-search-next');
    await page.locator('#btn-search-close').press('Space');
    assert.equal(await page.locator('#search-bar').isVisible(),false);
    assert.equal(await focus(),'mindmap-container');
  }],
  ['note search never steals typing focus, including the former 80ms window', async () => {
    await key('#mindmap-container','f',{ctrlKey:true});
    await page.locator('#search-input').fill('needle');
    assert.equal(await key('#search-input','Enter'),true);
    assert.equal(await focus(),'search-input');
    await page.locator('#search-input').press('Backspace');
    assert.equal(await value('search-input'),'needl');
    assert.equal(await value('node-note'),'needle note');
    await page.locator('#search-input').press('Escape');
    await page.waitForTimeout(200); // Exceed search debounce and the removed focus timer.
    assert.equal(await focus(),'mindmap-container');
  }],
  ['plain text fields keep native deletion, navigation and line breaks', async () => {
    await select('alpha');
    for (const id of ['node-title','node-note']) {
      const input=page.locator(`#${id}`);
      await input.fill('abcd'); await input.press('ArrowLeft'); await input.press('Backspace');
      assert.equal(await value(id),'abd');
      await input.press('Delete'); assert.equal(await value(id),'ab');
    }
    await page.locator('#node-note').press('Enter'); assert.equal(await value('node-note'),'ab\n');
    await expectNodes(3);
    await page.locator('#node-note').press('Escape'); assert.equal(await focus(),'mindmap-container');
  }],
  ['immediate title/note undo and redo preserve the right history', async () => {
    await select('alpha');
    for (const [id, original] of [['node-title','Alpha'], ['node-note','needle note']]) {
      await page.evaluate(({id}) => {
        const input=document.getElementById(id); input.focus(); input.value='Changed';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
      }, {id});
      assert.equal(await value(id),original);
      await key(`#${id}`,'Z',{ctrlKey:true,shiftKey:true});
      assert.equal(await value(id),'Changed');
      await page.waitForTimeout(200); // Detect a stale delayed write clearing redo/history.
      await key(`#${id}`,'Z',{ctrlKey:true}); assert.equal(await value(id),original);
    }
  }],
  ['switching nodes before a pending edit cannot lose or misapply it', async () => {
    await select('alpha');
    await page.evaluate(() => {
      const input=document.getElementById('node-title'); input.focus(); input.value='Changed alpha';
      input.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('.x6-node[data-cell-id="beta"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    });
    await select('beta'); assert.equal(await value('node-title'),'Beta');
    await select('alpha'); assert.equal(await value('node-title'),'Changed alpha');
  }],
  ['IME, prevented events and unsupported modifier chords do not mutate the graph', async () => {
    await select('alpha');
    for (const k of ['Backspace','Delete','Enter','Tab','ArrowLeft',' ']) {
      assert.equal(await key('#mindmap-container',k,{isComposing:true}),false);
      assert.equal(await key('#mindmap-container',k,{keyCode:229}),false);
      assert.equal(await key('#mindmap-container',k,{ctrlKey:true}),false);
      assert.equal(await key('#mindmap-container',k,{shiftKey:true}),false);
    }
    await page.evaluate(() => {
      const e=new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true});
      e.preventDefault(); document.getElementById('mindmap-container').dispatchEvent(e);
    });
    await expectNodes(3); assert.equal(await value('node-title'),'Alpha');
    assert.equal(await page.locator('.km-edit-input').count(),0);
  }],
  ['canvas navigation, add/delete and history still work', async () => {
    await select('alpha'); await key('#mindmap-container','ArrowDown');
    assert.equal(await value('node-title'),'Beta');
    await key('#mindmap-container','Delete'); await expectNodes(2);
    await key('#mindmap-container','Z',{metaKey:true}); await expectNodes(3);
    await key('#mindmap-container','z',{metaKey:true,shiftKey:true}); await expectNodes(2);
    await key('#mindmap-container','z',{metaKey:true});
    await key('#mindmap-container','Tab');
    await page.waitForSelector('.km-edit-input'); await expectNodes(4);
    await page.locator('.km-edit-input').fill('New child');
    await page.locator('.km-edit-input').press('Enter');
    assert.equal(await page.locator('.km-edit-input').count(),0);
    assert.equal(await value('node-title'),'New child');
  }],
  ['inline editing respects IME and Shift+Tab without adding a node', async () => {
    await select('alpha'); await key('#mindmap-container','F2');
    await page.waitForSelector('.km-edit-input');
    await page.locator('.km-edit-input').fill('abcd');
    await page.locator('.km-edit-input').press('ArrowLeft');
    await page.locator('.km-edit-input').press('Backspace');
    assert.equal(await page.locator('.km-edit-input').inputValue(),'abd');
    assert.equal(await key('.km-edit-input','Enter',{isComposing:true}),false);
    assert.equal(await key('.km-edit-input','Tab',{shiftKey:true}),false);
    assert.equal(await key('.km-edit-input','Enter',{ctrlKey:true}),false);
    await expectNodes(3);
    await page.locator('.km-edit-input').press('Shift+Tab');
    await page.waitForFunction(() => !document.querySelector('.km-edit-input'));
    await expectNodes(3);
  }],
  ['zoom uses bare keys; workbench-owned mod zoom chords are left alone', async () => {
    await select('alpha');
    const zoom = () => page.locator('#btn-zoom-value').textContent();
    const initial = await zoom();
    assert.equal(await key('#mindmap-container','='),true);
    assert.notEqual(await zoom(),initial);
    assert.equal(await key('#mindmap-container','-'),true);
    assert.equal(await zoom(),initial);
    assert.equal(await key('#mindmap-container','+',{shiftKey:true}),true);
    assert.notEqual(await zoom(),initial);
    assert.equal(await key('#mindmap-container','0'),true);
    assert.equal(await key('#mindmap-container','1'),true);
    assert.equal(await zoom(),initial); // readable view restores the baseline
    // Ctrl/Cmd+=/-/0/1 belong to the workbench: not handled, canvas zoom unchanged.
    const before = await zoom();
    for (const [k, options] of [['=',{metaKey:true}],['-',{metaKey:true}],['0',{ctrlKey:true}],['1',{ctrlKey:true}]]) {
      assert.equal(await key('#mindmap-container',k,options),false);
    }
    assert.equal(await zoom(),before);
    // Bare zoom keys must not fire while typing in the title field.
    await page.locator('#node-title').click();
    await key('#node-title','1');
    assert.equal(await zoom(),before);
  }],
  ['host-preempted find/clipboard chords still work on the canvas', async () => {
    await select('alpha');
    await preemptedKey('#mindmap-container','f',{ctrlKey:true});
    assert.equal(await page.locator('#search-bar').isVisible(),true);
    await page.locator('#search-input').press('Escape');
    await preemptedKey('#mindmap-container','c',{ctrlKey:true});
    await select('root');
    await preemptedKey('#mindmap-container','v',{ctrlKey:true});
    await expectNodes(4);
    assert.equal(await value('node-title'),'Alpha');
    // Undo/redo stay host-owned: a preempted Ctrl+Z must not touch the graph.
    await preemptedKey('#mindmap-container','z',{ctrlKey:true});
    await expectNodes(4);
    assert.equal(await value('node-title'),'Alpha');
    // ...including inside the title field (host performs document-level undo).
    await preemptedKey('#node-title','z',{metaKey:true});
    assert.equal(await value('node-title'),'Alpha');
    await expectNodes(4);
  }],
  ['error overlay keeps Tab and other keys native', async () => {
    await page.evaluate(() => window.postMessage({type:'documentReplaced',text:'{invalid json'},'*'));
    await page.waitForSelector('#error-overlay:not(.hidden)');
    assert.equal(await key('body','Tab'),false);
    assert.equal(await key('body','Delete'),false);
    assert.equal(await key('body','ArrowDown'),false);
    await preemptedKey('body','f',{metaKey:true});
    assert.equal(await page.locator('#search-bar').isVisible(),false);
  }],
];
try {
  let passed=0;
  for (const [name, test] of tests) {
    await reset();
    try { await test(); console.log(`✓ ${name}`); passed++; }
    catch (error) { console.error(`✗ ${name}\n${error.stack}`); process.exitCode=1; }
  }
  assert.deepEqual(errors, [], 'No webview runtime errors');
  console.log(`${passed}/${tests.length} keyboard browser tests passed`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
