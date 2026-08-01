import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default [
    {
        input: 'index.js',
        output: {
            file: 'dist/viacomm.full.js',
            format: 'esm'
        },
        plugins: [
            nodeResolve()
        ],
    },
    {
        input: 'index.js',
        output: {
            file: 'dist/viacomm.js',
            format: 'esm'
        },
        external: [
            'lodash-es',
        ]
    },
    {
        input:'index.js',
        output: {
            file:'dist/viacomm.full.min.js',
            format:'esm'
        },
        plugins:[
            nodeResolve(),
            terser()
        ]
    },
    {
        input:'index.js',
        output: {
            file:'dist/viacomm.min.js',
            format:'esm'
        },
        external:[
            "lodash-es",
        ],
        plugins:[
            terser()
        ]
    }
];
