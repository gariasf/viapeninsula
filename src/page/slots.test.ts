import { describe, expect, it } from 'vitest';
import { foreignBrowsers } from './slots.ts';

const CHROMIUM = '/Users/x/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHELL = '/Users/x/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const ps = (...rows: [number, number, string][]) => ['  PID  PPID COMMAND', ...rows.map(([pid, ppid, c]) => `${pid} ${ppid} ${c}`)].join('\n');

describe('foreignBrowsers', () => {
  it("counts a running Chromium 1223 batch, whose path says Google Chrome for Testing, and a headless shell's", () => {
    expect(foreignBrowsers(ps([10, 1, `${CHROMIUM} --headless --use-angle=metal`], [20, 1, `${SHELL} --headless`]), new Set())).toBe(2);
  });

  it("counts each browser once, not its helpers, nor its crash handlers, which outlive it", () => {
    const helpers = CHROMIUM.replace('MacOS/Google Chrome for Testing', 'Frameworks/Google Chrome for Testing Framework.framework/Versions/148.0.7778.96/Helpers');
    expect(foreignBrowsers(ps([10, 1, `${CHROMIUM} --headless`], [11, 10, `${helpers}/Google Chrome for Testing Helper (GPU).app/Contents/MacOS/Google Chrome for Testing Helper (GPU) --type=gpu-process`], [12, 1, `${helpers}/chrome_crashpad_handler --monitor-self --database=/x`]), new Set())).toBe(1);
  });

  it("leaves out the user's own Chrome, by its path, even one a Playwright MCP drives", () => {
    expect(foreignBrowsers(ps([30, 1, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/Users/x/Library/Caches/ms-playwright-mcp/mcp-chrome-1']), new Set())).toBe(0);
  });

  it('leaves out the browsers that slot holders launched, which their slots already count', () => {
    expect(foreignBrowsers(ps([10, 500, `${CHROMIUM} --headless`], [20, 600, `${CHROMIUM} --headless`]), new Set([500]))).toBe(1);
  });

  it('leaves out commands that only name a browser, as a grep or a node script does', () => {
    expect(foreignBrowsers(ps([40, 1, `grep ms-playwright`], [41, 1, `node run.mjs --tag ms-playwright-chrome-headless-shell-equivalent`]), new Set())).toBe(0);
  });
});
