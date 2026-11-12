param([string]$Project = 'lghicare-861b3', [string]$Region = 'us-central1', [string]$Service = 'nextapp')
$ErrorActionPreference = 'Stop'
# Read-only: no deployment, tag removal, scaling or traffic changes are executed.
$serviceInfo = gcloud run services describe $Service --project=$Project --region=$Region --format=json | Out-String | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Unable to read Cloud Run service.' }
$results = foreach ($traffic in $serviceInfo.status.traffic) {
  if (-not $traffic.tag) { continue }
  $revision = gcloud run revisions describe $traffic.revisionName --project=$Project --region=$Region --format=json | Out-String | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read Cloud Run revision.' }
  [PSCustomObject]@{ Revision=$traffic.revisionName; Tag=$traffic.tag; Traffic=[int]$traffic.percent; MinimumInstances=[int]$revision.metadata.annotations.'autoscaling.knative.dev/minScale'; CPU=$revision.spec.containers[0].resources.limits.cpu; Memory=$revision.spec.containers[0].resources.limits.memory; ReviewTagRemoval=([int]$traffic.percent -eq 0) }
}
$results | Format-Table -AutoSize
$unused = @($results | Where-Object { $_.ReviewTagRemoval -and $_.MinimumInstances -gt 0 })
if ($unused.Count) {
  Write-Output 'Review only: revisions can remain available for rollback without traffic tags.'
  Write-Output ('Suggested command, NOT executed: gcloud run services update-traffic ' + $Service + ' --project=' + $Project + ' --region=' + $Region + ' --remove-tags=' + (($unused | ForEach-Object { $_.Tag }) -join ','))
}
Write-Output 'Keep production CPU, memory and minimum instances unchanged until usage metrics and load tests justify resizing.'
