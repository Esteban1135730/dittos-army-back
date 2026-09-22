import {
  isStoreAutoPublishEnabled,
  publishStoreCatalogToGit,
  type StoreGitPublishOptions,
} from './store-git-publish';

describe('isStoreAutoPublishEnabled', () => {
  const prev = process.env.STORE_AUTO_PUBLISH;

  afterEach(() => {
    if (prev === undefined) delete process.env.STORE_AUTO_PUBLISH;
    else process.env.STORE_AUTO_PUBLISH = prev;
  });

  it('está activo por defecto', () => {
    delete process.env.STORE_AUTO_PUBLISH;
    expect(isStoreAutoPublishEnabled()).toBe(true);
  });

  it('respeta STORE_AUTO_PUBLISH=false', () => {
    process.env.STORE_AUTO_PUBLISH = 'false';
    expect(isStoreAutoPublishEnabled()).toBe(false);
  });
});

describe('publishStoreCatalogToGit', () => {
  const repoPath = 'C:\\repos\\dittos-army-store';

  function setupGit(
    handlers: Record<string, string | Error>,
  ): StoreGitPublishOptions['runGit'] {
    return async (_cwd, args) => {
      const key = args.join(' ');
      const value = handlers[key];
      if (value instanceof Error) throw value;
      if (value === undefined) {
        throw new Error(`Comando git no mockeado: ${key}`);
      }
      return { stdout: value, stderr: '' };
    };
  }

  it('omite commit y push si no hay cambios', async () => {
    const runGit = jest.fn(
      setupGit({
        'rev-parse --is-inside-work-tree': 'true',
        'status --porcelain -- public/inventory.json public/upcoming.json public/assets':
          '',
      }),
    );

    const result = await publishStoreCatalogToGit({
      repoPath,
      runGit,
    });

    expect(result.published).toBe(false);
    expect(result.pushed).toBe(false);
    expect(result.skippedReason).toContain('Sin cambios');
    expect(runGit).toHaveBeenCalledTimes(2);
  });

  it('hace add, commit y push cuando hay cambios', async () => {
    const runGit = jest.fn(
      setupGit({
        'rev-parse --is-inside-work-tree': 'true',
        'status --porcelain -- public/inventory.json public/upcoming.json public/assets':
          ' M public/inventory.json',
        'add -- public/inventory.json public/upcoming.json public/assets': '',
        'commit -m chore(store): actualizar catálogo 2026-06-10 12:00': '',
        'push origin main': '',
      }),
    );

    const result = await publishStoreCatalogToGit({
      repoPath,
      branch: 'main',
      commitMessage: 'chore(store): actualizar catálogo 2026-06-10 12:00',
      runGit,
    });

    expect(result).toMatchObject({
      published: true,
      pushed: true,
      branch: 'main',
      repoPath,
    });
    expect(runGit).toHaveBeenCalledTimes(5);
  });

  it('devuelve error si la ruta no es un repo git', async () => {
    const runGit = jest.fn(async () => {
      throw new Error('not a git repository');
    });

    const result = await publishStoreCatalogToGit({
      repoPath,
      runGit,
    });

    expect(result.error).toContain('No es un repositorio git');
    expect(result.published).toBe(false);
  });
});
