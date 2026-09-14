param(
    [string]$SourceProfile = 'production',
    [string]$TargetProfile = 'production-https',
    [Parameter(Mandatory = $true)][string]$PanelUrl
)

$ErrorActionPreference = 'Stop'
if (([Uri]$PanelUrl).Scheme -ne 'https') { throw 'An HTTPS panel URL is required.' }

# Reuse only the explicitly selected EasyPanel Windows credential. The key is
# passed to the CLI over stdin; it is never printed, placed in arguments or saved.
if (-not ('EasyPanelCredentialBridge' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EasyPanelCredentialBridge {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct Credential {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool Read(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("advapi32.dll")]
    public static extern void CredFree(IntPtr credential);
}
'@
}

$pointer = [IntPtr]::Zero
$bytes = $null
$key = $null
try {
    if (-not [EasyPanelCredentialBridge]::Read("io.easypanel.cli:$SourceProfile", 1, 0, [ref]$pointer)) {
        throw 'The selected EasyPanel CLI credential was not found in Windows Credential Manager.'
    }
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][EasyPanelCredentialBridge+Credential])
    $bytes = New-Object byte[] $credential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $bytes.Length)
    $key = [Text.Encoding]::UTF8.GetString($bytes)
    if ($key.Contains([string][char]0)) { $key = [Text.Encoding]::Unicode.GetString($bytes) }
    $null = $key | easypanel server add $TargetProfile $PanelUrl --api-key-stdin --no-use
    if ($LASTEXITCODE -ne 0) { throw 'Unable to connect the HTTPS profile.' }
    $result = easypanel server show $TargetProfile --format json | ConvertFrom-Json
    $result | Select-Object name, url, easypanelVersion, connected | ConvertTo-Json
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [EasyPanelCredentialBridge]::CredFree($pointer) }
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    $key = $null
}
