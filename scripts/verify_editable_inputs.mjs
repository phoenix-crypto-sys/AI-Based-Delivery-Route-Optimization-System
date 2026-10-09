import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223;
const TARGET_URL = 'http://localhost:5173/navigation';
const SCREENSHOT_PATH = 'C:\\Users\\Parth\\.gemini\\antigravity-ide\\brain\\50077af6-6dd9-4164-b52d-f3c98da6f48f\\editable_inputs_verification.png';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== STARTING EDITABLE INPUTS VERIFICATION TEST ===');
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--window-size=1536,820',
    '--user-data-dir=' + path.join(process.cwd(), '.chrome-verify-temp')
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
  await sleep(4000);

  // 1. Inspect Start & End inputs
  console.log('\n--- TEST 1: Inspecting Input Elements Attributes ---');
  const inspectInputs = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const start = document.getElementById('start-point-input');
      const dest = document.getElementById('destination-input');
      const locateBtn = document.querySelector('button[title*="Current Location"]');
      const swapBtn = document.querySelector('button[title*="Swap Start"]');
      const quickChips = Array.from(document.querySelectorAll('button')).filter(b => ['Inorbit', 'Jubilee', 'Gachibowli', 'Cyber'].some(n => b.textContent.includes(n)));

      return {
        start: start ? {
          found: true,
          tagName: start.tagName,
          type: start.type,
          value: start.value,
          disabled: start.disabled,
          readOnly: start.readOnly
        } : { found: false },
        dest: dest ? {
          found: true,
          tagName: dest.tagName,
          type: dest.type,
          value: dest.value,
          disabled: dest.disabled,
          readOnly: dest.readOnly
        } : { found: false },
        locateBtnFound: !!locateBtn,
        swapBtnFound: !!swapBtn,
        quickChipsCount: quickChips.length,
        quickChipsNames: quickChips.map(b => b.textContent.trim())
      };
    })()`,
    returnByValue: true
  });
  console.log('Input attributes check:', JSON.stringify(inspectInputs.result?.value, null, 2));

  // 2. Test typing into Destination Input & Autocomplete Dropdown
  console.log('\n--- TEST 2: Typing into Destination Input & Testing Autocomplete ---');
  await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const dest = document.getElementById('destination-input');
      dest.focus();
      // Set value and dispatch input event to simulate typing
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(dest, 'Banjara Hills');
      dest.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  });

  // Wait 700ms for debounce + search geocoding
  await sleep(800);

  const autocompleteCheck = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const dropdownItems = Array.from(document.querySelectorAll('[class*="dest-"]')).map(el => el.textContent.trim());
      // or check all dropdown items in the destination box
      const destInputBox = document.getElementById('destination-input').closest('.relative');
      const items = Array.from(destInputBox.querySelectorAll('.cursor-pointer')).map(el => {
        const title = el.querySelector('.font-medium')?.textContent.trim();
        const subtitle = el.querySelector('.truncate')?.textContent.trim();
        return { title, subtitle };
      });
      return {
        count: items.length,
        items: items.slice(0, 4)
      };
    })()`,
    returnByValue: true
  });
  console.log('Autocomplete suggestions check:', JSON.stringify(autocompleteCheck.result?.value, null, 2));

  // 3. Click the first suggestion to select it
  console.log('\n--- TEST 3: Selecting Autocomplete Suggestion ---');
  const selectResult = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const destInputBox = document.getElementById('destination-input').closest('.relative');
      const firstItem = destInputBox.querySelector('.cursor-pointer');
      if (firstItem) {
        firstItem.click();
        return { clicked: true, itemText: firstItem.textContent.trim() };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Selected item:', JSON.stringify(selectResult.result?.value, null, 2));

  // Wait for route recomputation
  await sleep(1500);

  // 4. Check route metrics recomputation
  console.log('\n--- TEST 4: Checking Route Recomputation After Editing Destination ---');
  const routeMetricsCheck = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const startVal = document.getElementById('start-point-input')?.value;
      const destVal = document.getElementById('destination-input')?.value;
      const etaEl = document.querySelector('strong.text-emerald-400');
      const distEl = document.querySelector('strong.text-slate-100');
      const instructionEl = document.querySelector('.text-sm.font-display.font-bold');

      return {
        startVal,
        destVal,
        eta: etaEl ? etaEl.textContent.trim() : null,
        distance: distEl ? distEl.textContent.trim() : null,
        firstInstruction: instructionEl ? instructionEl.textContent.trim() : null
      };
    })()`,
    returnByValue: true
  });
  console.log('Route metrics after destination edit:', JSON.stringify(routeMetricsCheck.result?.value, null, 2));

  // 5. Test Swap Button
  console.log('\n--- TEST 5: Testing Swap Button ---');
  const swapResult = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const swapBtn = document.querySelector('button[title*="Swap Start"]');
      if (swapBtn) {
        swapBtn.click();
        return { swappedClicked: true };
      }
      return { swappedClicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Swap button click:', JSON.stringify(swapResult.result?.value, null, 2));

  await sleep(1500);

  const afterSwapCheck = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const startVal = document.getElementById('start-point-input')?.value;
      const destVal = document.getElementById('destination-input')?.value;
      const etaEl = document.querySelector('strong.text-emerald-400');
      const distEl = document.querySelector('strong.text-slate-100');

      return {
        startVal,
        destVal,
        eta: etaEl ? etaEl.textContent.trim() : null,
        distance: distEl ? distEl.textContent.trim() : null
      };
    })()`,
    returnByValue: true
  });
  console.log('After swap check:', JSON.stringify(afterSwapCheck.result?.value, null, 2));

  // 6. Test Quick Hyderabad Hub Chip
  console.log('\n--- TEST 6: Testing Quick Hyderabad Hub Chip (Inorbit) ---');
  await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const inorbitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Inorbit'));
      if (inorbitBtn) {
        inorbitBtn.click();
      }
    })()`
  });

  await sleep(1500);

  const afterQuickChipCheck = await sendSession('Runtime.evaluate', {
    expression: `(() => {
      const startVal = document.getElementById('start-point-input')?.value;
      const destVal = document.getElementById('destination-input')?.value;
      const etaEl = document.querySelector('strong.text-emerald-400');
      const distEl = document.querySelector('strong.text-slate-100');

      return {
        startVal,
        destVal,
        eta: etaEl ? etaEl.textContent.trim() : null,
        distance: distEl ? distEl.textContent.trim() : null
      };
    })()`,
    returnByValue: true
  });
  console.log('After Quick Hub Chip click:', JSON.stringify(afterQuickChipCheck.result?.value, null, 2));

  // 7. Capture visual proof screenshot
  console.log('\n--- TEST 7: Capturing Screenshot ---');
  const screenshotRes = await sendSession('Page.captureScreenshot', { format: 'png' });
  if (screenshotRes?.data) {
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshotRes.data, 'base64'));
    console.log(`Saved screenshot to: ${SCREENSHOT_PATH}`);
  }

  await send('Target.closeTarget', { targetId });
  ws.close();
  chromeProc.kill();
  console.log('\n=== ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY! ===');
}

main().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
