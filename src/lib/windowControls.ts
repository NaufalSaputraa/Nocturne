export type WindowAction = 'minimize' | 'toggleMaximize' | 'close';

export async function runWindowAction(action: WindowAction): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (action === 'minimize') await win.minimize();
    if (action === 'toggleMaximize') await win.toggleMaximize();
    if (action === 'close') await win.close();
  } catch {
    // Running inside Vite preview or Vitest without Tauri runtime
  }
}
