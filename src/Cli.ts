import { convert } from './Convert';
import fs from 'fs-extra';
import ps from 'path';
import { write, EmbeddedImageOperation, ExternalImageOperation } from './Writer';


(async () => {
    const outFile = ps.join('out', 'out.gltf');
    const outFbmDir = ps.join('out', 'custom-fbm-dir');

    await fs.ensureDir(ps.dirname(outFbmDir));

    const glTF = convert({
        input: ps.join('test', 'Models', 'tuzi_new@run.fbx'),
        // input: ps.join('test', 'Models', 'Sci-Fi Orc LOD.FBX'),
        // input: ps.join('test', 'Models', 'multiplematerials.FBX'),
        fbmDir: outFbmDir,
    });

    write(glTF, {
        outFile,
        embeddedBuffers: false,
        embeddedImageOperation: EmbeddedImageOperation.embed,
        externalImageOperation: ExternalImageOperation.reference,
    });
    
})();
