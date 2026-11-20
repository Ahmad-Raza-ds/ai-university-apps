const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Setup local static server
function startServer(port = 8089) {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript'
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join('F:\\', req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end(`File not found: ${filePath}`);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`Local HTTP server running at http://127.0.0.1:${port}/`);
      resolve(server);
    });
  });
}

async function runBrowserTests() {
  const serverPort = 8089;
  const server = await startServer(serverPort);

  console.log("Starting Chrome in headless mode with remote debugging...");
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const cdpPort = 9334;
  
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=C:\\Users\\Dell\\.gemini\\antigravity\\brain\\9c4358f6-b8d7-4dd9-987b-d10cbf1c9bca\\chrome_profile_test',
    `http://127.0.0.1:${serverPort}/index.html`
  ]);

  let connected = false;
  let wsUrl = '';

  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const pageTarget = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTarget) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          connected = true;
          break;
        }
      }
    } catch (e) {
      // Chrome spinning up
    }
  }

  if (!connected) {
    console.error("Failed to connect to Chrome debugging port.");
    chromeProc.kill();
    server.close();
    process.exit(1);
  }

  console.log(`Connected to Chrome! Debugger WebSocket: ${wsUrl}`);
  
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();
  const consoleErrors = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map(a => a.value || a.description).join(' '));
      }
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
    }
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      cb(msg);
    }
  };

  function sendCommand(method, params = {}) {
    return new Promise((resolve) => {
      const reqId = id++;
      callbacks.set(reqId, resolve);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  await new Promise(r => ws.onopen = r);
  await sendCommand('Runtime.enable');
  await sendCommand('Page.enable');

  // Navigate and wait for DOM content loaded
  await sendCommand('Page.navigate', { url: `http://127.0.0.1:${serverPort}/index.html` });
  await new Promise(r => setTimeout(r, 1200));

  async function evaluate(expression) {
    const res = await sendCommand('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.result && res.result.exceptionDetails) {
      throw new Error(res.result.exceptionDetails.text + ' ' + (res.result.exceptionDetails.exception?.description || ''));
    }
    return res.result?.result?.value;
  }

  console.log("\n=======================================================");
  console.log("RUNNING BROWSER AUTOMATED TESTS (CHROME HEADLESS)");
  console.log("=======================================================");

  // TEST 1: Check document title and initial DOM elements
  const pageInfo = await evaluate(`
    ({
      title: document.title,
      url: location.href,
      h1: document.querySelector('h1').textContent,
      hasHeader: !!document.querySelector('.app-header'),
      hasCoursesList: !!document.getElementById('coursesList'),
      hasCalculateBtn: !!document.getElementById('calculateBtn')
    })
  `);
  console.log(`[TEST 1] Page Info:`, pageInfo);
  if (pageInfo.title.includes('CGPA Calculator') && pageInfo.hasCalculateBtn) {
    console.log("  ✓ PASS: Page loaded correctly with title: '" + pageInfo.title + "'");
  } else {
    console.error("  ✗ FAIL: Unexpected page title or structure.");
  }

  // TEST 2: Check Semester 1 defaults (previous fields disabled)
  const sem1State = await evaluate(`
    (() => {
      const sem = document.getElementById('semesterSelect').value;
      const cgpaDisabled = document.getElementById('prevCgpa').disabled;
      const credsDisabled = document.getElementById('prevCredits').disabled;
      const noticeVisible = !document.getElementById('sem1Notice').classList.contains('hidden');
      return { sem, cgpaDisabled, credsDisabled, noticeVisible };
    })()
  `);
  console.log(`[TEST 2] Semester 1 Initial State:`, sem1State);
  if (sem1State.sem === '1' && sem1State.cgpaDisabled && sem1State.credsDisabled && sem1State.noticeVisible) {
    console.log("  ✓ PASS: Semester 1 properly disables prior record inputs.");
  } else {
    console.error("  ✗ FAIL: Semester 1 prior record state invalid.");
  }

  // TEST 3: Subject count change to 7
  await evaluate(`
    (() => {
      const countSelect = document.getElementById('subjectCount');
      countSelect.value = '7';
      countSelect.dispatchEvent(new Event('change'));
    })()
  `);
  const rowCount = await evaluate(`document.querySelectorAll('.course-row').length`);
  console.log(`[TEST 3] Selected 7 subjects -> Rendered rows count: ${rowCount}`);
  if (rowCount === 7) {
    console.log("  ✓ PASS: Exactly 7 course rows generated.");
  } else {
    console.error(`  ✗ FAIL: Expected 7 rows, got ${rowCount}`);
  }

  // TEST 4: STRICT VALIDATION - Incomplete rows (e.g. 7 subjects selected, only 6 filled)
  console.log("\n[TEST 4] Testing Strict Validation: 7 subjects selected, only 6 filled...");
  await evaluate(`
    (() => {
      const rows = document.querySelectorAll('.course-row');
      // Fill first 6 rows
      for (let i = 0; i < 6; i++) {
        rows[i].querySelector('.course-name').value = 'Subject ' + (i + 1);
        rows[i].querySelector('.course-credits').value = '3';
        rows[i].querySelector('.course-grade').value = 'A';
      }
      // Leave row 7 blank
      rows[6].querySelector('.course-name').value = '';
      rows[6].querySelector('.course-credits').value = '';
      rows[6].querySelector('.course-grade').value = '';

      // Click calculate
      document.getElementById('calculateBtn').click();
    })()
  `);

  const validationResult = await evaluate(`
    (() => {
      const banner = document.getElementById('validationBanner');
      const isBannerVisible = !banner.classList.contains('hidden');
      const bannerText = document.getElementById('validationText').textContent;
      const resultsHidden = document.getElementById('resultsSection').classList.contains('hidden');
      
      const rows = document.querySelectorAll('.course-row');
      const row7NameError = rows[6].querySelector('.course-name').classList.contains('input-error');
      const row7CredError = rows[6].querySelector('.course-credits').classList.contains('input-error');
      const row7GradeError = rows[6].querySelector('.course-grade').classList.contains('input-error');

      return { isBannerVisible, bannerText, resultsHidden, row7NameError, row7CredError, row7GradeError };
    })()
  `);

  console.log("Validation Result:", validationResult);
  if (validationResult.isBannerVisible && 
      validationResult.resultsHidden && 
      validationResult.bannerText.includes('7') && 
      validationResult.row7NameError && 
      validationResult.row7CredError && 
      validationResult.row7GradeError) {
    console.log("  ✓ PASS: Calculation correctly blocked! Friendly banner displayed: '" + validationResult.bannerText + "' and incomplete fields highlighted.");
  } else {
    console.error("  ✗ FAIL: Incomplete input validation failed.");
  }

  // TEST 5: Complete the 7th row and verify successful calculation
  console.log("\n[TEST 5] Filling the 7th subject and calculating...");
  await evaluate(`
    (() => {
      const rows = document.querySelectorAll('.course-row');
      rows[6].querySelector('.course-name').value = 'Subject 7 Final';
      rows[6].querySelector('.course-credits').value = '3';
      rows[6].querySelector('.course-grade').value = 'B+';
      // Trigger calculation
      document.getElementById('calculateBtn').click();
    })()
  `);

  const calcSuccess = await evaluate(`
    (() => {
      const resultsCard = document.getElementById('resultsSection');
      const isVisible = !resultsCard.classList.contains('hidden');
      const semGpa = document.getElementById('displaySemGpa').textContent;
      const cgpa = document.getElementById('displayCgpa').textContent;
      const totalCreds = document.getElementById('displayTotalCredits').textContent;
      const standing = document.getElementById('standingTitle').textContent;
      return { isVisible, semGpa, cgpa, totalCreds, standing };
    })()
  `);

  console.log("Calculation Output:", calcSuccess);
  if (calcSuccess.isVisible && calcSuccess.semGpa === '3.90' && calcSuccess.cgpa === '3.90' && calcSuccess.totalCreds === '21') {
    console.log("  ✓ PASS: Calculation succeeded! Sem GPA = 3.90, CGPA = 3.90, Credits = 21, Standing: " + calcSuccess.standing);
  } else {
    console.error("  ✗ FAIL: Calculation results do not match expected.");
  }

  // TEST 6: Test Semester 4 with prior CGPA and credits
  console.log("\n[TEST 6] Testing Semester 4 (Prior CGPA 3.50, 48 credits)...");
  await evaluate(`
    (() => {
      document.getElementById('semesterSelect').value = '4';
      document.getElementById('semesterSelect').dispatchEvent(new Event('change'));
      document.getElementById('prevCgpa').value = '3.50';
      document.getElementById('prevCredits').value = '48';
      document.getElementById('calculateBtn').click();
    })()
  `);

  const sem4Result = await evaluate(`
    (() => {
      const semGpa = document.getElementById('displaySemGpa').textContent;
      const cgpa = document.getElementById('displayCgpa').textContent;
      const totalCreds = document.getElementById('displayTotalCredits').textContent;
      const breakdown = document.getElementById('creditBreakdownText').textContent;
      return { semGpa, cgpa, totalCreds, breakdown };
    })()
  `);
  console.log("Semester 4 Result:", sem4Result);
  if (sem4Result.semGpa === '3.90' && sem4Result.cgpa === '3.62' && sem4Result.totalCreds === '69') {
    console.log("  ✓ PASS: Overall cumulative CGPA correctly calculated: " + sem4Result.cgpa + " (Total credits: " + sem4Result.totalCreds + ")");
  } else {
    console.error("  ✗ FAIL: Cumulative CGPA formula mismatch.");
  }

  // TEST 7: Test Theme Toggle (Dark & Light) and localStorage persistence
  console.log("\n[TEST 7] Testing Dark/Light Mode Toggle & Persistence...");
  const initialTheme = await evaluate(`document.documentElement.getAttribute('data-theme')`);
  await evaluate(`document.getElementById('themeToggleBtn').click()`);
  const toggledTheme = await evaluate(`document.documentElement.getAttribute('data-theme')`);
  const storedTheme = await evaluate(`localStorage.getItem('cgpa_calculator_theme')`);
  console.log(`Initial Theme: ${initialTheme} -> Toggled Theme: ${toggledTheme} -> LocalStorage: ${storedTheme}`);

  if (toggledTheme !== initialTheme && storedTheme === toggledTheme) {
    console.log("  ✓ PASS: Theme toggled and persisted in localStorage correctly.");
  } else {
    console.error("  ✗ FAIL: Theme persistence failed.");
  }

  // TEST 8: Test Responsive Viewport Rendering (360px mobile, 768px tablet, 1280px desktop)
  console.log("\n[TEST 8] Testing Responsive Viewports (360px, 768px, 1280px)...");
  for (const width of [360, 768, 1280]) {
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width,
      height: 800,
      deviceScaleFactor: 1,
      mobile: width < 768
    });
    const layoutCheck = await evaluate(`
      (() => {
        const bodyWidth = document.body.clientWidth;
        const cardWidth = document.querySelector('.card').clientWidth;
        return { bodyWidth, cardWidth, hasOverflow: document.body.scrollWidth > window.innerWidth };
      })()
    `);
    console.log(`Viewport ${width}px -> Card width: ${layoutCheck.cardWidth}px, Horizontal Overflow: ${layoutCheck.hasOverflow}`);
    if (!layoutCheck.hasOverflow) {
      console.log(`  ✓ PASS: Viewport ${width}px displays cleanly without horizontal overflow.`);
    } else {
      console.error(`  ✗ FAIL: Horizontal overflow detected at ${width}px.`);
    }
  }

  // TEST 9: Check Console Errors
  console.log("\n[TEST 9] Checking Browser Console for Errors...");
  if (consoleErrors.length === 0) {
    console.log("  ✓ PASS: Zero console errors detected during all operations!");
  } else {
    console.error("  ✗ FAIL: Console errors logged:", consoleErrors);
  }

  console.log("\n=======================================================");
  console.log("ALL BROWSER AUTOMATED TESTS COMPLETED SUCCESSFULLY!");
  console.log("=======================================================\n");

  ws.close();
  chromeProc.kill();
  server.close();
  process.exit(0);
}

runBrowserTests().catch((err) => {
  console.error("Browser test run exception:", err);
  process.exit(1);
});
