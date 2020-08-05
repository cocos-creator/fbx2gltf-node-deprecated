

# FBX to glTF File Format Converter(Node.js)

This is a FBX to glTF file format converter that works in Node.js environment.

# Why

This tool is essentially used as a part of the Cocos Creator.
In former, Cocos Creator supports FBX file format through the excellent [FBX2glTF](https://github.com/facebookincubator/FBX2glTF).

But Cocos team has to find another approach because:
- FBX2glTF store the glTF result files onto disk and Creator read the files. This is the only way that Creator can communicate with FBX2glTF.
  File system I/O is slow.
- Author of FBX2glTF is tired.
- FBX is complex and all exporters working for it are buggy. We usually need to fix strange issues.
  However FBX2glTF is written in C++. It really bothers since once we need to fix BUGs. we need to build executable for different platforms. 
- Cocos expects to export more useful information which is FBX domain specific.

# Usage

This project heavily depends on [FBX SDK Node.js bindings](https://github.com/cocos-creator/fbxsdk-node). May you should pay attention to that.

Because the `fbxsdk-node` is platform-specific, this project allow you to customize how the `fbxsdk-node` can be found by this project.

There are several ways:

1. For local development. Run `'./LinkFbxSdk.ps1'` to link the `fbxsdk-node` built to `./fbxsdk-node`.

2. Invoke the Node.js module `./get-fbxsdk.js`'s `set(sdk)` to manually set the `fbxsdk-node`. You should do this before you can import `fbx2gltf-node` module.

3. Set the `fbxsdk-node` module's path into environment variable `FBXSDK_NODE_MODULE`. You should do this before you can import `fbx2gltf-node` module.

## Local development

1. Grab the [FBX SDK Node.js bindings](https://github.com/cocos-creator/fbxsdk-node) and build.
2. Run `'./LinkFbxSdk.ps1'` to link the above built to `./fbxsdk-node`
3. Just run.

# Thanks

Again, the FBX is complex and specification-less. In development, we often reference from or are inspired from the following predecessors:

- [FBX2glTF](https://github.com/facebookincubator/FBX2glTF)
- [claygl](https://github.com/pissang/claygl)
