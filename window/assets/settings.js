const form = document.getElementById('form');
const errorBox = document.getElementById('error');

function fill(select, printers, value) {
  select.innerHTML = '';
  const options = [['', 'Windows default printer'], ...printers.map((p) => [p, p])];
  for (const [v, text] of options) select.add(new Option(text, v, false, v === value));
}

function showStatus(status) {
  if (!status) return;
  document.getElementById('status').hidden = false;
  document.getElementById('dot').className = `dot ${status.mode}`;
  const mode = { online: 'Online', offline: 'Offline', syncing: 'Syncing' }[status.mode];
  const till = status.till ? ` · till ${status.till.code}` : ' · not set up as a till yet';
  const pending = status.pending ? ` · ${status.pending} waiting to sync` : '';
  document.getElementById('mode').textContent = mode + till + pending;

  const addresses = document.getElementById('addresses');
  addresses.innerHTML = '';
  const list = status.addresses.length ? status.addresses : [`http://localhost:${status.port}`];
  for (const a of list) {
    const code = document.createElement('code');
    code.textContent = `${a}/pos`;
    addresses.append(code, document.createElement('br'));
  }

  const failed = document.getElementById('failed');
  failed.innerHTML = '';
  document.getElementById('failedBox').hidden = !status.failed.length;
  for (const f of status.failed) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = f.label;
    const why = document.createElement('small');
    why.textContent = f.error || '';
    text.append(why);
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = 'Dismiss';
    dismiss.onclick = () => window.counter.dismiss(f.seq);
    li.append(text, dismiss);
    failed.append(li);
  }
}

const cleanError = (err) =>
  String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

async function init() {
  const { config, status } = await window.counter.load();
  form.cloudUrl.value = config.cloudUrl;
  form.port.value = config.port;
  form.startWithWindows.checked = config.startWithWindows;
  const printers = await window.counter.printers().catch(() => []);
  fill(form.billPrinter, printers, config.billPrinter);
  fill(form.kotPrinter, printers, config.kotPrinter);
  if (!config.cloudUrl) document.getElementById('save').textContent = 'Save and open POS';
  showStatus(status);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  const save = document.getElementById('save');
  save.disabled = true;
  try {
    const status = await window.counter.save({
      cloudUrl: form.cloudUrl.value,
      port: Number(form.port.value),
      billPrinter: form.billPrinter.value,
      kotPrinter: form.kotPrinter.value,
      startWithWindows: form.startWithWindows.checked,
    });
    showStatus(status);
    save.textContent = 'Saved';
    setTimeout(() => (save.textContent = 'Save'), 1500);
  } catch (err) {
    errorBox.textContent = cleanError(err);
  } finally {
    save.disabled = false;
  }
});

for (const button of document.querySelectorAll('[data-test]')) {
  button.addEventListener('click', async () => {
    errorBox.textContent = '';
    try {
      await window.counter.testPrint(button.dataset.test);
    } catch {
      errorBox.textContent = 'Could not print. Check the printer is on and connected.';
    }
  });
}

document.getElementById('sync').addEventListener('click', async (event) => {
  event.target.disabled = true;
  showStatus(await window.counter.syncNow());
  event.target.disabled = false;
});

window.counter.onStatus(showStatus);
init();
