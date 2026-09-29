import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { doctor } from './doctor';

/**
 * Process exit codes of the `exadev-config` command.
 */
export const EXIT_CODES = { clean: 0, unowned: 1, failed: 2 } as const;

/**
 * Where the command writes, so a caller can capture the output.
 */
export interface CommandOutput {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

const USAGE = `Usage: exadev-config doctor [--cwd <directory>] [--section <name>]... [--require-config]

Reports the sections in exadev.config.ts that no installed or listed tool owns.

  --cwd <directory>   Directory that holds exadev.config.ts and package.json. Defaults to the current directory.
  --section <name>    Treat <name> as owned. Repeatable.
  --require-config    Fail (exit status ${String(EXIT_CODES.failed)}) when the directory has no exadev.config.ts, instead of reporting that nothing was checked and succeeding.
  --help              Show this message.

Exit status: ${String(EXIT_CODES.clean)} when every section is owned (or there is no exadev.config.ts to check, unless --require-config is given), ${String(EXIT_CODES.unowned)} when some is not, ${String(EXIT_CODES.failed)} when the command could not run.
`;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runDoctor(args: readonly string[], output: CommandOutput): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: { cwd: { type: 'string' }, section: { type: 'string', multiple: true }, 'require-config': { type: 'boolean' }, help: { type: 'boolean' } },
    allowPositionals: false,
  });
  if (values.help === true) {
    output.stdout(USAGE);

    return EXIT_CODES.clean;
  }
  const cwd = resolve(values.cwd ?? process.cwd());
  const report = await doctor({ cwd, listed: values.section ?? [] });
  if (report.outcome !== 'checked') {
    if (report.outcome === 'empty') {
      output.stdout(`${cwd}: the exadev config file in this directory is empty, so nothing was checked.\n`);

      return EXIT_CODES.clean;
    }
    const message = `${cwd}: no exadev config file was found in this directory, so nothing was checked. The command does not search parent directories.\n`;
    if (values['require-config'] === true) {
      output.stderr(message);

      return EXIT_CODES.failed;
    }
    output.stdout(message);

    return EXIT_CODES.clean;
  }
  if (report.unowned.length === 0) {
    return EXIT_CODES.clean;
  }
  for (const name of report.unowned) {
    output.stderr(`${report.file}: section '${name}' is not owned by any installed or listed tool. Known sections: ${report.known.join(', ')}.\n`);
  }

  return EXIT_CODES.unowned;
}

/**
 * Run the `exadev-config` command with the arguments after the program name and return the exit code. A failure to run (missing or unknown command, unknown option, unloadable config) is reported on `stderr` and returns {@link EXIT_CODES}`.failed`.
 */
export async function runCommand(args: readonly string[], output: CommandOutput): Promise<number> {
  try {
    const [command, ...rest] = args;
    if (command === 'doctor') {
      return await runDoctor(rest, output);
    }
    if (command === '--help') {
      output.stdout(USAGE);

      return EXIT_CODES.clean;
    }
    if (command === undefined) {
      throw new TypeError(`missing command\n\n${USAGE}`);
    }
    throw new TypeError(`unknown command '${command}'\n\n${USAGE}`);
  } catch (error) {
    output.stderr(`${messageOf(error)}\n`);

    return EXIT_CODES.failed;
  }
}
