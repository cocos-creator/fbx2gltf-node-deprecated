import { convert } from './Convert';
import fs from 'fs-extra';
import ps from 'path';
import { write, EmbeddedImageOperation, ExternalImageOperation } from './Writer';
import yargs from 'yargs';

(async () => {
    const cliArgs = readCliArgs();
    
    const input = ps.resolve(cliArgs.input);
    const inputDir = ps.dirname(input);
    const inputBaseNameNoExt = ps.basename(input, ps.extname(input));

    const outFile = cliArgs.output ?? (ps.join(process.cwd(), `${inputBaseNameNoExt}_glTF`, `${inputBaseNameNoExt}.gltf`));
    await fs.ensureDir(ps.dirname(outFile));

    const fbmDir = cliArgs.fbmDir;
    if (typeof fbmDir !== 'undefined') {
        await fs.ensureDir(ps.dirname(fbmDir));
    }

    const glTF = convert({
        input,
        fbmDir,
    });

    write(glTF, {
        outFile,
        embeddedBuffers: false,
        embeddedImageOperation: EmbeddedImageOperation.embed,
        externalImageOperation: ExternalImageOperation.reference,
    });
})();

function readCliArgs(): {
    input: string;
    output?: string;
    fbmDir?: string;
    suspectedAnimationDurationLimit?: number;
} {
    yargs.help();
    yargs.command('* <filename>', false, (yargs) => {
        yargs.positional('filename', {
            type: 'string',
            demandOption: true,
            description: 'The input FBX file.'
        });
        yargs.option('output', {
            type: 'string',
            description: 'The output path to the .gltf or .glb file.',
        });
        yargs.option('fbm-dir', {
            type: 'string',
            description: 'The directory to store the embedded media.',
        });
        yargs.option('suspected-animation-duration-limit', {
            type: 'number',
            description: 'The suspected animation duration limit.',
        });
    });
    const argv = yargs.argv;
    return {
        input: argv['filename'] as string,
        output: argv['output'] as string | undefined,
        fbmDir: argv['fbm-dir'] as string | undefined,
        suspectedAnimationDurationLimit: argv['suspected-animation-duration-limit'] as number | undefined,
    };
}
