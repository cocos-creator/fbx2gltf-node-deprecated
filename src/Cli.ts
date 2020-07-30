import { convert } from './Convert';
import fs from 'fs-extra';
import ps from 'path';

(async () => {
    const outFile = ps.join('out', 'out.gltf');
    const outFbmDir = ps.join('out', 'custom-fbm-dir');

    await fs.ensureDir(ps.dirname(outFbmDir));

    const glTFJson = convert({
        input: ps.join('test', 'Models', 'tuzi_new@run.fbx'),
        // input: ps.join('test', 'Models', 'Sci-Fi Orc LOD.FBX'),
        // input: ps.join('test', 'Models', 'multiplematerials.FBX'),
        fbmDir: outFbmDir,
    });

    await fs.ensureDir(ps.dirname(outFile));
    await fs.writeJson(outFile, glTFJson, {spaces: 2});
})();
