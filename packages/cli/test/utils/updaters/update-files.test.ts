import type { Config } from '../../../src/utils/get-config'
import os from 'node:os'
import fs from 'fs-extra'
import path from 'pathe'
import { describe, expect, it } from 'vitest'

import { RegistryValidationError } from '../../../src/registry/errors'
import {
  resolveFilePath,
  resolveTargetDir,
  updateFiles,
} from '../../../src/utils/updaters/update-files'

// TODO: `isSrcDir` is not being use yet
describe.todo('resolveTargetDir', () => {
  it('should handle a home target without a src directory', () => {
    const targetDir = resolveTargetDir(
      {
        isSrcDir: false,
      },
      {
        resolvedPaths: {
          cwd: '/foo/bar',
        },
      },
      '~/.env',
    )
    expect(targetDir).toBe('/foo/bar/.env')
  })

  it('should handle a home target even with a src directory', () => {
    const targetDir = resolveTargetDir(
      {
        isSrcDir: true,
      },
      {
        resolvedPaths: {
          cwd: '/foo/bar',
        },
      },
      '~/.env',
    )
    expect(targetDir).toBe('/foo/bar/.env')
  })

  it('should handle a simple target', () => {
    const targetDir = resolveTargetDir(
      {
        isSrcDir: false,
      },
      {
        resolvedPaths: {
          cwd: '/foo/bar',
        },
      },
      './components/ui/button.ts',
    )
    expect(targetDir).toBe('/foo/bar/components/ui/button.ts')
  })

  it('should handle a simple target with src directory', () => {
    const targetDir = resolveTargetDir(
      {
        isSrcDir: true,
      },
      {
        resolvedPaths: {
          cwd: '/foo/bar',
        },
      },
      './components/ui/button.ts',
    )
    expect(targetDir).toBe('/foo/bar/components/ui/button.ts')
  })
})

describe('resolveFilePath containment', () => {
  const config = {
    typescript: true,
    aliases: {
      components: '@/components',
      ui: '@/components/ui',
      lib: '@/lib',
      composables: '@/composables',
      utils: '@/lib/utils',
    },
    resolvedPaths: {
      cwd: '/project',
      ui: '/project/components/ui',
      lib: '/project/lib',
      components: '/project/components',
      composables: '/project/composables',
    },
  } as unknown as Config

  it('resolves an ordinary target inside the project', () => {
    expect(
      resolveFilePath(
        { path: 'ui/Button.vue', type: 'registry:file', target: 'components/ui/Button.vue' },
        config,
        { commonRoot: '' },
      ),
    ).toBe('/project/components/ui/Button.vue')
  })

  it('resolves a ~/ target against the project root', () => {
    expect(
      resolveFilePath(
        { path: 'env', type: 'registry:file', target: '~/.env.local' },
        config,
        { commonRoot: '' },
      ),
    ).toBe('/project/.env.local')
  })

  it.each([
    '../../../.bashrc',
    '../outside.txt',
    '~/../../.ssh/authorized_keys',
  ])('rejects a target that escapes the project: %s', (target) => {
    expect(() =>
      resolveFilePath(
        { path: 'ui/Button.vue', type: 'registry:file', target },
        config,
        { commonRoot: '' },
      ),
    ).toThrow(RegistryValidationError)
  })

  it('rejects a traversing path when the item declares no target', () => {
    expect(() =>
      resolveFilePath(
        { path: '../../../etc/passwd', type: 'registry:ui' },
        config,
        { commonRoot: '' },
      ),
    ).toThrow(RegistryValidationError)
  })

  it('allows a leading-dots file name that does not actually escape', () => {
    expect(
      resolveFilePath(
        { path: 'x', type: 'registry:file', target: '..config.json' },
        config,
        { commonRoot: '' },
      ),
    ).toBe('/project/..config.json')
  })

  it('does not constrain an explicit --path given by the user', () => {
    expect(
      resolveFilePath(
        { path: 'ui/Button.vue', type: 'registry:file' },
        config,
        { commonRoot: '', path: '/somewhere/else', fileIndex: 0 },
      ),
    ).toBe('/somewhere/else/Button.vue')
  })
})

describe('resolveFilePath source directory', () => {
  const config = {
    typescript: true,
    aliases: {
      components: '@/components',
      ui: '@/components/ui',
      lib: '@/lib',
      composables: '@/composables',
      utils: '@/lib/utils',
    },
    resolvedPaths: {
      cwd: '/project',
      ui: '/project/src/components/ui',
      lib: '/project/src/lib',
      components: '/project/src/components',
      composables: '/project/src/composables',
    },
  } as unknown as Config

  it('places a target inside src/ when the project uses src/', () => {
    expect(
      resolveFilePath(
        { path: 'hooks/use-foo.ts', type: 'registry:file', target: 'composables/useFoo.ts' },
        config,
        { commonRoot: '', isSrcDir: true, framework: 'vite' },
      ),
    ).toBe('/project/src/composables/useFoo.ts')
  })

  it('does not double the src/ prefix of a target', () => {
    expect(
      resolveFilePath(
        { path: 'hooks/use-foo.ts', type: 'registry:file', target: 'src/composables/useFoo.ts' },
        config,
        { commonRoot: '', isSrcDir: true, framework: 'vite' },
      ),
    ).toBe('/project/src/composables/useFoo.ts')
  })

  it('strips the src/ prefix when the project has no src/', () => {
    expect(
      resolveFilePath(
        { path: 'hooks/use-foo.ts', type: 'registry:file', target: 'src/composables/useFoo.ts' },
        config,
        { commonRoot: '', isSrcDir: false, framework: 'vite' },
      ),
    ).toBe('/project/composables/useFoo.ts')
  })

  it('places a Nuxt 4 page inside app/', () => {
    expect(
      resolveFilePath(
        { path: 'blocks/login/page.vue', type: 'registry:page', target: 'pages/login/index.vue' },
        config,
        { commonRoot: '', isSrcDir: true, framework: 'nuxt4' },
      ),
    ).toBe('/project/app/pages/login/index.vue')
  })

  it('does not double the app/ prefix of a Nuxt 4 target', () => {
    expect(
      resolveFilePath(
        { path: 'foo.ts', type: 'registry:file', target: 'app/composables/useFoo.ts' },
        config,
        { commonRoot: '', isSrcDir: true, framework: 'nuxt4' },
      ),
    ).toBe('/project/app/composables/useFoo.ts')
  })

  it.each([
    'server/api/hello.ts',
    'shared/utils/format.ts',
    'public/robots.txt',
    'modules/foo/index.ts',
    'layers/base/nuxt.config.ts',
  ])('keeps the Nuxt 4 root directory target %s at the project root', (target) => {
    expect(
      resolveFilePath(
        { path: 'x', type: 'registry:file', target },
        config,
        { commonRoot: '', isSrcDir: true, framework: 'nuxt4' },
      ),
    ).toBe(`/project/${target}`)
  })

  it('keeps a Nuxt 4 target at the root when the project has no app/', () => {
    expect(
      resolveFilePath(
        { path: 'blocks/login/page.vue', type: 'registry:page', target: 'pages/login/index.vue' },
        config,
        { commonRoot: '', isSrcDir: false, framework: 'nuxt4' },
      ),
    ).toBe('/project/pages/login/index.vue')
  })

  it('keeps a ~/ target at the project root even with a source directory', () => {
    expect(
      resolveFilePath(
        { path: 'env', type: 'registry:file', target: '~/.env.local' },
        config,
        { commonRoot: '', isSrcDir: true, framework: 'nuxt4' },
      ),
    ).toBe('/project/.env.local')
  })

  it('still rejects a target that escapes the project from a source directory', () => {
    expect(() =>
      resolveFilePath(
        { path: 'x', type: 'registry:file', target: '../../outside.txt' },
        config,
        { commonRoot: '', isSrcDir: true, framework: 'vite' },
      ),
    ).toThrow(RegistryValidationError)
  })
})

describe('updateFiles source directory', () => {
  it('writes a Nuxt 4 page target into app/', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'shadcn-vue-nuxt4-'))
    await fs.copy(path.resolve(__dirname, '../../fixtures/frameworks/nuxt4'), cwd)

    const config = {
      typescript: true,
      tailwind: { baseColor: '', cssVariables: true, prefix: '' },
      aliases: {
        components: '@/components',
        ui: '@/components/ui',
        lib: '@/lib',
        composables: '@/composables',
        utils: '@/lib/utils',
      },
      resolvedPaths: {
        cwd,
        ui: path.join(cwd, 'app/components/ui'),
        lib: path.join(cwd, 'app/lib'),
        components: path.join(cwd, 'app/components'),
        composables: path.join(cwd, 'app/composables'),
        utils: path.join(cwd, 'app/lib/utils'),
      },
    } as unknown as Config

    try {
      await updateFiles(
        [{
          path: 'blocks/login/page.vue',
          type: 'registry:page',
          target: 'pages/login/index.vue',
          content: '<template>\n  <div>Login</div>\n</template>\n',
        }],
        config,
        { silent: true },
      )

      expect(await fs.pathExists(path.join(cwd, 'app/pages/login/index.vue'))).toBe(true)
      expect(await fs.pathExists(path.join(cwd, 'pages/login/index.vue'))).toBe(false)
    }
    finally {
      await fs.remove(cwd)
    }
  })
})
