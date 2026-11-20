// Headless Chrome playtest runner used by the studio agent's `playtest` tool.
// Usage: node playtest.mjs <index.html> <shots_dir> '<actions json>'
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , GAME, SHOTS, ACTIONS = '[]'] = process.argv;
const port = 9400 + Math.floor(Math.random() * 400);
const profile = join(tmpdir(), `studio-chrome-${port}`);
mkdirSync(SHOTS, { recursive: true });

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1200,800', '--allow-file-access-from-files', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = { errors: [], results: [], shots: [] };
let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise(res => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});
const codeFor = k => (k.length === 1 ? (/[a-z]/i.test(k) ? 'Key' + k.toUpperCase() : /\d/.test(k) ? 'Digit' + k : k) : k);

function finish(code = 0) {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 300);
  console.log(JSON.stringify(out, null, 1));
  process.exit(code);
}
setTimeout(() => { out.errors.push('playtest timed out after 150s'); finish(1); }, 150000);

(async () => {
  let targets;
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(300); }
  }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') {
      const e = d.params.exceptionDetails;
      out.errors.push(`exception: ${e.exception?.description || e.text} (line ${e.lineNumber})`);
    }
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
      out.errors.push('console.error: ' + d.params.args.map(a => a.value ?? a.description).join(' '));
    }
  };
  await new Promise(r => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'file://' + GAME });
  await sleep(1200);

  let actions;
  try { actions = JSON.parse(ACTIONS); } catch (e) { out.errors.push('bad actions_json: ' + e.message); finish(1); return; }

  for (const step of actions) {
    if (step.press) {
      const k = step.press, code = codeFor(k);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k.length === 1 ? k : undefined });
      await sleep(50);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
      await sleep(60);
    } else if (step.key) {
      const code = codeFor(step.key);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: step.key, code });
      await sleep(step.ms || 300);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: step.key, code });
      await sleep(60);
    } else if (step.wait) {
      await sleep(step.wait);
    } else if (step.eval) {
      const r = await send('Runtime.evaluate', { expression: step.eval, returnByValue: true });
      const ex = r.result?.exceptionDetails;
      out.results.push(ex ? { eval: step.eval, error: ex.exception?.description || ex.text } : { eval: step.eval, value: r.result?.result?.value });
    } else if (step.shot) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const name = String(step.shot).replace(/[^\w-]/g, '_');
      writeFileSync(join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64'));
      out.shots.push(`/playtest/${name}.png`);
    }
  }
  await sleep(300);
  finish(0);
})().catch(e => { out.errors.push('runner: ' + e.message); finish(1); });
