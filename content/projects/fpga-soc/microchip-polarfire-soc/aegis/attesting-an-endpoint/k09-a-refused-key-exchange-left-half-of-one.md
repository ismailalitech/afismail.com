+++
title = "A refused key exchange that left half of one behind"
date = '2026-11-18T09:40:00+01:00'
draft = false
description = "The fuzzer's model check stopped every worker within seconds: after a PQKEMINIT refused at its signature, the RW612 partition still had an exchange pending, holding a key nobody had seen. Four reviewers had read past it. A valid PQKEMINIT now cancels the pending exchange first."
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
refusal leaves nothing pending. A request with a malformed nonce still changes nothing. Shipped as 0.2.1. The STM32
partition has the same pattern and needs the same change.

## Result

The seed passes. After the fix, 8 workers ran for 30 minutes: 1,049,515 executions, no crash, no sanitizer report,
no other disagreement with the model. The seed stays in the corpus that CI runs on every push.
