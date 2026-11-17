+++
title = "Quarantine modified firmware and a device that cannot attest, then attack the gateway"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "Flash a validly signed but modified image and watch the gateway quarantine it and revoke its credential, quarantine an Arduino that has nothing to prove, and run a harness that tries to break the parsers and the protocol."
weight = 20

[params]
  lab = 51
  board = "PolarFire SoC Discovery Kit, STM32H573I-DK, Arduino Uno R3"
  core = "U54 (Linux), Cortex-M33, ATmega328P"
  level = "Advanced"
+++

After this lab you have watched the gateway refuse firmware that is genuinely signed and boots normally, refuse a device that has
no keys, and survive a harness that tries to make it accept something it should not. You know which two defects the harness found.

## Before you start

- A working bench from [reproduce the bench](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/a01-reproduce-the-bench/),
  with the STM32 admitted.
- STM32CubeProgrammer on the PC and the ST-LINK cable connected, because the demo writes the STM32's non-secure slot twice.
- Back up the STM32 first. The demo only touches the non-secure slot; the backup is for your peace of mind and for the
  secure slot.

## The idea

A signature on firmware proves who signed it, not that it is the firmware you intended. The key that signs the images on this
bench is the published TF-M development key, so a modified image can carry a perfectly valid signature and boot without an
error. What changes is its **measurement**: the hash that the boot loader records. The gateway's policy lists the measurements it
allows, so the modified image is recognised by what it *is*, not by who signed it.

A device with no secure hardware cannot produce a measurement at all. It is refused for that reason.

## Run it

### 1. The scripted demo

```sh
tools/demo.sh
```

It takes about two minutes and every verdict comes from the real boards:

1. The PC verifies the gateway's own ML-DSA-65 quote with a fresh nonce.
2. The gateway attests the STM32 and keeps its ML-KEM session alive.
3. A **modified non-secure image**, signed with the trusted key, is flashed. The gateway reports **QUARANTINED**
   (the signature is valid; the non-secure measurement is not allowed) and the credential and session key are deleted.
4. The good image is flashed back. The gateway reports **ADMITTED** with a new credential and a new session.

![An image signed with the trusted key boots, its measurement differs from the policy, and the gateway quarantines the endpoint and revokes its credential](/aegis/diagrams/tamper-detection.svg)

A recorded run of the two images and the verdicts, from the gateway journal:

| Time (UTC) | Event | Verdict |
|---|---|---|
| 14:51:19 | good image | ADMITTED, credential issued |
| 14:51:50 | | ADMITTED, credential valid |
| 14:52:22 to 14:53:24 | modified non-secure image | QUARANTINED, non-secure component not allowed, credential revoked |
| 14:53:57 | good image again | ADMITTED, new credential, new session |

The script reads its verdicts from the gateway service's journal and uses a one-off check that never starts a second key
exchange next to the service. The journal of one run, played with callouts:

![The gateway journal during the demo: quarantine without a quote, admission with a session and heartbeats, quarantine on a modified measurement, admission again with a new session](/aegis/diagrams/console-demo-journal.svg)

### 2. The device that cannot attest

An Arduino Uno runs a small sketch that prints a reading every two seconds and answers any request with one line:

```text
LEGACY-SENSOR uno v1 cannot attest
```

The Uno has no network interface, so a PC process exposes its serial port on TCP 7445 and the policy lists it as an ordinary
endpoint. The gateway asks for a token and gets that line. Every cycle the journal shows:

```text
arduino-uno-legacy QUARANTINED no attestation: no token in reply: 'LEGACY-SENSOR uno v1 cannot attest; requ...'
```

If the relay is down, the verdict is the same with a different reason (`Connection refused`). That is the point: a missing proof
is a refusal, not an error to be ignored. The same holds for a device that disappears. With the whole bench unplugged, the gateway
printed:

![The gateway journal with the bench unplugged: the STM32 quarantined with no route to host and its credential revoked, the Uno quarantined with an empty reply](/aegis/diagrams/console-disconnected.svg) The sketch backup is read with avrdude first and can be written back.

### 3. Attack it

```sh
.venv/bin/python tests/redteam/fuzz_host.py 2000                       # PC only
.venv/bin/python tests/redteam/fuzz_devices.py --stm32 <addr>:7444 --gateway <gateway> --n 40   # real devices
```

What the harness tries:

- **The token parser:** 3,000 mutated, truncated and random PSA tokens. Property: nothing whose signed parts changed is accepted.
- **The gateway's quote service:** 310 malformed frames (garbage, wrong JSON, a huge length prefix, a bad nonce) and a half-open
  client. Property: the service keeps answering and quotes still verify.
- **The verifier against a hostile endpoint:** 800 random reply lines, a valid classic-only token (a downgrade), and a validly
  signed ML-KEM key from an earlier nonce (a replay). Property: never admitted, never provisioned.
- **The real STM32:** 76 malformed commands (bad hex, wrong lengths, 20 to 30 KB lines, key-exchange steps out of order, random
  bytes). **The real gateway:** 240 malformed frames and a half-open client.

| Check | Result |
|---|---|
| Token mutations accepted, unexpected exceptions | 0, 0 (of 3,000) |
| Gateway after 310 malformed frames; with a half-open client | valid quote; 0.001 s on the PC, 72 ms on the board |
| Hostile endpoint replies admitted | 0 of 800 |
| Classic-token downgrade; key replay | refused; refused |
| STM32: 76 malformed commands | 76 refused, a genuine quote still verifies |
| Key-exchange finish without a start | refused with a bad-state error from the secure side |
| Credential signed by a foreign key; or by the gateway's key but for another ciphertext | refused (error -149), no session |

## What the harness found

1. **A token that changed in an unprotected field was accepted.** A mutation turned an empty map into an empty array. The signed
   parts were identical, so nothing was forged, but the format requires a map. The parser now rejects wrong field types.
2. **One slow client could stall the quote service.** It served one connection at a time, so a client that sent half a frame
   held it for the read timeout. The first fuzz run took 9 minutes 45 seconds because of that. Now each connection has its own
   thread, there are at most 8, and each has a 3-second timeout.

A third finding came from preparing the negative tests: a new key-exchange start used to drop an established session, so anyone
who could reach the prover's port could tear a session down. The session is now replaced only when a new exchange completes.

The case study of the stalled service, found by the harness's first long run, is
[one slow client could stall the quote service](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k04-one-slow-client-stalled-the-service/).

## What to check

- The tampered image is quarantined within one cycle (30 s), and a credential file is gone.
- The good image restored returns a different session identifier than before.
- The host fuzz run finishes in seconds, not minutes; if it takes minutes, the stall is back.
- `tools/regression.sh --board` ends with `passed 12, failed 0`.

## Where it can go wrong

- **Replacing code on the gateway changes its own measurement.** The PC verifier will refuse the next quote until you re-enrol.
- **A modified image signed with a key that is not in the policy** is rejected by the boot loader, so it never boots. That is a
  different, earlier failure than the one this lab shows.
- **The demo flashes the STM32.** Disconnect it from anything else you care about while it runs.

## Limits

The harness is a set of properties checked by random and hand-made inputs; it is not a proof. Side channels, fault injection and
power loss during provisioning were not tested. Network enforcement is not part of this lab because one Ethernet port cannot
separate networks; see the [project page](/projects/fpga-soc/microchip-polarfire-soc/aegis/).
