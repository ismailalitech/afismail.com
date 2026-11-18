+++
title = "ELS used before TF-M had set it up: the chip reset a moment later"
date = '2026-11-18T07:55:00+01:00'
draft = false
description = "The Aegis TF-M partition derived its key in ELS at start-up, reported success, and the chip reset anyway, every boot. The debugger showed TF-M's ordinary call path and then a core it could no longer read. A bisect build without ELS ran cleanly; deriving the key at the first request fixed it."
weight = 66

[params]
+++

The first TrustZone build of the RW612 prover
([lab 58](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a12-trustzone-on-the-rw612/))
derived its ML-DSA-65 key in ELS while the Aegis partition started, as the single-image prover does.

## Symptom

The console showed every step of the partition's start-up succeed: both partitions measured, `ELS derivation rc=0`,
`ready=1`. Then `Booting TF-M v2.1.4` again, and again: a reset about once a second, before the non-secure image printed
anything.

## Finding it

- **A breakpoint on TF-M's panic handlers** stopped in `spm_handle_programmer_errors`, called on the way back from the
  non-secure side's first `psa_call`. That looked like the culprit, and was not: TF-M calls that function after every
  call, and it only panics for two error codes. The status was neither.
- **Stopping at the failure itself** showed every core register as `0xDEADBEEF`: the debugger had lost the core. The
  chip was resetting, not running into a TF-M error path.
- **A bisect build** (a debug define, never in a release) replaced the ELS derivation with a fixed seed. It booted once,
  and the non-secure client got a key and a signed quote. So ELS was the trigger, even though every ELS call reported
  success.

## Cause

TF-M's crypto partition initialises ELS in its own start-up (`ELS_PowerDownWakeupInit`: enable, DRBG configuration,
PRNG start). TF-M does not promise an order in which partitions start, so the Aegis partition could use ELS before
that set-up. The derivation itself worked, but the chip reset moments later. That the ordering is the cause is the
best explanation the evidence supports, not a traced one: the mechanism inside ELS was not followed further, and the
remedy below removes the condition either way.

## Fix

The measurements stay at start-up, where they must be, before any non-secure code runs. The key is derived at the
first request instead, by which time every TF-M partition has started and ELS is set up. One attempt per boot: a
failure is not retried, and the service then answers that it has no key.

## Result

One boot, the key from ELS (`rc=0`) at the first request, the same key as before. The general lesson for TF-M on this
chip: do not use a peripheral another partition owns until that partition has initialised it, even when your calls
appear to succeed.
