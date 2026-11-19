+++
title = "A refused key exchange that left half of one behind"
date = '2026-11-18T09:40:00+01:00'
draft = false
description = "The fuzzer's model check stopped every worker within seconds: after a PQKEMINIT refused at its signature, the RW612 partition still had an exchange pending, holding a key nobody had seen. Four reviewers had read past it. The STM32 partition had it too, and accepted credentials into it. Both fixed, and the STM32 fix tested on the board with a replayed message."
weight = 68

[params]
+++

Found by the fuzz harness of
[lab 58](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a12-trustzone-on-the-rw612/), on the
protocol code the RW612's secure partition runs.

## Symptom

```text
ORACLE: PQKEMFIN without an exchange: ERR cred other-key
```

The harness's model expected no exchange to be pending; the device answered as if one were, and refused the
credential because it named a different key.

## Finding it

The failing input was one of the seeds, written to test exactly this:

1. `PQKEMINIT` with a first nonce: answered, the exchange is pending.
2. The platform's random generator set to fail on its second draw.
3. `PQKEMINIT` with a second nonce: its fresh randomness works, the ML-KEM key is made, then the signature over it
   cannot get its random value. The device answers `ERR sign`.
4. `PQKEMFIN` for the first exchange.

The handler for step 3 writes the new nonce, the new encapsulation key and the new decapsulation key into the
exchange state before it signs, and it sets the pending flag only on success. On failure it returned without touching
the flag, so the flag still said "pending" from step 1, over state that now belonged to step 3. An `ERR kem` (the key
generation failing) did the same with the nonce.

## Effect

Not exploitable. The non-secure side, which sends these requests, can always disrupt its own exchanges, and no
credential can name a key that the gateway never received. But the state was wrong: the gateway's credential for the
first exchange was refused, and a decapsulation key nobody would ever use stayed in memory. The security review had
four readers on this code, and none of them noticed it.

## Fix

A valid `PQKEMINIT` now cancels the pending exchange and wipes its decapsulation key before anything else, so a
refusal leaves nothing pending. A request with a malformed nonce still changes nothing. Shipped as 0.2.1.

## The STM32 had it too, worse

The STM32H573 partition was written with the same construction, so the same fuzzer was pointed at it, built on the PC
against stand-ins for TF-M's service API, the attestation service and the SAES unit. Against the unfixed source, two
seeds failed at once:

```text
rng-fails-at-sign       ORACLE: KEM_FINISH without an exchange: 0
replay-after-new-init   ORACLE: credential accepted, but the model says invalid (0)
```

The status `0` is `PSA_SUCCESS`. The STM32 partition did not check that a credential names the pending
exchange's encapsulation key, so it went beyond keeping a half-replaced exchange: it accepted a credential into it. The
same gap let an old `KEM_FINISH`, replayed after a new `KEM_INIT`, replace a working session with a key the gateway
does not share. The fix is the RW612's plus that check (the gateway already names the key).

On STM32 board 2, after a backup of the whole flash, the new secure image went into the secure slot with the same
version, signer and veneer addresses, and the gateway admitted it with only the new measurement allowed. Then the
gateway's own `KEM_FINISH` was captured on the network and replayed at the board:

| Replay | Board's answer |
|---|---|
| with no exchange pending | `PSA_ERROR_BAD_STATE` |
| after a new `KEM_INIT` | `PSA_ERROR_INVALID_SIGNATURE`: the credential names another key |
| the gateway's session | kept: its heartbeats carried on, with no new session issued |

## Result

The seeds pass on both boards' code. After the fix, the RW612 code ran for 30 minutes on 8 workers: 1,049,515
executions, no crash, no sanitizer report, no other disagreement with the model. The STM32 partition ran for 30
minutes on 8 workers: 892,774 executions, nothing found, every function and 90.5 % of the lines reached. Every
line it does not reach is a failure the PC stand-ins never produce or the crypto library never returns, and each is
listed with its reason. One stop on the way was the model's mistake, not the board's. The STM32's heartbeat counter
runs from boot across sessions, where the RW612's restarts with each session; the gateway accepts both. Both harnesses
run in CI on every push, starting with the inputs that found the bug.

Board 1 was not connected on 18 November and kept the previous image. It got the fixed one on 19 November, with a
backup and the gateway in the loop
([lab 64](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a17-the-stm32-from-the-non-secure-side/)):
both STM32 boards now run it.
