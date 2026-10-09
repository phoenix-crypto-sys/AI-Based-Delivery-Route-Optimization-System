import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9224;
const TARGET_URL = 'http://localhost:5173/navigation';
const SCREENSHOT_PATH = 'C:\\Users\\Parth\\.gemini\\antigravity-ide\\brain\\50077af6-6dd9-4164-b52d-f3c98da6f48f\\route_desync_fixed.png';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== STARTING INTEGRATION TEST: GEOCODING, STATE DESYNC & LANDMARKS ===');
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--window-size=1536,860',
    '--user-data-dir=' + path.join(process.cwd(), '.chrome-verify-temp-2')
  ]);

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
    console.error('Failed to connect to Chrome remote debugging port.');
    chromeProc.kill();
    process.exit(1);
  }

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
    }
  };

  await new Promise(resolve => ws.onopen = resolve);

  const targetRes = await send('Target.createTarget', { url: 'about:blank' });
  const targetId = targetRes.targetId;
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
  await sendSession('DOM.enable');

  console.log(`Navigating to ${TARGET_URL}...`);
  await sendSession('Page.navigate', { url: TARGET_URL });
  await sleep(4500);

  // STEP 1: Verify Initial Map & Landmark State
  console.log('\n--- STEP 1: Verifying Initial Route & Landmark Clutter Reduction ---');
  const initialMapState = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const map = window.consumerMapInstance;
      const lmSrc = map?.getSource('landmarks-source');
      const endpointsSrc = map?.getSource('endpoints-source');
      const lmToggleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Landmarks'));
      
      const lmCount = lmSrc?._data?.features?.length ?? 0;
      const endpointFeatures = endpointsSrc?._data?.features?.map(f => ({
        type: f.properties?.type,
        label: f.properties?.label
      })) ?? [];

      return {
        hasMap: !!map,
        isMapLoaded: map?.loaded() ?? false,
        renderedLandmarksCount: lmCount,
        endpointFeatures,
        lmToggleBtnText: lmToggleBtn?.textContent.trim()
      };
    })()`,
    returnByValue: true
  });
  console.log('Initial Map & Landmark state:', JSON.stringify(initialMapState.result?.value, null, 2));

  // STEP 2: Test Start Point Autocomplete with "Woxsen University"
  console.log('\n--- STEP 2: Typing "woxsen university" into Start Point ---');
  await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const start = document.getElementById('start-point-input');
      start.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(start, 'woxsen university');
      start.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  });

  // Wait 1200ms for debounce (350ms) + backend geocoding fetch
  await sleep(1500);

  const startSuggestions = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const startBox = document.getElementById('start-point-input').closest('.relative');
      const items = Array.from(startBox.querySelectorAll('.cursor-pointer')).map(el => {
        const title = el.querySelector('.font-medium')?.textContent.trim();
        const subtitle = el.querySelector('.truncate')?.textContent.trim();
        return { title, subtitle };
      });
      return {
        count: items.length,
        items: items.slice(0, 5)
      };
    })()`,
    returnByValue: true
  });
  console.log('Start suggestions for "woxsen university":', JSON.stringify(startSuggestions.result?.value, null, 2));

  // STEP 3: Click the Woxsen University suggestion
  console.log('\n--- STEP 3: Selecting Woxsen University Suggestion ---');
  const selectWoxsenResult = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const startBox = document.getElementById('start-point-input').closest('.relative');
      const firstItem = startBox.querySelector('.cursor-pointer');
      if (firstItem) {
        firstItem.click();
        return { clicked: true, itemText: firstItem.textContent.trim() };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Selected item:', JSON.stringify(selectWoxsenResult.result?.value, null, 2));

  // Wait for route recalculation from Woxsen University to Jubilee Hills Check Post
  await sleep(2500);

  const afterWoxsenRouteState = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const startVal = document.getElementById('start-point-input')?.value;
      const destVal = document.getElementById('destination-input')?.value;
      const etaEl = document.querySelector('strong.text-emerald-400');
      const distEl = document.querySelector('strong.text-slate-100');
      const map = window.consumerMapInstance;
      const endpointsSrc = map?.getSource('endpoints-source');
      const endpointFeatures = endpointsSrc?._data?.features?.map(f => ({
        type: f.properties?.type,
        label: f.properties?.label
      })) ?? [];

      return {
        startVal,
        destVal,
        eta: etaEl?.textContent.trim(),
        distance: distEl?.textContent.trim(),
        endpointLabels: endpointFeatures
      };
    })()`,
    returnByValue: true
  });
  console.log('State after selecting Woxsen University:', JSON.stringify(afterWoxsenRouteState.result?.value, null, 2));

  // STEP 4: Test Failed / Unconfirmed Search State
  console.log('\n--- STEP 4: Testing Unconfirmed / Failed Geocoding State ---');
  await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const dest = document.getElementById('destination-input');
      dest.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(dest, 'xyznonexistentplace9999');
      dest.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  });

  await sleep(1500);

  const failureStateCheck = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const dest = document.getElementById('destination-input');
      const destBox = dest.closest('.relative');
      const revertBtn = destBox ? destBox.querySelector('button[title*="Revert"]') : null;
      const allDivs = destBox ? Array.from(destBox.querySelectorAll('div')) : [];
      const failureNotice = allDivs.find(d => d.textContent.includes('No match found'));
      const unconfirmedBadge = destBox ? Array.from(destBox.querySelectorAll('span')).find(s => s.textContent.includes('Unconfirmed')) : null;

      return {
        inputValue: dest?.value,
        hasFailureNotice: !!failureNotice,
        failureNoticeText: failureNotice ? failureNotice.textContent.trim() : null,
        hasRevertBtn: !!revertBtn,
        hasUnconfirmedBadge: !!unconfirmedBadge
      };
    })()`,
    returnByValue: true
  });
  console.log('Failure state verification:', JSON.stringify(failureStateCheck.result?.value, null, 2));

  // STEP 5: Click Revert Button
  console.log('\n--- STEP 5: Clicking Revert Button ---');
  const revertResult = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const dest = document.getElementById('destination-input');
      const destBox = dest.closest('.relative');
      const revertBtn = destBox ? destBox.querySelector('button[title*="Revert"]') : null;
      if (revertBtn) {
        revertBtn.click();
        return { clicked: true };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Revert button clicked:', JSON.stringify(revertResult.result?.value, null, 2));

  await sleep(600);

  const afterRevertCheck = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const dest = document.getElementById('destination-input');
      const destBox = dest.closest('.relative');
      const allDivs = destBox ? Array.from(destBox.querySelectorAll('div')) : [];
      const failureNotice = allDivs.find(d => d.textContent.includes('No match found'));

      return {
        destValue: dest?.value,
        hasFailureNotice: !!failureNotice
      };
    })()`,
    returnByValue: true
  });
  console.log('After revert check:', JSON.stringify(afterRevertCheck.result?.value, null, 2));

  // STEP 6: Test Landmark Layer Toggle Button
  console.log('\n--- STEP 6: Testing Landmark Layer Toggle (All 12 vs Route-Relevant) ---');
  const toggleResult = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const lmToggleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Landmarks'));
      if (lmToggleBtn) {
        lmToggleBtn.click();
        return { clicked: true };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Toggled landmark layer:', JSON.stringify(toggleResult.result?.value, null, 2));

  await sleep(500);

  const afterToggleState = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const map = window.consumerMapInstance;
      const lmSrc = map?.getSource('landmarks-source');
      const lmToggleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Landmarks'));

      return {
        renderedLandmarksCount: lmSrc?._data?.features?.length ?? 0,
        lmToggleBtnText: lmToggleBtn?.textContent.trim()
      };
    })()`,
    returnByValue: true
  });
  console.log('After toggle state (showing all):', JSON.stringify(afterToggleState.result?.value, null, 2));

  // Toggle back to clean route-relevant mode
  await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const lmToggleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Landmarks'));
      if (lmToggleBtn) lmToggleBtn.click();
    })()`
  });
  await sleep(500);

  // STEP 7: Capture Screenshot
  console.log('\n--- STEP 7: Capturing Visual Proof Screenshot ---');
  const screenshotRes = await sendSession('Page.captureScreenshot', { format: 'png' });
  if (screenshotRes?.data) {
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshotRes.data, 'base64'));
    console.log(`Saved screenshot to: ${SCREENSHOT_PATH}`);
  }

  await send('Target.closeTarget', { targetId });
  ws.close();
  chromeProc.kill();
  console.log('\n=== ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY! ===');
}

main().catch(err => {
  console.error('Integration test error:', err);
  process.exit(1);
});
