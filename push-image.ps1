param(
    [string]$ImageName = "courier-app",
    [string]$Registry = "lavanderiapro.azurecr.io"
)

$ErrorActionPreference = "Stop"

$fullImageName = "$Registry/$ImageName"

Write-Host "Building image: $ImageName"
docker build -t $ImageName .
if ($LASTEXITCODE -ne 0) {
    throw "docker build failed."
}

Write-Host "Tagging image: $fullImageName"
docker tag $ImageName $fullImageName
if ($LASTEXITCODE -ne 0) {
    throw "docker tag failed."
}

Write-Host "Pushing image: $fullImageName"
docker push $fullImageName
if ($LASTEXITCODE -ne 0) {
    throw "docker push failed."
}

Write-Host "Image uploaded successfully: $fullImageName"
