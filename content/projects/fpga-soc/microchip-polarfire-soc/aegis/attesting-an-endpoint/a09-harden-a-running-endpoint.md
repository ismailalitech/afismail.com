+++
title = "Harden a running endpoint without losing it: hedged signing and KMAC heartbeats"
date = '2026-11-17T12:00:00+01:00'
draft = false
description = "Change the signing and the heartbeat of an attested STM32 that is in service, one checked step at a time: the gateway first, then the image, then the policy, with a backup and a rollback, and state honestly what can and cannot be seen from outside."
weight = 30

[params]
  lab = 55
  board = "PolarFire SoC Discovery Kit, STM32H573I-DK"
  core = "U54 (Linux), Cortex-M33 (TF-M secure partition)"
  level = "Advanced"
+++

After this lab you can change the cryptography of an endpoint that the gateway is attesting, without a moment where a
wrong image is admitted and without losing the device if something goes wrong. The two changes are small and come from
the project's threat model: the endpoint's ML-DSA-65 signatures get fresh randomness ("hedged" signing), and the
heartbeat tag becomes the standard KMAC256 instead of a hash construction of the project's own.

## Before you start

- [Lab 50](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a04-attest-the-stm32/) working: the
  STM32 admitted, with a session and heartbeats.
- STM32CubeProgrammer and the Aegis repository at release v0.2.0 or later.
- If more than one ST-LINK is connected, the serial number of the right one. Every programmer command below names it
  with `sn=`; without it the tool picks a probe on its own.

## The two changes

**Hedged signing.** ML-DSA signs with a value derived from the key, the message and 32 bytes `rnd`. With `rnd` all
zeros the signature is deterministic: the same message always gives the same signature. FIPS 204 recommends the hedged
form, with `rnd` from a random number generator, because a deterministic signer that is glitched during signing can leak
its key from two related signatures. The partition now takes `rnd` from TF-M's random generator and refuses to sign if it
fails. A build flag keeps the deterministic form for tests.

**KMAC256 heartbeats.** Each cycle the endpoint proves it still holds the session key with a tag over a fresh nonce, a
counter and a status string. The tag was SHA3-256 over a label and those fields, which is sound for SHA-3 but is a
construction of the project's own. It is now the standard one, from NIST SP 800-185:

```text
tag = KMAC256(K = session key, X = nonce || counter || status, L = 256 bits, S = "aegis-hb-v2")
```

The gateway gained a per-endpoint policy entry, `"heartbeat_mac": "kmac256"`. Without it the gateway keeps the first
heartbeat, so the gateway and each endpoint can be switched together, one endpoint at a time. A mismatch is refused.

## Run it

### 1. Check both changes on the PC

```sh
.venv/bin/python -m unittest tests.host.test_kmac tests.host.test_kmac_c tests.host.test_hedged_signing tests.host.test_fleet
```

| Check | Result |
|---|---|
| The gateway's KMAC (standard-library Python) against NIST's KMAC samples 1 to 6 | all six equal |
| The same against pycryptodome on 600 random inputs | equal |
| The partition's KMAC in C, built for the PC, against NIST's KMAC256 samples and 150 random inputs at block edges | equal |
| The partition's signing code signs one message twice | two different signatures, both valid with the gateway's liboqs |
| A KMAC endpoint with a KMAC policy; a KMAC endpoint with the old policy; an unknown MAC name | accepted; refused; refused |

The secure image with both changes builds with the secure-gateway veneers at the same addresses, so the non-secure
prover does not need rebuilding. Its measurement is `a5997cc3...`. On the gateway, KMAC in plain Python takes 46.5 ms
per heartbeat: one heartbeat every 30 seconds is about 0.15 % of one core per endpoint.

### 2. Change it in service, one checked step at a time

![The rollout: a baseline regression and a backup; the gateway code with the policy unchanged, where the old image must stay admitted; the new image, which must be quarantined; the policy, after which the endpoint must be admitted with KMAC heartbeats; a final regression. Any failed check rolls everything back](/aegis/diagrams/hardening-rollout.svg)

**0. Baseline and backup.** Run `tools/regression.sh --board` first: 12 of 12. Then read the whole flash with the core held
in reset, both views and the option bytes, and keep the checksums:

```sh
STM32_Programmer_CLI -c port=SWD sn=<serial> mode=UR -u 0x0C000000 0x200000 flash_s_alias.bin
STM32_Programmer_CLI -c port=SWD sn=<serial> mode=UR -u 0x08000000 0x200000 flash_ns_alias.bin
STM32_Programmer_CLI -c port=SWD sn=<serial> mode=UR -ob displ > option_bytes.txt
```

Check that the secure slot in the backup (offset 0x38000, 320 KiB) is byte-identical to the image you think is running.
It was: that is the image the rollback will write.

**1. The gateway first, policy unchanged.** Copy the old `fleet.py` and `fleet.json` aside, install the new `fleet.py`
and `common/kmac.py`, check KMAC on the gateway against a NIST sample, and restart the fleet service. The old image must
stay admitted, because without a policy change the gateway keeps the first heartbeat.

**2. The image.** Write `tfm-s-v2.3.0-aegis-pq-hb-hedged-kmac.hex` to the secure slot, with verification, and reset:

```sh
STM32_Programmer_CLI -c port=SWD sn=<serial> mode=UR -w tfm-s-v2.3.0-aegis-pq-hb-hedged-kmac.hex -v
STM32_Programmer_CLI -c port=SWD sn=<serial> mode=HOTPLUG -hardRst
```

`PQKEY` must return the same public key as before: the key comes from the chip, not from the image. The gateway must now
quarantine the endpoint, because its policy does not know the new measurement.

**3. The policy.** Set the endpoint's secure-image measurement to `a5997cc3...`, add `"heartbeat_mac": "kmac256"` and
restart the fleet service. The endpoint must be admitted with a new session, and its heartbeats must verify.

**4. Regression again:** 12 of 12.

What the gateway printed through the deployment (copied from the session's terminal output: the gateway's journal is not
kept across reboots):

![The gateway journal during the deployment: the old image admitted under the new gateway code, the new image quarantined on its measurement, admitted with a new session after the policy update, and KMAC heartbeats verifying](/aegis/diagrams/console-hardening-journal.svg)

## What can be seen from outside, and what cannot

It is tempting to check hedged signing by asking for two quotes on the same challenge and comparing the signatures. They
do differ, and both verify with the pinned key, but that shows nothing: the PSA token inside each quote carries TF-M's own
ECDSA signature, which is randomized, so the message the ML-DSA key signs is different every time. Deterministic signing
would give different signatures too.

![Two quotes for one challenge: both ML-DSA-65 signatures verify and differ, but the PSA token's claims are equal while TF-M's ECDSA signature inside it is not, so the signed message differs and this does not show hedging](/aegis/diagrams/console-quote-variation.svg)

So the evidence for hedged signing is the PC test of the partition's own code signing one message twice, and the
measurement of the image the board runs, which the gateway checks every cycle. (The first write-up of this deployment
claimed the quotes "were identical before"; that was never measured and is not true. It has been corrected.)

## What to check

- `PQKEY` gives the same key before and after the new image.
- The new image is quarantined until the policy names it, then admitted with a new session.
- The journal shows the heartbeat counter rising after the change; `tools/regression.sh --board` gives 12 of 12.

## Where it can go wrong

- **The wrong board.** With two ST-LINKs connected, a command without `sn=` may program the other one.
- **Gateway and endpoint out of step.** An endpoint on KMAC with a policy still on the first heartbeat fails its
  heartbeats and is provisioned again every cycle. Switch the policy entry when the image changes, not before.
- **Rolling back:** write the previous secure image back from the backup, restore the old policy entry and `fleet.py`,
  restart the fleet service.
- **Expecting to see hedging from outside.** See above: the place to show it is a test that signs the same message twice.
