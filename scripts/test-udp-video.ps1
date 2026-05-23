$ErrorActionPreference = "Stop"

if (-not $env:STREAM_TYPE) { $env:STREAM_TYPE = "file" }
if (-not $env:DISPATCHER_ENABLED) { $env:DISPATCHER_ENABLED = "false" }
if (-not $env:UDP_VIDEO_PORT) { $env:UDP_VIDEO_PORT = "4000" }
if (-not $env:DURATION_MS) { $env:DURATION_MS = "30000" }
if (-not $env:SEGMENT_BYTES) { $env:SEGMENT_BYTES = "104857600" }
if (-not $env:UDP_PAYLOAD_BYTES) { $env:UDP_PAYLOAD_BYTES = "32768" }
if (-not $env:MIN_SLEEP_MS) { $env:MIN_SLEEP_MS = "0" }
if (-not $env:MAX_SLEEP_MS) { $env:MAX_SLEEP_MS = "8" }

Write-Host "[test] Start the server in another terminal first:"
Write-Host "[test]   `$env:STREAM_TYPE='file'; `$env:DISPATCHER_ENABLED='false'; npm run dev"
Write-Host "[test] Sending ordered UDP video stream for $env:DURATION_MS ms..."

npm run send:example
