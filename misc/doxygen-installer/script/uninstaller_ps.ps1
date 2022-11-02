Write-Progress -Activity "Uninstalling Doxygen" -Status "Removing Doxygen" -PercentComplete -1
Add-Type -AssemblyName System.IO.Compression.FileSystem

$targetDir = "$env:APPDATA\Doxygen\";
$targetDir2 = "$env:APPDATA\graphviz\";

if( -Not (Test-Path -Path $targetDir ) )
{
    Write-Error "Folder does not exist."
    Write-Progress -Activity "MinGW Doxygen" -Completed
    Write-Host "Uninstallation failed."
    exit
}
Remove-Item -Recurse -Force $targetDir
Remove-Item -Recurse -Force $targetDir2

Write-Progress -Activity "Uninstalling Doxygen" -Status "Removing Doxygen in path" -PercentComplete -1


$path = [System.Environment]::GetEnvironmentVariable(
    'PATH',
    'User'
)
$targetDir2 += "release\bin\";
# Remove unwanted elements
$path = ($path.Split(';') | Where-Object { $_ -ne $targetDir }) -join ';'
$path = ($path.Split(';') | Where-Object { $_ -ne $targetDir2 }) -join ';'
# Set it
[System.Environment]::SetEnvironmentVariable(
    'PATH',
    $path,
    'User'
)

Write-Progress -Activity "Doxygen Uninstallation" -Completed
Write-Host "Uninstallation completed!"