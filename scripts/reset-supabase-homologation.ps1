param(
  [Parameter(Mandatory = $true)]
  [string]$ExpectedProjectRef
)

$ErrorActionPreference = 'Stop'
$productionProjectRefs = @(
  'inquppkbkmhnbtwpriuw'
)
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$linkedRefPath = Join-Path $projectRoot 'supabase\.temp\project-ref'

if (-not (Test-Path -LiteralPath $linkedRefPath)) {
  throw 'Projeto Supabase nao vinculado. Use supabase link somente com o projeto de homologacao.'
}

$linkedProjectRef = (Get-Content -Raw -LiteralPath $linkedRefPath).Trim()
$normalizedExpectedRef = $ExpectedProjectRef.Trim()

if (-not $normalizedExpectedRef) {
  throw 'ExpectedProjectRef nao pode ser vazio.'
}

if ($productionProjectRefs -contains $linkedProjectRef) {
  throw "Reset recusado: $linkedProjectRef esta protegido como producao/ambiente atual."
}

if ($linkedProjectRef -ne $normalizedExpectedRef) {
  throw "Reset recusado: projeto vinculado ($linkedProjectRef) difere do esperado ($normalizedExpectedRef)."
}

if ($env:SUPABASE_HOMOLOG_PROJECT_REF -ne $normalizedExpectedRef) {
  throw 'Defina SUPABASE_HOMOLOG_PROJECT_REF com o mesmo identificador de homologacao.'
}

Write-Output "Projeto de homologacao confirmado: $linkedProjectRef"
& npx.cmd supabase db reset --linked

if ($LASTEXITCODE -ne 0) {
  throw "Supabase CLI encerrou com codigo $LASTEXITCODE."
}
