Write-Progress -Activity "Installing Doxygen" -Status "Unzipping Doxygen" -PercentComplete -1
Add-Type -AssemblyName System.IO.Compression.FileSystem

$targetDir = "$env:APPDATA\";
$targetDir2 = "$env:APPDATA\graphviz\";

if( -Not (Test-Path -Path $targetDir ) )
{
    New-Item -ItemType directory -Path $targetDir
}

if (Test-Path -Path $($targetDir+"Doxygen")){
    Write-Error "Folder already exists";
    Write-Progress -Activity "Doxygen Installation" -Completed
    Write-Host "Installation failed"
    exit
}
[System.IO.Compression.ZipFile]::ExtractToDirectory("data\Doxygen.zip", $targetDir)
Write-Progress -Activity "Installing Doxygen" -Status "Unzipping Graphviz" -PercentComplete -1

[System.IO.Compression.ZipFile]::ExtractToDirectory("data\graphviz.zip", $targetDir2)

Write-Progress -Activity "Installing Doxygen" -Status "Installing Doxygen in path" -PercentComplete -1
$path = [System.Environment]::GetEnvironmentVariable(
    'PATH',
    'User'
)

$newPath = $targetDir+"Doxygen\";
$newPath2 = $targetDir2 + "release\bin\";
if(-Not [string]::IsNullOrEmpty($path)){
    $newPath = $path+";"+$newPath+";"+$newPath2;
}

[Environment]::SetEnvironmentVariable( "Path", $newPath, "User" );
Write-Progress -Activity "Doxygen Installation" -Completed
Write-Host "Installation completed!"