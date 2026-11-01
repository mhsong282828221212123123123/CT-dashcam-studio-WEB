# Generated MP4 timing fixtures

These small test patterns contain no user footage or telemetry. They were generated
with FFmpeg (`testsrc2=size=64x64:rate=24` / `rate=30`, one second,
`libx264 -bf 0 -pix_fmt yuv420p`) to verify each file's own sample timestamps.
