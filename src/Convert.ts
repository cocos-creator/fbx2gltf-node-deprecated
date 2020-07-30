

import * as fbxSdk from '../fbxsdk-node/fbxsdk-node';
import { GLTFBuilder } from './GLTFBuilder';
import * as glTF from './libglTF';
import ps from 'path';
import fs from 'fs-extra';
import nodeUrl from 'url';
import URI from 'urijs';
import { encodeArrayBufferToBase64 } from './Util';
import myVersion from './Version';

export function convert(options: {
    input: string;
    fbmDir?: string;
}) {
    const convertContext = new ConvertContext();
    const glTFBuilder = new GLTFBuilder();
    main();
    const document = glTFBuilder.build({
        generator: `fbx2glTF-node:glTF-builder@${myVersion}`,
        copyright: `Copyright (c) 2018-2020 Chukong Technologies Inc.`,
    });
    return document;

    function main() {
        const { manager: fbxManager, scene: fbxScene, cleanup } = initializeFbxSdk();
        prepareScene(fbxManager, fbxScene);
        createNodes(fbxScene);
        convertScene(fbxScene);
        convertAnimation(
            fbxScene,
            1.0 / 30.0,
            0,
            Infinity,
            );
        cleanup();
    }

    function initializeFbxSdk() {
        const manager = fbxSdk.FbxManager.Create();
        if (!manager) {
            throw new Error(`Failed to initialize FBX SDK.`);
        }
        if (options.fbmDir) {
            const xRefManager = manager.GetXRefManager();
            if (!xRefManager.AddXRefProject(fbxSdk.FbxXRefManager.sEmbeddedFileProject, options.fbmDir)) {
                console.warn(`Failed to set .fbm dir`);
            }
        }

        const ioSettings = fbxSdk.FbxIOSettings.Create(manager, fbxSdk.IOSROOT);
        manager.SetIOSettings(ioSettings);

        const scene = fbxSdk.FbxScene.Create(manager, '');
        const importer = fbxSdk.FbxImporter.Create(manager, '')
        let ok = importer.Initialize(options.input, -1, manager.GetIOSettings());
        if (!ok) {
            throw new Error(`Failed to initialize FBX importer.`);
        }

        if (importer.IsFBX()) {
            manager.GetIOSettings().SetBoolProp(fbxSdk.EXP_FBX_MATERIAL, true)
            manager.GetIOSettings().SetBoolProp(fbxSdk.EXP_FBX_TEXTURE, true)
            manager.GetIOSettings().SetBoolProp(fbxSdk.EXP_FBX_EMBEDDED, true)
            manager.GetIOSettings().SetBoolProp(fbxSdk.EXP_FBX_SHAPE, true)
            manager.GetIOSettings().SetBoolProp(fbxSdk.EXP_FBX_GOBO, true)
            manager.GetIOSettings().SetBoolProp(fbxSdk.EXP_FBX_ANIMATION, true)
            manager.GetIOSettings().SetBoolProp(fbxSdk.EXP_FBX_GLOBAL_SETTINGS, true)
        }

        ok = importer.Import(scene)
        if (!ok) {
            throw new Error(`Failed to import scene.`);
        }

        importer.Destroy();

        function cleanup() {
            manager!.Destroy();
        }

        return {
            manager: manager,
            scene,
            cleanup,
        };
    }

    function prepareScene(fbxManager: fbxSdk.FbxManager, fbxScene: fbxSdk.FbxScene) {
        // Convert axis system
        fbxSdk.FbxAxisSystem.OpenGL.ConvertScene(fbxScene)

        // Convert system unit
        if (fbxScene.GetGlobalSettings().GetSystemUnit() != fbxSdk.FbxSystemUnit.m) {
            const conversionOptions = new fbxSdk.FbxSystemUnitConversionOptions()
            conversionOptions.mConvertRrsNodes = false
            conversionOptions.mConvertAllLimits = true
            conversionOptions.mConvertClusters = true
            conversionOptions.mConvertLightIntensity = true
            conversionOptions.mConvertPhotometricLProperties = true
            conversionOptions.mConvertCameraClipPlanes = true
            fbxSdk.FbxSystemUnit.m.ConvertScene(fbxScene, conversionOptions)
        }

        const fbxConverter = new fbxSdk.FbxGeometryConverter(fbxManager)

        // We only process triangles
        fbxConverter.Triangulate(fbxScene, true)

        // Split meshes per material
        fbxConverter.SplitMeshesPerMaterial(fbxScene, true)
    }

    function createNodes(fbxScene: fbxSdk.FbxScene) {
        const rootNode = fbxScene.GetRootNode();
        const nChildren = rootNode.GetChildCount();
        for (let iChild = 0; iChild < nChildren; ++iChild) {
            createNodeRecursive(rootNode.GetChild(iChild));
        }
    }

    function createNodeRecursive(fbxNode: fbxSdk.FbxNode) {
        const nodeName = fbxNode.GetName();
        const glTFNode: glTF.Node = {
            name: nodeName,
        };
        const glTFNodeIndex = glTFBuilder.addNode(glTFNode);
        convertContext.setNodeMap(fbxNode, glTFNodeIndex);
        const nChildren = fbxNode.GetChildCount();
        for (let iChild = 0; iChild < nChildren; ++iChild) {
            createNodeRecursive(fbxNode.GetChild(iChild));
        }
    }

    function convertScene(fbxScene: fbxSdk.FbxScene) {
        const sceneName = fbxScene.GetName();
        const glTFScene: glTF.Scene = {
            name: sceneName,
        };
        const fbxRootNode = fbxScene.GetRootNode();
        const nChildren = fbxRootNode.GetChildCount();
        if (nChildren > 0) {
            glTFScene.nodes = [];
            for (let iChild = 0; iChild < nChildren; ++iChild) {
                const glTFNodeIndex = convertNodeRecursive(fbxRootNode.GetChild(iChild));
                glTFScene.nodes.push(glTFNodeIndex);
            }
        }
        glTFBuilder.addScene(glTFScene);
    }

    function convertNodeRecursive(fbxNode: fbxSdk.FbxNode): number {
        const glTFNodeIndex = convertContext.getNode(fbxNode);
        const glTFNode = glTFBuilder.glTFRoot.nodes[glTFNodeIndex];

        const fbxLocalTransform = fbxNode.EvaluateLocalTransform()
        if (!fbxLocalTransform.IsIdentity()) {
            const translation = fbxLocalTransform.GetT();
            const rotation = fbxLocalTransform.GetQ();
            const scale = fbxLocalTransform.GetS();
            glTFNode.translation = fbxVector3ToArray(translation);
            glTFNode.scale = fbxVector3ToArray(scale);
            glTFNode.rotation = fbxQuatToArray(rotation);
        }

        const fbxMeshes: fbxSdk.FbxMesh[] = [];
        const nNodeAttributes = fbxNode.GetNodeAttributeCount();
        for (let iNodeAttribute = 0; iNodeAttribute < nNodeAttributes; ++iNodeAttribute) {
            const nodeAttribute = fbxNode.GetNodeAttributeByIndex(iNodeAttribute);
            const attributeType = nodeAttribute.GetAttributeType();
            switch (attributeType) {
                case fbxSdk.FbxNodeAttribute.eMesh:
                    const fbxMesh = fbxSdk.castAsFbxMesh(nodeAttribute);
                    fbxMeshes.push(fbxMesh);
                    break;
            }
        }

        if (fbxMeshes.length > 0) {
            const { glTFMeshIndex, glTFSkinIndex } = convertMesh(fbxMeshes, fbxNode);
            glTFNode.mesh = glTFMeshIndex;
            if (glTFSkinIndex >= 0) {
                glTFNode.skin = glTFSkinIndex;
            }
        }

        const nChildren = fbxNode.GetChildCount();
        if (nChildren > 0) {
            glTFNode.children = [];
            for (let iChild = 0; iChild < nChildren; ++iChild) {
                const glTFNodeIndex = convertNodeRecursive(fbxNode.GetChild(iChild));
                glTFNode.children.push(glTFNodeIndex);
            }
        }

        return glTFNodeIndex;
    }

    function convertMesh(fbxMeshes: fbxSdk.FbxMesh[], fbxNode: fbxSdk.FbxNode): {
        glTFMeshIndex: number;
        glTFSkinIndex: number;
    } {
        const meshName = fbxMeshes[0].GetName();
        const { meshTransform, normalTransform } = getGeometricTransform(fbxNode);

        const glTFPrimitives: glTF.MeshPrimitive[] = []
        let meshSkinIndex = -1;
        for (const fbxMesh of fbxMeshes) {
            const meshDivision = divideMeshByMaterial(fbxMesh);
            let jointsWeights: JointsWeights | undefined;
            let glTFSkinIndex: number | undefined;
            const nSkinDeformers = fbxMesh.GetDeformerCount(fbxSdk.FbxDeformer.eSkin);
            if (nSkinDeformers > 0) {
                const skinData = GetSkinData(fbxMesh);
                glTFSkinIndex = skinData.skin;
                jointsWeights = skinData.jointsWeights;
            }
            if (glTFSkinIndex !== undefined) {
                meshSkinIndex = glTFSkinIndex;
            }
            for (const materialIndexKey of Object.keys(meshDivision)) {
                const materialIndex = Number(materialIndexKey);
                const polygons = meshDivision[materialIndex];
                const glTFPrimitive = convertPrimitive(
                    fbxMesh,
                    jointsWeights,
                    polygons,
                    meshName,
                    meshTransform,
                    normalTransform,
                );
                const fbxMaterial = fbxNode.GetMaterial(materialIndex);
                const glTFMaterialIndex = convertMaterial(fbxMaterial);
                if (glTFMaterialIndex >= 0) {
                    glTFPrimitive.material = glTFMaterialIndex;
                }
                glTFPrimitives.push(glTFPrimitive);
            }
        }

        const glTFMesh: glTF.Mesh = {
            name: meshName,
            primitives: glTFPrimitives,
        };
        const glTFMeshIndex = glTFBuilder.addMesh(glTFMesh);

        return {
            glTFMeshIndex: glTFMeshIndex,
            glTFSkinIndex: meshSkinIndex,
        };
    }

    function divideMeshByMaterial(fbxMesh: fbxSdk.FbxMesh) {
        const nPolygons = fbxMesh.GetPolygonCount();
        const nElementMaterialCount = fbxMesh.GetElementMaterialCount();

        // Material index of every polygon, None means
        let polygonMaterialIndices: number[] | null = null
        let polygonMaterialCommonIndex = -1;

        if (nElementMaterialCount > 1) {
            console.warn("We're unable to process multi material layers");
        }

        for (let iElementMaterial = 0; iElementMaterial < nElementMaterialCount; ++iElementMaterial) {
            const elementMaterial = fbxMesh.GetElementMaterial(iElementMaterial);
            const mappingMode = elementMaterial.GetMappingMode();
            const indexArray = elementMaterial.GetIndexArray();
            if (mappingMode === fbxSdk.FbxLayerElement.eAllSame) {
                polygonMaterialCommonIndex = indexArray.GetAt(0);
            } else {
                polygonMaterialIndices = new Array(nPolygons).fill(-1);
                for (let iPolygon = 0; iPolygon < nPolygons; ++iPolygon) {
                    polygonMaterialIndices[iPolygon] = indexArray.GetAt(iPolygon);
                }
            }
            break; // Just process the first layer
        }

        const divisions: Record<number, number[]> = {};
        if (polygonMaterialIndices === null) {
            polygonMaterialIndices = new Array(nPolygons).fill(-1);
            for (let iPolygon = 0; iPolygon < nPolygons; ++iPolygon) {
                polygonMaterialIndices[iPolygon] = iPolygon;
            }
            divisions[polygonMaterialCommonIndex] = polygonMaterialIndices;
        } else {
            for (let iPolygon = 0; iPolygon < nPolygons; ++iPolygon) {
                const materialIndex = polygonMaterialIndices[iPolygon];
                if (!(materialIndex in divisions)) {
                    divisions[materialIndex] = [];
                }
                divisions[materialIndex].push(iPolygon);
            }
        }

        return divisions;
    }

    function GetSkinData(fbxMesh: fbxSdk.FbxMesh) {
        const nControlPoints = fbxMesh.GetControlPointsCount();
        const nSkinDeformers = fbxMesh.GetDeformerCount(fbxSdk.FbxDeformer.eSkin);

        const influenceCounts = new Array<number>(nControlPoints).fill(0);
        const jointsWeights: JointsWeights = {
            elements: [],
        };
        const skinJoints: number[] = [];
        const skinInverseBindMatrices: fbxSdk.FbxAMatrix[] = [];

        const makeJointsWeightsLayerElement = (): JointsWeights['elements'][0] => {
            const result: InfluencesPer4[] = new Array(nControlPoints);
            for (let i = 0; i < nControlPoints; ++i) {
                result[i] = [
                    [0, 0, 0, 0], // joints 4
                    [0, 0, 0, 0], // weighs 4
                ];
            }
            return result;
        };

        for (let iSkinDeformer = 0; iSkinDeformer < nSkinDeformers; ++iSkinDeformer) {
            const skinDeformer = fbxSdk.castAsFbxSkin(
                fbxMesh.GetDeformer(iSkinDeformer, fbxSdk.FbxDeformer.eSkin));
            const nClusters = skinDeformer.GetClusterCount();
            for (let iCluster = 0; iCluster < nClusters; ++iCluster) {
                const cluster = skinDeformer.GetCluster(iCluster);

                const jointNode = cluster.GetLink();
                // Note: the node may not appear in scene graph
                const glTFNodeIndex = convertContext.getNodeIf(jointNode);
                if (glTFNodeIndex === undefined) {
                    // TODO: may be we should do some work here??
                    console.warn(
                        `The joint node "${jointNode.GetName()}" is used for skinning ` +
                        `but missed in scene graph. It will be ignored.`);
                    continue;
                }

                // Index this node to joint array
                let jointId = skinJoints.indexOf(glTFNodeIndex);
                if (jointId < 0) {
                    jointId = skinJoints.length;
                    skinJoints.push(glTFNodeIndex);

                    const fbxTransformMatrix = new fbxSdk.FbxAMatrix();
                    cluster.GetTransformMatrix(fbxTransformMatrix);
                    const fbxTransformLinkMatrix = new fbxSdk.FbxAMatrix();
                    cluster.GetTransformLinkMatrix(fbxTransformLinkMatrix);
                    // http://blog.csdn.net/bugrunner/article/details/7232291
                    // http://help.autodesk.com/view/FBX/2017/ENU/?guid=__cpp_ref__view_scene_2_draw_scene_8cxx_example_html
                    const inverseBindMatrix = fbxTransformLinkMatrix.Inverse().__mul__(fbxTransformMatrix);
                    skinInverseBindMatrices.push(inverseBindMatrix);
                }

                const controlPointIndices = cluster.GetControlPointIndices();
                const controlPointWeights = cluster.GetControlPointWeights();
                for (let iControlPointIndex = 0; iControlPointIndex < controlPointIndices.length; ++iControlPointIndex) {
                    const controlPointIndex = controlPointIndices[iControlPointIndex];
                    const controlPointWeight = controlPointWeights[iControlPointIndex];
                    const nInfluence = influenceCounts[controlPointIndex];
                    const iJW4 = Math.floor(nInfluence / 4);
                    if (iJW4 >= jointsWeights.elements.length) {
                        jointsWeights.elements.push(makeJointsWeightsLayerElement());
                    }
                    const c = nInfluence % 4;
                    const [ joints, weights ] = jointsWeights.elements[iJW4][controlPointIndex];
                    joints[c] = jointId;
                    weights[c] = controlPointWeight;
    
                    influenceCounts[controlPointIndex] += 1;
                }
            }
        }

        // Normalize weights
        for (let iControlPoint = 0; iControlPoint < nControlPoints; ++iControlPoint) {
            const nInfluence = influenceCounts[iControlPoint];
            if (nInfluence > 0) {
                let sum = 0.0;
                for (let iInfluence = 0; iInfluence < nInfluence; ++iInfluence) {
                    const i = Math.floor(iInfluence / 4);
                    const j = iInfluence % 4;
                    const [, weightsPer4] = jointsWeights.elements[i][iControlPoint];
                    sum += weightsPer4[j];
                }
                for (let iInfluence = 0; iInfluence < nInfluence; ++iInfluence) {
                    const i = Math.floor(iInfluence / 4);
                    const j = iInfluence % 4;
                    const [, weightsPer4] = jointsWeights.elements[i][iControlPoint];
                    weightsPer4[j] /= sum;
                }
            }
        }

        const ibmData = fbxAMatrixArrayToArray(skinInverseBindMatrices, Float32Array);
        const ibmBufferViewInfo = glTFBuilder.createBufferView(ibmData.byteLength, 0, 0);
        new Uint8Array(ibmBufferViewInfo.data).set(new Uint8Array(ibmData.buffer, ibmData.byteOffset, ibmData.byteLength));
        const ibmAccessor: glTF.Accessor = {
            name: `Inverse bind matrices`,
            bufferView: ibmBufferViewInfo.index,
            count: skinInverseBindMatrices.length,
            type: glTF.MAT4,
            componentType: glTF.FLOAT,
        };
        const ibmAccessorIndex = glTFBuilder.addAccessor(ibmAccessor);
        
        
        const glTFSkin: glTF.Skin = {
            joints: skinJoints,
            inverseBindMatrices: ibmAccessorIndex,
        };

        const glTFSkinIndex = glTFBuilder.addSkin(glTFSkin);
        return {
            skin: glTFSkinIndex,
            jointsWeights,
        };
    }

    function convertPrimitive(
        fbxMesh: fbxSdk.FbxMesh,
        jointsWeights: JointsWeights | undefined,
        polygons: number[],
        meshName: string,
        meshTransform: fbxSdk.FbxMatrix,
        normalTransform: fbxSdk.FbxMatrix,
    ) {
        // const controlPoints = fbxMesh.GetControlPoints();
        const nControlPoints = fbxMesh.GetControlPointsCount();
        const controlPoints: fbxSdk.FbxVector4[] = new Array(nControlPoints);
        for (let iControlPoint = 0; iControlPoint < nControlPoints; ++iControlPoint) {
            controlPoints[iControlPoint] = fbxMesh.GetControlPointAt(iControlPoint);
        }

        interface Elements {
            position: fbxSdk.FbxVector4[];
            normal?: fbxSdk.FbxVector4[];
            uvs: fbxSdk.FbxVector2[][];
            vertexColors: fbxSdk.FbxColor[][];
            jointWeights: {
                joints: number[];
                weights: number[];
            }[];
        }

        const primitive: Elements = {
            position: [],
            uvs: [],
            vertexColors: [],
            jointWeights: [],
        };
        let allByControlPoint = true;

        // Normal element
        const normalElement0 = fbxMesh.GetElementNormal(0)
        if (normalElement0) {
            primitive.normal = []
            if (normalElement0.GetMappingMode() == fbxSdk.FbxLayerElement.eByPolygonVertex) {
                allByControlPoint = false
            }
        }

        // UV elements
        const nUVElements = fbxMesh.GetElementUVCount();
        const uvElements: fbxSdk.FbxLayerElementUV[] = []
        primitive.uvs = []
        for (let iUVElement = 0; iUVElement < nUVElements; ++iUVElement) {
            primitive.uvs.push([])
            const element = fbxMesh.GetElementUV(iUVElement)
            uvElements.push(element)
            if (element.GetMappingMode() == fbxSdk.FbxLayerElement.eByPolygonVertex) {
                allByControlPoint = false;
            }
        }

        // Vertex color elements
        const nVertexColorElements = fbxMesh.GetElementVertexColorCount();
        const vertexColorElements: fbxSdk.FbxLayerElementVertexColor[] = []
        primitive.vertexColors = []
        for (let iVertexColorElements = 0; iVertexColorElements < nVertexColorElements; ++iVertexColorElements) {
            primitive.vertexColors.push([])
            const element = fbxMesh.GetElementVertexColor(iVertexColorElements);
            vertexColorElements.push(element)
            if (element.GetMappingMode() == fbxSdk.FbxLayerElement.eByPolygonVertex) {
                allByControlPoint = false;
            }
        }

        // Joints and weights
        if (jointsWeights) {
            primitive.jointWeights = Array.from(jointsWeights.elements, () => ({
                joints: [],
                weights: [],
            }));
        }

        let iPolygonVertex = 0;
        for (const iPolygon of polygons) {
            // assert(fbxMesh.GetPolygonSize(iPolygon) == 3)
            for (let iCorner = 0; iCorner < 3; ++iCorner) {
                const iControlPoint = fbxMesh.GetPolygonVertex(iPolygon, iCorner);
                // Position
                let position = controlPoints[iControlPoint];
                position = meshTransform.MultNormalize(position);
                primitive.position.push(position);
                // Normal
                if (normalElement0) {
                    let normal = GetVertexAttribute(normalElement0, iControlPoint, iPolygonVertex)
                    normal = normalTransform.MultNormalize(normal)
                    primitive.normal.push(normal)
                }
                // UVs
                for (let iUVElement = 0; iUVElement < nUVElements; ++iUVElement) {
                    const uv = GetVertexAttribute(uvElements[iUVElement], iControlPoint, iPolygonVertex)
                    primitive.uvs[iUVElement].push(convertContext.flipV ? new fbxSdk.FbxVector2(uv.GetX(), 1.0 - uv.GetY()) : uv)
                }
                // Vertex colors
                for (let iVertexColorElement = 0; iVertexColorElement < nVertexColorElements; ++iVertexColorElement) {
                    const color = GetVertexAttribute(vertexColorElements[iVertexColorElement], iControlPoint, iPolygonVertex)
                    primitive.vertexColors[iVertexColorElement].push(color)
                }
                // Skin influence
                if (jointsWeights) {
                    const nInfluenceElements = jointsWeights.elements.length;
                    for (let iInfluenceElement = 0; iInfluenceElement < nInfluenceElements; ++iInfluenceElement) {
                        const [ jointsPer4, weightsPer4 ] = jointsWeights.elements[iInfluenceElement][iControlPoint];
                        const { joints, weights } = primitive.jointWeights[iInfluenceElement];
                        joints.push(...jointsPer4);
                        weights.push(...weightsPer4);
                    }
                }

                ++iPolygonVertex;
            }
        }

        const vertexCount = iPolygonVertex;
        const attributes: Record<string, {
            data: Float32Array | Uint16Array | Uint32Array;
            type: string;
            componentType: number;
            minmax?: boolean;
        }> = {};

        attributes[glTF.POSITION] = {
            data: fbxVector3ArrayToArray(primitive.position, Float32Array),
            componentType: glTF.FLOAT,
            type: glTF.VEC3,
            minmax: true,
        };

        if (primitive.normal) {
            attributes[glTF.NORMAL] = {
                data: fbxVector3ArrayToArray(primitive.normal, Float32Array),
                componentType: glTF.FLOAT,
                type: glTF.VEC3,
            };
        }

        if (primitive.uvs) {
            for (let iUV = 0; iUV < primitive.uvs.length; ++iUV) {
                attributes[`${glTF.TEXCOORD}_${iUV}`] = {
                    data: fbxVector2ArrayToArray(primitive.uvs[iUV], Float32Array),
                    componentType: glTF.FLOAT,
                    type: glTF.VEC2,
                };
            }
        }

        if (primitive.vertexColors) {
            for (let iColor = 0; iColor < primitive.vertexColors.length; ++iColor) {
                attributes[`${glTF.COLOR}_${iColor}`] = {
                    data: fbxColorArrayToArray(primitive.vertexColors[iColor], Float32Array),
                    componentType: glTF.FLOAT,
                    type: glTF.VEC4,
                };
            }
        }

        if (primitive.jointWeights) {
            for (let iJointWeight = 0; iJointWeight < primitive.jointWeights.length; ++iJointWeight) {
                const { joints, weights } = primitive.jointWeights[iJointWeight];
                attributes[`${glTF.JOINTS}_${iJointWeight}`] = {
                    data: Uint16Array.from(joints),
                    componentType: glTF.UNSIGNED_SHORT,
                    type: glTF.VEC4,
                };
                attributes[`${glTF.WEIGHTS}_${iJointWeight}`] = {
                    data: Float32Array.from(weights),
                    componentType: glTF.FLOAT,
                    type: glTF.VEC4,
                };
            }
        }

        // Count bytes
        let vertexStride = 0
        for (const key of Object.keys(attributes)) {
            vertexStride += attributes[key].data.BYTES_PER_ELEMENT * GetComponents(attributes[key]['type']);
        }

        // Fill bytes, create accessors
        const glTFPrimitive: glTF.MeshPrimitive = {
            attributes: {},
        }

        const bufferViewInfo = glTFBuilder.createBufferView(vertexStride * vertexCount, 0, 0);
        bufferViewInfo.bufferView.byteStride = vertexStride;
        bufferViewInfo.bufferView.target = glTF.ARRAY_BUFFER;
        const bufferViewDataU8 = new Uint8Array(bufferViewInfo.data);

        let bufferViewByteOffset = 0;
        for (const key of Object.keys(attributes)) {
            const { data, type, minmax, componentType } = attributes[key];
            const dataU8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

            // Copy data
            let pOut = bufferViewByteOffset;
            const components = GetComponents(type);
            const attributeBytes = components * data.BYTES_PER_ELEMENT;
            for (let iVertex = 0; iVertex < vertexCount; ++iVertex) {
                bufferViewDataU8.set(
                    dataU8.slice(attributeBytes * iVertex, attributeBytes * (iVertex + 1)),
                    pOut, // of bufferViewDataU8
                );
                pOut += vertexStride
            }

            const accessor: glTF.Accessor = {
                name: `${meshName}-${key}`,
                bufferView: bufferViewInfo.index,
                byteOffset: bufferViewByteOffset,
                count: vertexCount,
                type,
                componentType,
            }
            if (minmax) {
                const stride = components;
                const min = new Array<number>(stride).fill(Infinity);
                const max = new Array<number>(stride).fill(-Infinity);
                for (let c = 0; c < stride; ++c) {
                    let cMin = Infinity;
                    let cMax = -Infinity;
                    for (let i = 0; i < vertexCount; ++i) {
                        const n = data[stride * i + c];
                        cMin = Math.min(cMin, n);
                        cMax = Math.max(cMax, n);
                    }
                    min[c] = cMin;
                    max[c] = cMax;
                }
                accessor.min = min;
                accessor.max = max;
            }

            const accessorIndex = glTFBuilder.addAccessor(accessor);
            glTFPrimitive.attributes[key] = accessorIndex;
            
            bufferViewByteOffset += attributeBytes;
        }

        return glTFPrimitive;
    }

    function convertMaterial(fbxMaterial: fbxSdk.FbxSurfaceMaterial) {
        if (fbxMaterial.GetClassId().Is(fbxSdk.FbxSurfaceLambert.ClassId)) {
            return convertLambertMaterial(fbxSdk.castAsFbxSurfaceLambert(fbxMaterial));
        } else {
            return -1;
        }
    }

    function convertLambertMaterial(fbxMaterial: fbxSdk.FbxSurfaceLambert) {
        const materialName = fbxMaterial.GetName();

        const fbxTransparentColor = fbxMaterial.TransparentColor.Get();
        const fbxTransparentFactor = fbxMaterial.TransparencyFactor.Get();
        // FBX color is RGB, so we calculate the A channel as the average of the FBX transparency color
        const glTFTransparency = 1.0 - fbxTransparentFactor * (fbxTransparentColor.Get(0) + fbxTransparentColor.Get(1) + fbxTransparentColor.Get(2)) / 3.0;

        const glTFBaseColorFactor: [number, number, number, number] = [1.0, 1.0, 1.0, 1.0];
        const glTFSpecularColor: [number, number, number] = [0.0, 0.0, 0.0];
        let glTFRoughnessFactor = 1.0;
        const glTFEmissiveFactor = [0.0, 0.0, 0.0];
        let glTFBaseColorTextureInfo: undefined | glTF.TextureInfo;
        let glTFNormalTextureInfo: undefined | glTF.MaterialNormalTextureInfo;
        let glTFEmissiveTextureInfo: undefined | glTF.TextureInfo;

        if (glTFTransparency < 1) {
            glTFBaseColorFactor[3] = glTFTransparency;
        }

        const glTFDiffuseTextureIndex = convertTextureProperty(fbxMaterial.Diffuse);
        if (glTFDiffuseTextureIndex < 0) {
            const fbxDiffuseColor = fbxMaterial.Diffuse.Get();
            glTFBaseColorFactor[0] = fbxDiffuseColor.Get(0);
            glTFBaseColorFactor[1] = fbxDiffuseColor.Get(1);
            glTFBaseColorFactor[2] = fbxDiffuseColor.Get(2);
        } else {
            glTFBaseColorTextureInfo = {
                index: glTFDiffuseTextureIndex,
            };
        }

        const glTFNormalMapIndex = convertTextureProperty(fbxMaterial.NormalMap);
        if (glTFNormalMapIndex >= 0) {
            glTFNormalTextureInfo = {
                index: glTFNormalMapIndex,
            };
        }

        const glTFBumpMapIndex = convertTextureProperty(fbxMaterial.NormalMap);
        if (glTFBumpMapIndex >= 0) {
            glTFNormalTextureInfo = {
                index: glTFBumpMapIndex,
            };
        }

        const glTFEmissiveTextureIndex = convertTextureProperty(fbxMaterial.Emissive);
        if (glTFEmissiveTextureIndex >= 0) {
            glTFEmissiveTextureInfo = {
                index: glTFEmissiveTextureIndex,
            };
        }

        const fbxEmissiveFactor = fbxMaterial.EmissiveFactor.Get();
        glTFEmissiveFactor.fill(fbxEmissiveFactor);

        if (fbxMaterial.GetClassId().Is(fbxSdk.FbxSurfacePhong.ClassId)) {
            const fbxPhong = fbxSdk.castAsFbxSurfacePhong(fbxMaterial);
            const fbxSpecular = fbxPhong.Specular.Get();
            const fbxSpecularFactor = fbxPhong.SpecularFactor.Get();
            glTFSpecularColor[0] = fbxSpecular.Get(0) * fbxSpecularFactor;
            glTFSpecularColor[1] = fbxSpecular.Get(1) * fbxSpecularFactor;
            glTFSpecularColor[2] = fbxSpecular.Get(2) * fbxSpecularFactor;
            glTFRoughnessFactor = getRoughnessFromExponentShininess(fbxPhong.Shininess.Get());

        }

        const glTFMetallicFactor = getMetalnessFromSpecular(glTFSpecularColor, glTFBaseColorFactor);

        const glTFPbrMetallicRoughness: glTF.MaterialPbrMetallicRoughness = {
            baseColorTexture: glTFBaseColorTextureInfo,
            baseColorFactor: glTFBaseColorFactor,
            metallicFactor: glTFMetallicFactor,
            roughnessFactor: glTFRoughnessFactor,
        };

        const glTFMaterial: glTF.Material = {
            name: materialName,
            pbrMetallicRoughness: glTFPbrMetallicRoughness,
            normalTexture: glTFNormalTextureInfo,
            emissiveTexture: glTFEmissiveTextureInfo,
        };
        if (glTFTransparency < 1) {
            glTFMaterial.alphaMode = glTF.BLEND;
        }

        const glTFMaterialIndex = glTFBuilder.addMaterial(glTFMaterial);
        return glTFMaterialIndex;
    }

    function convertTextureProperty(fbxProperty: fbxSdk.FbxProperty) {
        const fbxFileTexture = fbxProperty.GetSrcObject(fbxSdk.FbxCriteria.ObjectType(fbxSdk.FbxFileTexture.ClassId));
        if (!fbxFileTexture) {
            return -1;
        } else {
            return convertFileTexture(fbxSdk.castAsFbxFileTexture(fbxFileTexture));
        }
    }

    function convertFileTexture(fbxFileTexture: fbxSdk.FbxFileTexture) {
        const textureName = fbxFileTexture.GetName();

        const glTFImageIndex = convertTextureSource(fbxFileTexture);
        const glTFSamplerIndex = convertTextureSampler(fbxFileTexture);
        const glTFTexture: glTF.Texture = {
            name: textureName,
            sampler: glTFSamplerIndex,
            source: glTFImageIndex,
        };

        const glTFTextureIndex = glTFBuilder.addTexture(glTFTexture);
        return glTFTextureIndex;
    }

    function convertTextureSampler(fbxTexture: fbxSdk.FbxTexture) {
        const glTFWrapS = convertWrapMode(fbxTexture.GetWrapModeU());
        const glTFWrapT = convertWrapMode(fbxTexture.GetWrapModeV());
        const glTFSampler: glTF.Sampler = {
            wrapS: glTFWrapS,
            wrapT: glTFWrapT,
        };
        const glTFSamplerIndex = glTFBuilder.addSampler(glTFSampler);
        return glTFSamplerIndex;
    }

    function convertWrapMode(fbxWrapMode: fbxSdk.FbxTexture.EWrapMode) {
        switch (fbxWrapMode) {
            case fbxSdk.FbxTexture.eRepeat: return glTF.REPEAT;
            default: /* assert fbxWrapMode == FbxTexture.eClamp */ return glTF.CLAMP_TO_EDGE;
        }
    }

    function convertTextureSource(fbxFileTexture: fbxSdk.FbxFileTexture) {
        const imageName = fbxFileTexture.GetName();
        const imageFile = getActualImageFile(fbxFileTexture);
        let glTFUri: string;
        if (convertContext.imageProcess === ImageProcess.reference) {
            const glTFDir = './';
            const glTFDirUri = new URI(nodeUrl.pathToFileURL(glTFDir).href);
            const imageUri = new URI(nodeUrl.pathToFileURL(imageFile).href);
            glTFUri = imageUri.relativeTo(glTFDirUri.href()).href();
        } else {
            glTFUri = readImageFileAsDataUri(imageFile);
        }
        const glTFImage: glTF.Image = {
            name: imageName,
            uri: glTFUri,
        };
        glTFImage.extensions = {
            [glTFExtensionFbxSdkTextureInfoName]: {
                relativeFileName: fbxFileTexture.GetRelativeFileName(),
                fileName: fbxFileTexture.GetFileName(),
            } as GLTFExtensionFbxSdkTextureInfo,
        };
        glTFBuilder.useExtension(glTFExtensionFbxSdkTextureInfoName);
        const glTFImageIndex = glTFBuilder.addImage(glTFImage);
        return glTFImageIndex;
    }

    function getActualImageFile(fbxFileTexture: fbxSdk.FbxFileTexture) {
        const relativeFileName = fbxFileTexture.GetRelativeFileName();
        const fileName = fbxFileTexture.GetFileName();
        const fbxDir = ps.dirname(options.input);
        return ps.join(fbxDir, relativeFileName);
    }

    function readImageFileAsDataUri(imageFile: string) {
        const extName = ps.extname(imageFile).toLowerCase();
        let mimeType: string;
        switch (extName) {
            case 'jpg':
            case 'jpeg':
                mimeType = 'image/jpeg';
                break;
            case 'png':
                mimeType = 'image/png';
                break;
            default:
                mimeType = extName.startsWith('.') ? `image/${extName.substr(1)}`: extName;
                break;
        }
        const bufferData = fs.readFileSync(imageFile);
        const uri = `data:${mimeType};base64,${encodeArrayBufferToBase64(bufferData)}`;
        return uri;
    }

    function convertAnimation(fbxScene: fbxSdk.FbxScene, sampleStep: number, startTime: number, duration: number) {
        const animStackCriteria = fbxSdk.FbxCriteria.ObjectType(fbxSdk.FbxAnimStack.ClassId);
        const animLayerCriteria = fbxSdk.FbxCriteria.ObjectType(fbxSdk.FbxAnimLayer.ClassId);
        const nAnimStacks = fbxScene.GetSrcObjectCount(animStackCriteria);
        const rootNode = fbxScene.GetRootNode();
        for (let iAnimStack = 0; iAnimStack < nAnimStacks; ++iAnimStack) {
            const animStack = fbxSdk.castAsFbxAnimStack(fbxScene.GetSrcObject(animStackCriteria, iAnimStack));
            const nAnimLayers = animStack.GetSrcObjectCount(animLayerCriteria);
            if (nAnimLayers > 0) {
                const animName = animStack.GetName();
                const glTFAnimation: glTF.Animation = {
                    name: animName,
                    channels: [],
                    samplers: [],
                };
                for (let iAnimLayer = 0; iAnimLayer < nAnimLayers; ++iAnimLayer) {
                    const animLayer = fbxSdk.castAsFbxAnimLayer(animStack.GetSrcObject(animLayerCriteria));
                    convertNodeAnimationRecursive(rootNode, animLayer, sampleStep, startTime, duration, glTFAnimation);
                }
                if (glTFAnimation.samplers.length > 0) {
                    glTFBuilder.addAnimation(glTFAnimation);
                }
            }
        }
    }

    function convertNodeAnimationRecursive(
        fbxNode: fbxSdk.FbxNode,
        fbxAnimLayer: fbxSdk.FbxAnimLayer,
        sampleStep: number,
        startTime: number,
        duration: number,
        glTFAnimation: glTF.Animation,
    ) {
        convertNodeAnimation(fbxNode, fbxAnimLayer, sampleStep, startTime, duration, glTFAnimation);
        const nChildren = fbxNode.GetChildCount();
        for (let iChild = 0; iChild < nChildren; ++iChild) {
            convertNodeAnimationRecursive(fbxNode.GetChild(iChild), fbxAnimLayer, sampleStep, startTime, duration, glTFAnimation);
        }
    }

    function convertNodeAnimation(
        fbxNode: fbxSdk.FbxNode,
        fbxAnimLayer: fbxSdk.FbxAnimLayer,
        sampleStep: number,
        capStartTime: number,
        capDuration: number,
        glTFAnimation: glTF.Animation,
    ) {
        const isNull = <T>(value: T | null) => !value;
        const isAllNull = <T>(values: (T | null)[]) => values.every(isNull);
        const fbxAnimCurves = [
            fbxNode.LclTranslation.GetCurve(fbxAnimLayer, 'X'),
            fbxNode.LclTranslation.GetCurve(fbxAnimLayer, 'Y'),
            fbxNode.LclTranslation.GetCurve(fbxAnimLayer, 'Z'),

            fbxNode.LclRotation.GetCurve(fbxAnimLayer, 'X'),
            fbxNode.LclRotation.GetCurve(fbxAnimLayer, 'Y'),
            fbxNode.LclRotation.GetCurve(fbxAnimLayer, 'Z'),

            fbxNode.LclScaling.GetCurve(fbxAnimLayer, 'X'),
            fbxNode.LclScaling.GetCurve(fbxAnimLayer, 'Y'),
            fbxNode.LclScaling.GetCurve(fbxAnimLayer, 'Z'),
        ];

        if (fbxAnimCurves.every(isNull)) {
            return;
        }
        
        const hasTranslationCurve = !isAllNull(fbxAnimCurves.slice(0, 3));
        const hasRotationCurve = !isAllNull(fbxAnimCurves.slice(3, 6));
        const hasScalingCurve = !isAllNull(fbxAnimCurves.slice(6, 9));

        let startTime = Infinity;
        let duration = 0;
        for (const fbxAnimCurve of fbxAnimCurves) {
            if (fbxAnimCurve) {
                const curveTimeInterval = new fbxSdk.FbxTimeSpan();
                fbxAnimCurve.GetTimeInterval(curveTimeInterval);
                const curveStart = curveTimeInterval.GetStart().GetSecondDouble();
                const curveDuration = curveTimeInterval.GetDuration().GetSecondDouble();
                startTime = Math.min(curveStart, startTime);
                duration = Math.max(curveDuration, duration);
            }
        }

        duration = Math.min(duration, capDuration);
        startTime = Math.max(startTime, capStartTime);

        if (duration === 0) {
            return;
        }

        const nFrames = Math.ceil(duration / sampleStep);

        const timeChannel: number[] = new Array(nFrames).fill(0);
        const translationChannel: number[] = !hasTranslationCurve ? [] : new Array(3 * nFrames).fill(0);
        const rotationChannel: number[] = !hasRotationCurve ? [] : new Array(4 * nFrames).fill(0);
        const scaleChannel: number[] = !hasScalingCurve ? [] : new Array(3 * nFrames).fill(0);

        for (let iFrame = 0; iFrame < nFrames; ++iFrame) {
            const sampleTime = startTime + sampleStep * iFrame;
            const fbxSampleTime = new fbxSdk.FbxTime();
            fbxSampleTime.SetSecondDouble(sampleTime);

            const localTransform = fbxNode.EvaluateLocalTransform(fbxSampleTime);
            const translation = localTransform.GetT();
            const rotation = localTransform.GetQ();
            rotation.Normalize();
            const scale = localTransform.GetS();

            timeChannel[iFrame] = sampleTime - startTime;
            if (hasTranslationCurve) {
                translationChannel[3 * iFrame + 0] = translation.GetX();
                translationChannel[3 * iFrame + 1] = translation.GetY();
                translationChannel[3 * iFrame + 2] = translation.GetZ();
            }
            if (hasRotationCurve) {
                rotationChannel[4 * iFrame + 0] = rotation.GetAt(0);
                rotationChannel[4 * iFrame + 1] = rotation.GetAt(1);
                rotationChannel[4 * iFrame + 2] = rotation.GetAt(2);
                rotationChannel[4 * iFrame + 3] = rotation.GetAt(3);
            }
            if (hasScalingCurve) {
                scaleChannel[3 * iFrame + 0] = scale.GetX();
                scaleChannel[3 * iFrame + 1] = scale.GetY();
                scaleChannel[3 * iFrame + 2] = scale.GetZ();
            }
        }

        const nodeTrsCurves: Record<string, {
            data: Float32Array,
            type: string;
            component: number;
        }> = {};
        if (hasTranslationCurve) {
            nodeTrsCurves['translation'] = {
                data: Float32Array.from(translationChannel),
                type: glTF.VEC3,
                component: glTF.FLOAT,
            }
        }
        if (hasRotationCurve) {
            nodeTrsCurves['rotation'] = {
                data: Float32Array.from(rotationChannel),
                type: glTF.VEC4,
                component: glTF.FLOAT,
            }
        }
        if (hasScalingCurve) {
            nodeTrsCurves['scale'] = {
                data: Float32Array.from(scaleChannel),
                type: glTF.VEC3,
                component: glTF.FLOAT,
            }
        }

        const targetNodeIndex = convertContext.getNode(fbxNode);

        const minTime = Math.min(...timeChannel);
        const maxTime = Math.max(...timeChannel);
        const timeData = Float32Array.from(timeChannel);
        const timeBufferViewInfo = glTFBuilder.createBufferView(timeData.byteLength, 0, 0);
        new Float32Array(timeBufferViewInfo.data).set(timeData);
        const timeAccessor: glTF.Accessor = {
            name: `${glTFBuilder.glTFRoot.nodes![targetNodeIndex].name}-Time`,
            bufferView: timeBufferViewInfo.index,
            componentType: glTF.FLOAT,
            type: glTF.SCALAR,
            count: timeData.length,
            min: [minTime],
            max: [maxTime],
        };
        const timeAccessorIndex = glTFBuilder.addAccessor(timeAccessor);

        for (const path of Object.keys(nodeTrsCurves)) {
            const { data, type: glTFType, component: glTFComponent } = nodeTrsCurves[path];
            const bufferViewInfo = glTFBuilder.createBufferView(data.byteLength, 0, 0);
            new Float32Array(bufferViewInfo.data).set(data);
            const accessor: glTF.Accessor = {
                name: `${glTFBuilder.glTFRoot.nodes![targetNodeIndex].name}-${path}`,
                bufferView: bufferViewInfo.index,
                componentType: glTFComponent,
                type: glTFType,
                count: nFrames,
            };
            const accessorIndex = glTFBuilder.addAccessor(accessor);
            const sampler: glTF.AnimationSampler = {
                input: timeAccessorIndex,
                output: accessorIndex,
            };
            const samplerIndex = glTFAnimation.samplers.length;
            glTFAnimation.samplers.push(sampler);
            const target: glTF.AnimationChannelTarget = {
                node: targetNodeIndex,
                path,
            };
            const glTFChannel: glTF.AnimationChannel = {
                sampler: samplerIndex,
                target,
            };
            glTFAnimation.channels.push(glTFChannel);
        }
    }
}

class ConvertContext {
    private _nodeMap: Record<number, number> = {};
    public flipV: boolean = true;
    public imageProcess = ImageProcess.reference;
    constructor() {
    }

    public setNodeMap(fbxNode: fbxSdk.FbxNode, glTFNodeIndex: number) {
        const fbxNodeId = fbxNode.GetUniqueID();
        this._nodeMap[fbxNodeId] = glTFNodeIndex;
    }

    public getNode(fbxNode: fbxSdk.FbxNode) {
        const fbxNodeId = fbxNode.GetUniqueID();
        if (!(fbxNodeId in this._nodeMap)) {
            throw new Error(`FBX Node "${fbxNode.GetName()}" is not mapped.`);
        }
        return this._nodeMap[fbxNodeId];
    }

    public getNodeIf(fbxNode: fbxSdk.FbxNode): undefined | number {
        const fbxNodeId = fbxNode.GetUniqueID();
        return this._nodeMap[fbxNodeId];
    }
}

enum ImageProcess {
    reference,
}

function GetVertexAttribute<T>(element: fbxSdk.FbxLayerElementTemplate<T>, controlPointIndex: number, polygonVertexIndex: number) {
    const mappingMode = element.GetMappingMode();
    const referenceMode = element.GetReferenceMode();
    switch (mappingMode) {
        case fbxSdk.FbxLayerElement.eByControlPoint:
            switch (referenceMode) {
                case fbxSdk.FbxLayerElement.eDirect:
                    return element.GetDirectArray().GetAt(controlPointIndex);
                case fbxSdk.FbxLayerElement.eIndexToDirect:
                    return element.GetDirectArray().GetAt(element.GetIndexArray().GetAt(controlPointIndex));
                default:
                    throw new Error(`Unknown reference mode`);
            }
        case fbxSdk.FbxLayerElement.eByPolygonVertex:
            switch (referenceMode) {
                case fbxSdk.FbxLayerElement.eDirect:
                    return element.GetDirectArray().GetAt(polygonVertexIndex);
                case fbxSdk.FbxLayerElement.eIndexToDirect:
                    return element.GetDirectArray().GetAt(element.GetIndexArray().GetAt(polygonVertexIndex))
                default:
                    throw new Error(`Unknown reference mode`);
            }
        default:
            throw new Error(`Unknown mapping mode`);
    }
}

function fbxVector3ToArray(vec: fbxSdk.FbxVector4) {
    return [
        vec.GetX(),
        vec.GetY(),
        vec.GetZ(),
    ];
}

function fbxVector2ArrayToArray(vs: fbxSdk.FbxVector2[], storage: Float32ArrayConstructor) {
    const result = new storage(2 * vs.length);
    for (let i = 0; i < vs.length; ++i) {
        result[2 * i + 0] = vs[i].GetX();
        result[2 * i + 1] = vs[i].GetY();
    }
    return result;
}

function fbxVector3ArrayToArray(vs: fbxSdk.FbxVector4[], storage: Float32ArrayConstructor) {
    const result = new storage(3 * vs.length);
    for (let i = 0; i < vs.length; ++i) {
        result[3 * i + 0] = vs[i].GetX();
        result[3 * i + 1] = vs[i].GetY();
        result[3 * i + 2] = vs[i].GetZ();
    }
    return result;
}

function fbxVector4ArrayToArray(vs: fbxSdk.FbxVector4[], storage: Float32ArrayConstructor) {
    const result = new storage(4 * vs.length);
    for (let i = 0; i < vs.length; ++i) {
        result[4 * i + 0] = vs[i].GetX();
        result[4 * i + 1] = vs[i].GetY();
        result[4 * i + 2] = vs[i].GetZ();
        result[4 * i + 3] = vs[i].GetW();
    }
    return result;
}

function fbxColorArrayToArray(vs: fbxSdk.FbxColor[], storage: Float32ArrayConstructor) {
    const result = new storage(4 * vs.length);
    for (let i = 0; i < vs.length; ++i) {
        result[4 * i + 0] = vs[i].mRed;
        result[4 * i + 1] = vs[i].mGreen;
        result[4 * i + 2] = vs[i].mBlue;
        result[4 * i + 3] = vs[i].mAlpha;
    }
    return result;
}

function fbxAMatrixArrayToArray(matrices: fbxSdk.FbxAMatrix[], storage: Float32ArrayConstructor) {
    const result = new storage(16 * matrices.length);
    for (let i = 0; i < matrices.length; ++i) {
        const matrix = matrices[i];
        // glTF uses column-major matrices
        // result[16 * i + 0] = matrix.Get(0, 0);
        // result[16 * i + 1] = matrix.Get(1, 0);
        // result[16 * i + 2] = matrix.Get(2, 0);
        // result[16 * i + 3] = matrix.Get(3, 0);
        // result[16 * i + 4] = matrix.Get(0, 1);
        // result[16 * i + 5] = matrix.Get(1, 1);
        // result[16 * i + 6] = matrix.Get(2, 1);
        // result[16 * i + 7] = matrix.Get(3, 1);
        // result[16 * i + 8] = matrix.Get(0, 2);
        // result[16 * i + 9] = matrix.Get(1, 2);
        // result[16 * i + 10] = matrix.Get(2, 2);
        // result[16 * i + 11] = matrix.Get(3, 2);
        // result[16 * i + 12] = matrix.Get(0, 3);
        // result[16 * i + 13] = matrix.Get(1, 3);
        // result[16 * i + 14] = matrix.Get(2, 3);
        // result[16 * i + 15] = matrix.Get(3, 3);
        
        result[16 * i + 0] = matrix.Get(0, 0);
        result[16 * i + 1] = matrix.Get(0, 1);
        result[16 * i + 2] = matrix.Get(0, 2);
        result[16 * i + 3] = matrix.Get(0, 3);
        result[16 * i + 4] = matrix.Get(1, 0);
        result[16 * i + 5] = matrix.Get(1, 1);
        result[16 * i + 6] = matrix.Get(1, 2);
        result[16 * i + 7] = matrix.Get(1, 3);
        result[16 * i + 8] = matrix.Get(2, 0);
        result[16 * i + 9] = matrix.Get(2, 1);
        result[16 * i + 10] = matrix.Get(2, 2);
        result[16 * i + 11] = matrix.Get(2, 3);
        result[16 * i + 12] = matrix.Get(3, 0);
        result[16 * i + 13] = matrix.Get(3, 1);
        result[16 * i + 14] = matrix.Get(3, 2);
        result[16 * i + 15] = matrix.Get(3, 3);
    }
    return result;
}

function fbxQuatToArray(quat: fbxSdk.FbxQuaternion) {
    return [
        quat.GetAt(0),
        quat.GetAt(1),
        quat.GetAt(2),
        quat.GetAt(3),
    ];
}

function getGeometricTransform(fbxNode: fbxSdk.FbxNode) {
    const meshTranslation = fbxNode.GetGeometricTranslation(fbxSdk.FbxNode.eSourcePivot)
    const meshRotation = fbxNode.GetGeometricRotation(fbxSdk.FbxNode.eSourcePivot)
    const meshScaling = fbxNode.GetGeometricScaling(fbxSdk.FbxNode.eSourcePivot)
    const meshTransform = new fbxSdk.FbxMatrix(new fbxSdk.FbxAMatrix(meshTranslation, meshRotation, meshScaling))
    const normalTransform = new fbxSdk.FbxMatrix(new fbxSdk.FbxVector4(), meshRotation, meshScaling)
    const normalTransformIT = normalTransform.Inverse().Transpose()
    return { meshTransform, normalTransform: normalTransformIT }
}

function getRoughnessFromExponentShininess(shininess: number) {
    const glossiness = Math.log(shininess) / Math.log(1024.0);
    return Math.min(Math.max(1 - glossiness, 0), 1)
}

function getMetalnessFromSpecular(specular: [number, number, number], baseColorFactor: [number, number, number, number]) {
    return specular[0] > 0.5 ? 1 : 0;
}

function GetComponents(type: string) {
    switch (type) {
        case glTF.SCALAR: return 1;
        case glTF.VEC2: return 2;
        case glTF.VEC3: return 3;
        case glTF.VEC4: return 4;
        case glTF.MAT2: return 4;
        case glTF.MAT3: return 9;
        case glTF.MAT4: return 16;
        default:
            throw new Error(`Unknown component`);
    }
}

interface JointsWeights {
    elements: InfluencePer4LayerElement[];
}

type WeightsPer4 = [number, number, number, number];

type JointsPer4 = [number, number, number, number];

type InfluencesPer4 = [JointsPer4, WeightsPer4];

type InfluencePer4LayerElement = InfluencesPer4[];

const glTFExtensionFbxSdkTextureInfoName = 'COCOS_fbxsdk_texture_info';

interface GLTFExtensionFbxSdkTextureInfo {
    fileName: string;
    relativeFileName: string;
}