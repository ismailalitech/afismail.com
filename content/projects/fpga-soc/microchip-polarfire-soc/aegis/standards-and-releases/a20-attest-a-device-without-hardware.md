+++
title = "Attest a device without hardware: the simulated device and the evaluation container"
date = '2026-11-21T09:20:00+01:00'
draft = false
description = "Build a device on the Prover SDK in one C file, and have it enrolled, admitted with a session bound to its quote, heartbeated and quarantined by the same verifier code the PolarFire gateway runs, all on a PC. Then check its evidence pack and the verifier's signed audit log with checkers that import no Aegis code, and break both on purpose. Or run every board-free stage in one container."
weight = 15

[params]
  lab = 67
  board = "None: a Linux PC (x86_64), or any machine with Docker or Podman"
  core = "PC (Linux)"
  level = "Intermediate"
+++

Every lab before this one needs boards. This one needs a PC. It is the shortest way to see the whole protocol run,
and the place to start before porting the
[Prover SDK](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x06-one-prover-sdk/) to a
device of your own: `sdk/examples/simulated-device/sim_device.c` (about 280 lines) is a complete integration, built
against the SDK's static library and its two public headers only, and numbered like the steps of the porting guide.

The simulated device protects nothing. Its "hardware key" is a file, its keys are in process memory and its clock
is the operating system's. It says so: it reports the profile `aegis-linux-software-v1`, and the verifier admits it
with trust `software`, never `trustzone`.

## Before you start

- A Linux PC with a C compiler, `make` and Python 3.
- The Aegis repository: [github.com/ismailalitech/aegis](https://github.com/ismailalitech/aegis), branch `main`.
- mldsa-native and mlkem-native **v2.0.0** in `~/aegis-tools` (or `MLDSA_NATIVE_DIR` and `MLKEM_NATIVE_DIR` set):

  ```sh
  git clone --depth 1 --branch v2.0.0 https://github.com/pq-code-package/mldsa-native.git ~/aegis-tools/mldsa-native
  git clone --depth 1 --branch v2.0.0 https://github.com/pq-code-package/mlkem-native.git ~/aegis-tools/mlkem-native
  ```

- A Python with `cryptography` 47 or later for ML-DSA-65: `tools/setup_host.sh` makes `.venv`. The standalone
  checkers also need `pycose==1.1.0` and `cbor2<6`.
- For the container instead: Docker or Podman, and nothing else.

## Run it

### 1. The device, end to end

```sh
sdk/examples/simulated-device/run.sh
```

![run.sh on the build PC: the SDK and the device built with the EAT option, a verifier identity, the device enrolled and admitted with trust software and a session bound to its quote, a KMAC256 heartbeat, the evidence pack verified without Aegis code, a changed image quarantined, and the audit log verified: 11 entries in 3 signed batches](/aegis/diagrams/console-sim-device.svg)

This run was recorded on the build PC on 21 November 2026, at commit `2c501e6` of `main`. Keys, digests, ports and
the time-to-live differ from run to run. What each step does:

| Step | What happens |
|---|---|
| 2 | `make -C sdk lib examples`: `libaegis_sdk.a` (core, KMAC, SHA-256, mldsa-native, mlkem-native) and the device |
| 3 | a verifier identity on this PC (`aegisd.py init --platform linux`); its public key is the one the device pins |
| 5 | the device derives its identity seed and exchange root from its secret, measures its image once, starts the core |
| 6 | the verifier pins the device key on first use (a product would use an [endorsement](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x05-trust-labels-endorsement-transcript/)) |
| 8 | challenge, quote (an EAT in a COSE_Sign1), appraisal, then an ML-KEM-768 exchange that continues the quote and a credential the device checks against its pinned key |
| 9, 10 | both sides name the same session; a heartbeat is MACed with the session key |
| 11 | the verifier exports the evidence and its signed attestation result, and a checker that imports no Aegis code verifies them |
| 12 | one byte of the image changed and the device restarted: refused on its measurement, the session withdrawn |
| 13 | the verifier's signed audit log of all of it, checked without Aegis code |

The verifier is `gateway/aegisd/fleet.py`, the code the PolarFire runs. Only the platform differs: the verifier's
identity is bound to the chip's serial number and device certificate on the gateway, and to the machine id here.

### 2. Keep the work directory and look inside

```sh
KEEP=1 sdk/examples/simulated-device/run.sh
```

It prints the work directory: the policy, each command's output in `log/`, the evidence pack in `pack/` and the
verifier's state with its audit log in `verifier/audit/`. `AEGIS_EAT_COSE=0` runs the SDK's default evidence (a CBOR
claims map) and skips step 11.

### 3. Check the evidence pack yourself, then break it

Give the checker the two key thumbprints from the verifier's and the device's output, so that it does not take the
keys from the pack:

```sh
.venv/bin/python -I tools/verify_evidence.py pack <work>/pack --verifier-key <thumbprint> --device-key <thumbprint>
```

Then flip one bit of `evidence.cbor` in a copy of the pack and run it again:

![verify_evidence.py on the pack: the evidence, the result and the manifest agree on the evidence hash, the quote hash, the device key, the nonce, the measurements and the policy; the result is an EAR signed with ML-DSA-65, status warning, trust software, enrolled on first use, the session bound by transcript v2; with one bit of the evidence flipped the pack is refused](/aegis/diagrams/console-verify-evidence.svg)

The status is **warning**, not affirming, and that is right: the key was pinned on first use (AR4SI value -33) and
the device measures itself (-35). How the status is derived is in
[standard evidence](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x07-standard-evidence/).

### 4. Check the audit log, then change it and cut it short

```sh
.venv/bin/python -I tools/verify_audit.py log <work>/verifier/audit --key <work>/verifier/identity.json
```

Flip one bit in the second batch record of a copy, and in another copy cut off the last batch record (the record
boundaries are where a CBOR decoder stops; in the recorded run they were at bytes 3825, 8229 and 12503). Check each.
For the cut copy, check it again with `--head N:SHA256`, the last batch's number and hash from the first check:

![verify_audit.py: the log as written, three batches and eleven entries, verified; one bit flipped, the signature of the batch fails; the last batch cut off, the shorter log verifies; with the head of batch 3 given, the cut is found](/aegis/diagrams/console-verify-audit.svg)

The third result is the one to remember: without an anchor kept elsewhere, a log cut at a record boundary is a
valid, shorter log. On the bench, anchors are kept off the gateway for exactly this reason
([the audit log on the bench](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x08-a-signed-audit-log-and-a-signed-policy/)).
The commands and outputs of steps 3 and 4 are recorded in this site's repository, in
`tools/aegis-figures/records/`.

### 5. Or everything without hardware, in one container

```sh
docker build -f container/Dockerfile --build-arg REVISION=$(git rev-parse HEAD) -t aegis-eval .
docker run --rm --network none aegis-eval            # every stage, about 2 minutes
docker run --rm --network none aegis-eval quick      # all but the host tests and the red team
```

The image pins its base by digest, the Ubuntu packages to an archive snapshot and every Python wheel by hash, runs
as an unprivileged user with no network, and holds no keys: every key is made during the run and goes with the
container. Its stages:

| Stage | What it shows |
|---|---|
| `release-hygiene` | every source file names its licence, no key or secret is tracked |
| `sdk-golden` | the SDK core answers byte for byte as recorded |
| `sdk-api-reference` | the API reference is the header's |
| `simulated-device` | step 1 above |
| `gateway-quote` | the gateway's quote service on a Linux host and the PC verifier of it |
| `host-tests` | the host test suite, `tests/host` |
| `redteam-host` | 2,000 malformed tokens and quotes against the verifier's parsers |

The expected output is in [`container/README.md`](https://github.com/ismailalitech/aegis/blob/main/container/README.md).
The container was not run for this page: the build PC's user has no access to the Docker daemon. CI builds and runs
it on every push.

## What to check

- `RESULT: PASS` and the exit status 0. The script stops at the first step that fails and keeps the work directory
  with every command's output in `log/`.
- Step 8 says `trust software` and `session bound to the quote`. Anything higher than `software` would be wrong for a
  device whose key is a file.
- The checker's report says `"trusted": "given on the command line"` for both keys. Without the thumbprints it says
  `NOT CHECKED`: the keys in a pack are there for convenience, not as proof.
- A changed pack and a changed log are refused; a log cut short is refused only with a head or an anchor.

## Where it can go wrong

- **No ML-DSA in Python.** Step 1 fails with a `cryptography` older than 47. Use `tools/setup_host.sh`.
- **The checker skips its work.** Without `pycose` 1.1.0 and `cbor2` 5.x it cannot run; CI fails a skipped checker
  test for that reason.
- **Reading warning as a failure.** For this device warning is the correct status; the verdict is still ADMITTED.
- **The container cannot reach the snapshot archive.** The build fetches pinned packages over HTTPS from the Ubuntu
  snapshot service; `--build-arg UBUNTU_SNAPSHOT=` uses the current archive instead, at the cost of the pin.
- **The 14 skipped host tests in the container** are those of the TPM-sealed verifier key: they need `swtpm` or a real
  TPM, which the container does not have.

The device's README:
[`sdk/examples/simulated-device/README.md`](https://github.com/ismailalitech/aegis/blob/main/sdk/examples/simulated-device/README.md).
