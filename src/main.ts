import { WebContainer, FileSystemTree, FileNode, DirectoryNode } from "@webcontainer/api";
import { EditorView, basicSetup } from "codemirror"
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { debounce } from 'lodash-es'

interface DirNode {
    name: string
    type: 'file' | 'directory'
    children?: DirNode[]
}

class Demo {
    editorView?: EditorView
    terminal?: Terminal
    webContainer?: WebContainer

    editorContainer = `#editor`
    previewContainer = `#preview`
    terminalContainer = `#terminal`
    baseUrl = import.meta.env.BASE_URL ? import.meta.env.BASE_URL : '/'

    async loadLocalFile(path: string) {
        const response = await fetch(`${this.baseUrl}${path}`)
        const content = await response.text()
        return content
    }

    async setup() {
        this.terminal = this.renderTerminal()
        const resource = await this.generateResources()
        const srcDir = resource.src as DirectoryNode
        const vueFile = srcDir.directory['App.vue'] as FileNode
        const vueCode = vueFile.file.contents as string
        await this.createWebContainer(resource, this.terminalWrite.bind(this), (url) => {
            this.onWebContainerReady(url)
            this.editorView = this.renderEditor(vueCode, this.onCodeChange.bind(this))
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

    async buildTree(dir: string, dirs: DirNode[], tree: FileSystemTree) {
        const fileLoadPromises = dirs.map(async (file) => {
            const path = `${dir}/${file.name}`
            const key = path.replace(`${dir}/`, '')

            if (file.type === 'file') {
                const content = await this.loadLocalFile(path)
                tree[key] = {
                    file: { contents: content }
                }
            } else if (file.type === 'directory') {
                tree[key] = {
                    directory: {}
                }
                await this.buildTree(`${dir}/${file.name}`, file.children || [], tree[key].directory)
            }

        })

        await Promise.all(fileLoadPromises)
    }

    async generateResources(): Promise<FileSystemTree> {
        const baseDir = '/container'
        const fileTree: FileSystemTree = {}

        const response = await fetch(`${this.baseUrl}dir.json`)
        const containerDir: DirNode = await response.json()
        await this.buildTree(baseDir, containerDir.children || [], fileTree)
        return fileTree
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const demo = new Demo()
    await demo.setup()
})