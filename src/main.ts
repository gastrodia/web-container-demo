import { WebContainer, FileSystemTree } from "@webcontainer/api";
import { EditorView, basicSetup } from "codemirror"
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { debounce } from 'lodash-es'

class Demo {
    editorView?: EditorView
    terminal?: Terminal
    webContainer?: WebContainer

    editorContainer = `#editor`
    previewContainer = `#preview`
    terminalContainer = `#terminal`
    appVue = `
<template>
  <div>
    <h1>Hello, {{ name }}!</h1>
    <p>Welcome to Vue app!</p>
    <pre>{{count}}</pre>
    <el-button type="primary" @click="onClick">click</el-button>
  </div>
</template>
<script setup lang="ts">
  import { ref } from "vue"
  const name = ref("World")
  const count = ref<number>(0)

  const onClick = () => {
     count.value += 1
  }
</script>
<style scoped>
  h1 {
    color: red;
  }
</style>
        `


    async setup() {
        this.terminal = this.renderTerminal()
        const resource = this.generateResources()
        await this.createWebContainer(resource, this.terminalWrite.bind(this), (url) => {
            this.onWebContainerReady(url)
            this.editorView = this.renderEditor(this.appVue, this.onCodeChange.bind(this))
        })
    }

    onCodeChange = debounce((code: string) => {
        this.updateWebContainerFile('./src/App.vue', code)
    }, 500)

    onWebContainerReady(url: string) {
        document.querySelector(this.previewContainer)?.setAttribute('src', url);
    }

    renderEditor(code: string, onChange: (v: string) => void) {
        const container = document.querySelector(this.editorContainer)!
        container.textContent = ''
        return new EditorView({
            parent: container,
            doc: code,
            extensions: [basicSetup,
                EditorView.updateListener.of((v) => {
                    if (v.docChanged) {
                        onChange(v.state.doc.toString())
                    }
                })
            ]
        })
    }

    renderTerminal() {
        const term = new Terminal({
            convertEol: true
        });
        term.open(document.querySelector(this.terminalContainer)!);
        return term
    }

    terminalWrite(code: string) {
        this.terminal?.write(code)
    }

    async createWebContainer(
        resource: FileSystemTree,
        onWrite: (message: string) => void,
        onReady: (url: string) => void
    ) {
        this.webContainer = await WebContainer.boot();
        this.webContainer.on("server-ready", (port, url) => {
            onWrite(`\n服务启动成功, 端口为${port}`)
            onWrite(`\n${url}`)
            onReady(url)
        });
        await this.webContainer.mount(resource);
        onWrite(`\n开始安装依赖`)
        const install = await this.webContainer.spawn('pnpm', ['install']);
        install.output.pipeTo(
            new WritableStream({
                write(data) {
                    onWrite(data)
                },
            })
        );

        const exitCode = await install.exit;
        if (exitCode !== 0) {
            onWrite(`\n依赖安装失败`)
            return
        };

        const runDev = await this.webContainer.spawn('pnpm', ['run', 'dev'])
        runDev.output.pipeTo(
            new WritableStream({
                write(data) {
                    onWrite(data)
                },
            })
        );
    }

    updateWebContainerFile(path: string, str: string) {
        this.webContainer?.fs.writeFile(path, str)
    }

    generateResources(): FileSystemTree {
        const tree: FileSystemTree = {
            "vite.config.ts": {
                file: {
                    contents: `
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
})
                    `
                }
            },
            "tsconfig.json": {
                file: {
                    contents: `
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
                    `
                }
            },
            "tsconfig.app.json": {
                file: {
                    contents: `
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"]
}
                    `
                }
            },
            "tsconfig.node.json": {
                file: {
                    contents: `
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}

                    `
                }
            },
            "package.json": {
                file: {
                    contents: `
{
  "name": "container",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.5.13",
    "element-plus": "^2.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.1",
    "@vue/tsconfig": "^0.7.0",
    "typescript": "~5.7.2",
    "vite": "^6.2.0",
    "vue-tsc": "^2.2.4"
  }
}

                    `
                }
            },
            "index.html": {
                file: {
                    contents: `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + Vue + TS</title>
  </head>
  <body>
    <div id="app">preview loading...</div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
                    `
                }
            },
            "src": {
                directory: {
                    "App.vue": {
                        file: {
                            contents: this.appVue
                        }
                    },
                    "main.ts": {
                        file: {
                            contents: `
import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from "element-plus"
import "element-plus/dist/index.css"
const app = createApp(App)
app.use(ElementPlus)
app.mount("#app")
                            `
                        }
                    }
                }
            }
        }

        return tree
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const demo = new Demo()
    await demo.setup()
})