# Ollama setup (feature 001-foundation)

Ollama runs **natively on the Windows host**, not inside Docker — this is
required for GPU access on Windows (Docker Desktop's Linux containers
cannot see the host's NVIDIA GPU the way a native process can with the
Windows NVIDIA driver). Every containerized service (the gateway, later)
reaches it via `host.docker.internal:11434`.

## One-time setup

1. Install Ollama for Windows (already done on this machine): https://ollama.com/download/windows
2. Set two **User** environment variables (persists across reboots) and
   restart the Ollama app so it picks them up:
   ```powershell
   [Environment]::SetEnvironmentVariable('OLLAMA_HOST','0.0.0.0:11434','User')
   [Environment]::SetEnvironmentVariable('OLLAMA_KEEP_ALIVE','-1','User')
   # then quit Ollama from the tray icon and relaunch it, or:
   Stop-Process -Name "ollama app","ollama" -Force
   Start-Process "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe"
   ```
   `OLLAMA_HOST=0.0.0.0:11434` is required so Docker containers can reach
   the API via `host.docker.internal`; the default (`127.0.0.1`) is
   loopback-only and containers cannot reach it. `OLLAMA_KEEP_ALIVE=-1`
   keeps the model resident in VRAM indefinitely — this machine has 32GB
   RAM to spare and reloading a model costs 10-20s, which is unacceptable
   mid-conversation.
3. Scope the firewall so binding to `0.0.0.0` doesn't mean "reachable from
   anywhere" — restrict inbound 11434 to loopback + the Docker/WSL virtual
   subnet only. **Requires an elevated (Run as Administrator) PowerShell**:
   ```powershell
   New-NetFirewallRule -DisplayName "Botvy-Ollama-DockerWSL" -Direction Inbound `
     -Protocol TCP -LocalPort 11434 -Action Allow `
     -RemoteAddress 172.16.0.0/12,127.0.0.1 -Profile Any
   ```
   (172.16.0.0/12 covers both the Docker bridge network and the WSL2
   vEthernet subnets Docker Desktop uses on this machine — verify with
   `docker network inspect bridge` and `Get-NetIPAddress` if the subnet
   ever changes, e.g. after a Docker Desktop or WSL update.)
4. Pull the model:
   ```powershell
   ollama pull qwen3:4b
   ```

## Verification

```powershell
# From the host:
curl http://localhost:11434/api/tags

# From inside a container (proves the gateway will be able to reach it):
docker run --rm curlimages/curl -s http://host.docker.internal:11434/api/tags

# Streamed chat completion + throughput benchmark:
# see infra/docs/benchmark-ollama.ps1
```

Gate: streamed throughput must be **≥ 12 tokens/second** for `qwen3:4b` on
this machine's GTX 1050 (4GB VRAM) — this is the number the chat SSE
pipeline's UX (Feature 002+) is designed around.

## Model role map (referenced by the gateway from Feature 002 onward)

| Role | Model | Notes |
|---|---|---|
| Chat / intent extraction | `qwen3:4b` | resident (`OLLAMA_KEEP_ALIVE=-1`), used for every interactive request |
| Nightly program generation (v2 feature) | a larger 7-8B Q4 model | not pulled in this feature — scheduled-only workload can tolerate the load-time cost of swapping models |
