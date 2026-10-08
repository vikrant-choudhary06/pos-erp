import { BrowserWindow } from 'electron';

// Bills and KOTs go straight to the printer without the print dialog. The
// POS builds the receipt HTML; here it is loaded into a hidden window and
// sent to the bill or kitchen printer picked in settings (Windows default
// when none is picked).

export async function printSilently(html: string, deviceName: string) {
  const win = new BrowserWindow({
    show: false,
    width: 320,
    height: 600,
    webPreferences: { javascript: false, sandbox: true },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        { silent: true, deviceName: deviceName || undefined, margins: { marginType: 'none' } },
        (ok, reason) => (ok ? resolve() : reject(new Error(reason || 'Printing failed'))),
      );
    });
  } finally {
    win.destroy();
  }
}
