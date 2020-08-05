
let sdk;

module.exports = {
    set: (value) => {
        sdk = value;
    },
    get: () => {
        if (typeof sdk !== 'undefined') {
            return sdk;
        } else if (typeof process.env['FBXSDK_NODE_MODULE'] === 'string') {
            return require(process.env['FBXSDK_NODE_MODULE']);
        } else {
            return require('./fbxsdk-node/fbxsdk');
        }
    },
};
