import { describe, expect, it, vi } from 'vitest';

import { EXIT_CODES, runCommand } from './doctor-command';

vi.mock('./doctor', () => ({ doctor: vi.fn().mockRejectedValue('plain text') }));

describe('runCommand', () => {
  it('reports the text of a thrown value that is not an error, and fails', async () => {
    let stderr = '';
    const code = await runCommand(['doctor'], {
      stdout: () => undefined,
      stderr: (text) => {
        stderr += text;
      },
    });

    expect(code).toBe(EXIT_CODES.failed);
    expect(stderr).toBe('plain text\n');
  });
});
