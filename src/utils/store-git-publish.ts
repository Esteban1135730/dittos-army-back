import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const STORE_CATALOG_FILES = [
  'public/inventory.json',
  'public/upcoming.json',
] as const;

export const STORE_PUBLISH_PATHS = [
  ...STORE_CATALOG_FILES,
  'public/assets',
] as const;

export type StoreGitPublishResult = {
  published: boolean;
  pushed: boolean;
  commit?: string;
  branch: string;
  repoPath: string;
  skippedReason?: string;
  error?: string;
};

export type StoreGitPublishOptions = {
  repoPath: string;
  branch?: string;
  commitMessage?: string;
  runGit?: typeof runGitCommand;
};

async function runGitCommand(
  repoPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: repoPath,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

export function resolveStoreRepoPath(cwd = process.cwd()): string {
  return (
    process.env.STORE_REPO_PATH || path.join(cwd, '..', 'dittos-army-store')
  );
}

export function resolveStorePublishBranch(): string {
  return process.env.STORE_PUBLISH_BRANCH || 'main';
}

export function isStoreAutoPublishEnabled(): boolean {
  const raw = process.env.STORE_AUTO_PUBLISH;
  if (raw == null || raw.trim() === '') return true;
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

function defaultCommitMessage(): string {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  return `chore(store): actualizar catálogo ${stamp}`;
}

export async function publishStoreCatalogToGit(
  options: StoreGitPublishOptions,
): Promise<StoreGitPublishResult> {
  const repoPath = path.resolve(options.repoPath);
  const branch = options.branch || resolveStorePublishBranch();
  const runGit = options.runGit ?? runGitCommand;
  const base: StoreGitPublishResult = {
    published: false,
    pushed: false,
    branch,
    repoPath,
  };

  try {
    await runGit(repoPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return {
      ...base,
      error: `No es un repositorio git: ${repoPath}`,
    };
  }

  const status = await runGit(repoPath, [
    'status',
    '--porcelain',
    '--',
    ...STORE_PUBLISH_PATHS,
  ]);

  if (!status.stdout) {
    return {
      ...base,
      skippedReason:
        'Sin cambios en inventory.json, upcoming.json ni public/assets',
    };
  }

  await runGit(repoPath, ['add', '--', ...STORE_PUBLISH_PATHS]);

  const message = options.commitMessage || defaultCommitMessage();
  const commit = await runGit(repoPath, ['commit', '-m', message]);
  const commitHash = commit.stdout.split('\n')[0]?.trim();

  await runGit(repoPath, ['push', 'origin', branch]);

  return {
    ...base,
    published: true,
    pushed: true,
    commit: commitHash || undefined,
  };
}
