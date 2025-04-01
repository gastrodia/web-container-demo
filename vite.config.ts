import { defineConfig } from 'vite'
import dirStructurePlugin from './plugins/dir-structure'

export default defineConfig({
    plugins: [dirStructurePlugin()],
    server: {
        headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin'
        },
    },
    optimizeDeps: {
        include: ['@webcontainer/api']
    },
    base: '/web-container-demo/'
})
