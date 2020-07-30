
import fs from 'fs-extra';
import ps from 'path';

export default (fs.readJsonSync(ps.join(__dirname, '..', 'package.json')).version);
