
if (-not (Test-Path "fbxsdk-node")) {
    New-Item -ItemType Directory "fbxsdk-node"
}
New-Item -ItemType SymbolicLink -Path fbxsdk-node -Name fbxsdk.node -Value "X:\Repos\Leslie\fbxsdk-node\build\Debug\fbxsdk.node"
New-Item -ItemType SymbolicLink -Path fbxsdk-node -Name fbxsdk-node.d.ts -Value "X:\Repos\Leslie\fbxsdk-node\fbxsdk-node.d.ts"
