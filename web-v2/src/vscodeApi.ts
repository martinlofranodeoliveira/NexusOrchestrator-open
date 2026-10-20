import { isBrowserRuntime } from './runtime';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

export const vscode: { postMessage(msg: unknown): void } = isBrowserRuntime
  ? { postMessage: (msg: unknown) => {
      console.log('[vscode.postMessage]', msg);
      window.dispatchEvent(new CustomEvent('vscode-msg', { detail: msg }));
    } 
  }
  : (acquireVsCodeApi() as { postMessage(msg: unknown): void });
