import { Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { console } from 'node:inspector'

interface FileNode {
    name: string
    type: 'file' | 'directory'
    children?: FileNode[]
}

function buildDirStructure(dirPath: string): FileNode {
    const name = path.basename(dirPath)
    const stats = fs.statSync(dirPath)

    if (stats.isFile()) {
        return { name, type: 'file' }
    }

    const children = fs.readdirSync(dirPath)
        .filter(item => !item.startsWith('.') && item !== 'node_modules' && item !== 'dist')
        .map(item => buildDirStructure(path.join(dirPath, item)))

    return {
        name,
        type: 'directory',
        children
    }
}

export default function dirStructurePlugin(): Plugin {
    const containerDir = 'public/container'
    const outputFile = path.join('', 'public/dir.json')

    return {
        name: 'dir-structure',
        buildStart() {
            const structure = buildDirStructure(containerDir)
            if (!fs.existsSync(path.dirname(outputFile))) {
                fs.mkdirSync(path.dirname(outputFile), { recursive: true })
            }
            fs.writeFileSync(outputFile, JSON.stringify(structure, null, 2))
        },
        handleHotUpdate({ file }) {
            if (file.startsWith(containerDir)) {
                const structure = buildDirStructure(containerDir)
                fs.writeFileSync(outputFile, JSON.stringify(structure, null, 2))
            }
        }
    }
}