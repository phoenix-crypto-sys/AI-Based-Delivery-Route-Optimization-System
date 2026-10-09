import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const TARGET_URL = process.argv[2] || 'http://localhost:5173/navigation';
const SCREENSHOT_PATH = process.argv[3] || 'C:\\Users\\Parth\\.gemini\\antigravity-ide\\brain\\50077af6-6dd9-4164-b52d-f3c98da6f48f\\cdp_screenshot.png';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Starting headless Chrome on port ${PORT}...`);
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--window-size=1536,800',
    '--user-data-dir=' + path.join(process.cwd(), '.chrome-temp')
  ]);

  chromeProc.on('error', (err) => console.error('Failed to spawn Chrome:', err));

  // Wait for Chrome to listen
  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      const resp = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (resp.ok) {
        const data = await resp.json();
        wsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Could not connect to Chrome DevTools port.');
    chromeProc.kill();
    process.exit(1);
  }

  console.log('Connected to Chrome DevTools:', wsUrl);
  const ws = new WebSocket(wsUrl);

  let msgId = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      const resolve = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      resolve(msg.result);
      return;
    }

    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      console.log(`[Browser Console ${msg.params.type.toUpperCase()}] ${args}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.error(`[Browser Exception] ${msg.params.exceptionDetails?.text} ${msg.params.exceptionDetails?.exception?.description || ''}`);
    } else if (msg.method === 'Network.loadingFailed') {
      console.warn(`[Network Failed] ${msg.params.errorText}: ${msg.params.canceled ? 'canceled' : ''}`);
    }
  };

  await new Promise(resolve => ws.onopen = resolve);

  // Create a new target / page
  const targetRes = await send('Target.createTarget', { url: 'about:blank' });
  const targetId = targetRes.targetId;

  // Attach to target
  const attachRes = await send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attachRes.sessionId;

  function sendSession(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, sessionId, method, params }));
    });
  }

  await sendSession('Page.enable');
  await sendSession('Runtime.enable');
  await sendSession('Network.enable');

  console.log(`Navigating to ${TARGET_URL}...`);
  await sendSession('Page.navigate', { url: TARGET_URL });

  // Wait 4 seconds for map, tiles, and layers to load
  console.log('Waiting 4.5s for page and map rendering...');
  await sleep(4500);

  // Inspect the DOM for map container and canvas
  const domInspect = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const mapDiv = document.querySelector('.maplibregl-map') || document.querySelector('[class*="map"]') || document.querySelector('canvas')?.parentElement;
      const canvas = document.querySelector('canvas.maplibregl-canvas') || document.querySelector('canvas');
      const root = document.getElementById('root');
      return {
        rootDimensions: root ? { width: root.offsetWidth, height: root.offsetHeight } : null,
        mapDivFound: !!mapDiv,
        mapDivClasses: mapDiv ? mapDiv.className : null,
        mapDivStyle: mapDiv ? {
          width: mapDiv.offsetWidth,
          height: mapDiv.offsetHeight,
          clientWidth: mapDiv.clientWidth,
          clientHeight: mapDiv.clientHeight
        } : null,
        canvasFound: !!canvas,
        canvasSize: canvas ? { width: canvas.width, height: canvas.height, styleWidth: canvas.style.width, styleHeight: canvas.style.height } : null
      };
    })()`,
    returnByValue: true
  });

  console.log('DOM & Canvas Inspection Result:');
  console.log(JSON.stringify(domInspect.result?.value, null, 2));

  // Capture screenshot
  console.log(`Capturing screenshot to ${SCREENSHOT_PATH}...`);
  const screenshotRes = await sendSession('Page.captureScreenshot', { format: 'png' });
  if (screenshotRes && screenshotRes.data) {
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshotRes.data, 'base64'));
    const stats = fs.statSync(SCREENSHOT_PATH);
    console.log(`Screenshot saved successfully! Size: ${stats.size} bytes (${(stats.size/1024).toFixed(1)} KB)`);
  } else {
    console.error('Failed to capture screenshot');
  }

  await send('Target.closeTarget', { targetId });
  ws.close();
  chromeProc.kill();
  console.log('Diagnostics complete.');
}

main().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
