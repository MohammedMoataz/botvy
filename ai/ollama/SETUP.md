# Installing the model server

Ollama runs **natively on the host**, not in a container, so it can reach the
GPU. Every containerised service talks to it over `OLLAMA_BASE_URL`
(`.env`, default `http://host.docker.internal:11434`).

Two settings matter more than the rest, and one of them is the single most
common Botvy setup failure:

- **`OLLAMA_HOST=0.0.0.0:11434`.** The default binds loopback only, and a
  container cannot reach the host's loopback. Without this, `/health` reports
  `ollama false` and every chat turn fails with nothing in the model server's log
  — because the request never arrived.
- **`OLLAMA_KEEP_ALIVE=-1`.** Keeps the model resident so the first request
  after an idle period does not pay a cold load.

---

## Windows

1. Install Ollama: <https://ollama.com/download/windows>

2. Set both variables as **User** variables so they survive a reboot, then
   restart the app so it picks them up:

   ```powershell
   [Environment]::SetEnvironmentVariable('OLLAMA_HOST','0.0.0.0:11434','User')
   [Environment]::SetEnvironmentVariable('OLLAMA_KEEP_ALIVE','-1','User')
   Stop-Process -Name "ollama app","ollama" -Force
   Start-Process "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe"
   ```

3. Scope the firewall, so binding to `0.0.0.0` does not mean "reachable from the
   whole network". **Needs an elevated PowerShell**:

   ```powershell
   New-NetFirewallRule -DisplayName "Botvy-Ollama-DockerWSL" -Direction Inbound `
     -Protocol TCP -LocalPort 11434 -Action Allow `
     -RemoteAddress 172.16.0.0/12,127.0.0.1 -Profile Any
   ```

   `172.16.0.0/12` covers the Docker bridge and the WSL2 vEthernet subnets.
   Verify with `docker network inspect bridge` and `Get-NetIPAddress` if a Docker
   Desktop or WSL update ever moves them.

## Linux

Install Ollama, then run it as a **user** systemd unit — no root needed:

```bash
mkdir -p ~/.config/systemd/user
cp ai/ollama/ollama.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now ollama
```

For it to survive logout and start at boot, enable lingering once. This is the
one step that needs root:

```bash
sudo loginctl enable-linger "$USER"
```

Adjust `ExecStart` in the unit if Ollama is not unpacked at `~/opt/ollama`. The
unit already sets both environment variables above; the firewall is yours to
scope (`ufw allow from 172.16.0.0/12 to any port 11434`, or equivalent).

---

## Pull the models

**Botvy never pulls.** A model named in the settings registry but absent from
the host fails every request that uses it. Pull whatever those keys name — by
default one model covers all three roles:

```bash
ollama pull qwen2.5:3b-instruct
```

The keys are `llm.chatModel`, `llm.extractModel` and `llm.summarizeModel`; see
[`../README.md`](../README.md) for what each does and the two traps in choosing
a different one.

---

## Check it

```bash
# from the host
curl http://localhost:11434/api/tags

# from inside a container — this is the check that actually matters, because it
# is the one the backend makes
docker run --rm curlimages/curl -s http://host.docker.internal:11434/api/tags

# residency: size_vram must equal size, or the model has spilled to the CPU
curl -s http://localhost:11434/api/ps

# throughput, schema-constrained output and container reachability in one pass
./ai/ollama/benchmark.sh qwen2.5:3b-instruct
```

Then `curl -s http://localhost:${EDGE_PORT:-80}/health` and look for
`"ollama": true`.

## When it is wrong

| Symptom | Cause |
|---|---|
| `/health` says `ollama false`, `curl localhost:11434` from the host works | `OLLAMA_HOST` is still loopback, or the app was not restarted after setting it |
| First token takes tens of seconds, every time | two different context sizes in play — `llm.numCtx` is one key for every call, so this means something is bypassing it |
| Answers arrive at a few tokens per second | the model spilled to the CPU; check `/api/ps`, then use a smaller model |
| Extraction returns a `thinking` field, or never returns | a thinking model (`qwen3`) in `llm.extractModel`; use an **instruct** model |
| `model 'x' not found` | nobody pulled it on this host after the registry key changed |
