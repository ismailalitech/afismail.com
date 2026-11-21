+++
title = "Trust labels, endorsed keys and one transcript"
date = '2026-11-21T09:00:00+01:00'
draft = false
description = "An admitted verdict says how far it can be trusted, how the device key came to be trusted, and whether the session belongs to the code that was appraised. The five trust labels as of Aegis 1.1, endorsement at the bench instead of trust on first use, and transcript v2, with what each adds and what it does not."
weight = 50

[params]
+++

ADMITTED alone says too little. Three more questions decide what a verdict is worth, and since Aegis 1.0 the
gateway answers each of them in the verdict and in its signed result
([standard evidence](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x07-standard-evidence/)):

| Question | Answered by | In the signed result |
|---|---|---|
| How strong is the evidence? | the trust label | `aegis.trust` |
| How did the verifier come to trust this device key? | trust on first use, or an endorsement | `aegis.enrolment`, the endorser's claims |
| Does the session belong to the code whose quote was appraised? | transcript v2 | `aegis.session-binding` |

## The trust labels

The label is the verifier's, not the device's. It follows from the entry's kind and the profile it pins in the
policy, so a device cannot raise its own label by claiming more.

![The five trust labels in the order a minimum trust compares them: trustzone, trustzone-devkey, device-key, software and development-shared-key, each with the endpoints of the bench that carry it](/aegis/diagrams/trust-labels-1x.svg)

| Label | Meaning | On the bench |
|---|---|---|
| `trustzone` | a secure world holds a key of the chip; the measurements come from the boot chain or from the secure side before the non-secure image runs | the RW612's TF-M partition; the Zynq UltraScale+ trusted application with its PUF-bound key |
| `trustzone-devkey` | a TF-M endpoint whose PSA token is signed with TF-M's published development attestation key | both STM32s, since Aegis 1.1 |
| `device-key` | a single-image prover with a key of the chip, which measures itself | the RW612's first, Zephyr prover |
| `software` | a key in a file, measurements taken by the software they describe | the Linux prover; the [simulated device](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/a20-attest-a-device-without-hardware/) |
| `development-shared-key` | one key on every chip; refused unless the policy allows it | the Zynq UltraScale+ development profile of [lab 62](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a15-optee-holds-the-key/) |

### What changed in 1.1

Before Aegis 1.1 an STM32 verdict (kind `aegis-pq`) carried no label at all: its quote is TF-M's PSA token, not a
claims map, and the label code only looked at claims maps. A reader of the signed result had to infer the trust
from other claims. In 1.1 such an entry is labelled by the attestation key its policy pins:

- TF-M's published development key (`gateway/policy/keys/tfm-dev-iak.pub.pem`): `trustzone-devkey`, with a warning.
  The signed result's status is then **warning**, not **affirming**, and its `executables` claim says why;
- any other key, one of the device's own: `trustzone`.

The key is recognised by its decoded public key, not by the text of the PEM file. A kind `psa` entry pinned to the
same development key, where that ES256 signature is the only one, is labelled `development-shared-key`.

The reason for the warning is the state of the bench, not a fault of the code. The STM32s run in the Open product
state with TF-M's public signing keys, and the PSA token's ES256 signature is made with a published key. Only the
ML-DSA-65 signature from the key derived from the chip's DHUK is security-relevant
([lab 50](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a04-attest-the-stm32/)).
`trustzone` would overstate that.

One older record reads differently now. In [lab 62](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a15-optee-holds-the-key/)
the gateway printed `trustzone-devkey` for the Zynq UltraScale+ development profile (OP-TEE's development HUK,
the same on every chip). Since 1.1 that profile is labelled `development-shared-key`, and `trustzone-devkey` means
only the TF-M case above ([release notes 1.1](https://github.com/ismailalitech/aegis/blob/main/docs/release-notes-1.1.md)).

### A floor and a switch, in review for 1.2

Aegis 1.2 is in review ([pull request 53](https://github.com/ismailalitech/aegis/pull/53)) and not on the bench.
It adds two policy keys:

- `"min_trust"`, per entry or for the whole policy, compares labels in the order of the figure above. A verdict
  below the floor, or one without a label, is refused with the reason `trust X below min_trust Y` and the signed
  status **contraindicated**. `fleet.py check` fails a floor that an entry can never meet.
- `"disabled": true` takes an entry out of service without deleting it: the endpoint is not contacted, it is
  quarantined with the reason `disabled by policy`, its session is revoked, and the signed status is
  **incomplete**.

## Endorsed keys instead of trust on first use

Until 20 November 2026 a device key was pinned the first time the gateway asked for it. Whoever answered on that
address first became the device. Now a policy entry can require an **endorsement**: a record signed by an endorser
the policy lists, naming one device, its family and exactly one key
([`docs/enrolment.md`](https://github.com/ismailalitech/aegis/blob/main/docs/enrolment.md)).

The endorser runs on the bench PC, with its ML-DSA-65 key sealed to the PC's TPM. It asks the device for its key,
sends a fresh challenge, checks the quote against its own reference list, shows the operator the key's hash and the
components, and signs only after a typed `yes`. No firmware changed for this: it uses the `PQKEY` and `PQCHAL`
commands every image has had.

![The gateway journal when endorsement became required: all three endpoints admitted endorsed by bench-pc; board 2's pinned key replaced by board 1's, quarantined as a substituted key; the record removed, quarantined; the record back, admitted; the board regression 14 of 14 afterwards](/aegis/diagrams/console-endorsed-switch.svg)

On the bench since 20 November for the two STM32s and the RW612, and for the Zynq UltraScale+ since its trusted
application moved to the SDK
([lab 66](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a19-the-trusted-application-on-the-sdk/)).
The record:
[`evidence/endorsed-enrolment/bench/live-switch.txt`](https://github.com/ismailalitech/aegis/blob/main/evidence/endorsed-enrolment/bench/live-switch.txt).

What an endorsement shows is only what the endorser saw: this key answered for this device on this cable at this
time and reported these components. The devices are in their development state, so it does not show that the key
cannot be used by an image someone else built.

## One transcript: the session belongs to the appraised code

The quote and the ML-KEM exchange used to share nothing but the device key. Where one key serves two firmware
images, which is the case on this bench (an STM32 secure image keeps its DHUK-derived key across an upgrade, and the
RW612's two provers derive the same key), the gateway could appraise one image and finish the session with the
other. With `"transcript": "v2"` in the entry, the two are one hash chain
([`docs/architecture.md`](https://github.com/ismailalitech/aegis/blob/main/docs/architecture.md), "One
transcript"):

![Transcript v2: the quote's challenge and token give T1; the endpoint signs its ML-KEM key over T2, which holds T1; the credential names T2 and the session key comes from T3. An image swapped in after the quote cannot continue it](/aegis/diagrams/transcript-v2.svg)

The acceptance test ran on STM32 board 2 on 20 November. The gateway appraised a quote from the transcript image,
then the earlier image, which derives the same device key, was flashed and the board reset:

![transcript_swap_check.py on STM32 board 2: the bound exchange accepted, the same quote twice refused with the session kept, credentials without the transcript refused with -149; after a swap to the earlier image, continuing the recorded quote, another quote for the same challenge and a new cycle are all refused before a credential is sent](/aegis/diagrams/console-transcript-swap.svg)

The refusals in full read "refused: transcript v2 required, but the endpoint answered the unbound exchange: its
ML-KEM key is not tied to the quote just appraised". The records are in
[`evidence/transcript-v2/`](https://github.com/ismailalitech/aegis/tree/main/evidence/transcript-v2); the full
board regression passed 14 of 14 with the transcript required on both STM32s and the RW612.

**What the transcript does not do.** It binds the session to the quote against images that follow the protocol,
including older ones from this repository. It adds nothing against someone who can flash code of their own: such
an image holds the device key and can sign a transcript for a quote it saw. On this bench that is anyone with the
debugger. Closing it needs a device key that depends on the measured code.

## Where to look next

- The labels in a signed result, and how a third party checks one:
  [standard evidence](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x07-standard-evidence/).
- Which threat each mechanism answers:
  [what Aegis defends against](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x04-what-aegis-defends-against/).
