#!/usr/bin/env node
import { runCommand } from './doctor-command';

process.exitCode = await runCommand(process.argv.slice(2), {
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
});
