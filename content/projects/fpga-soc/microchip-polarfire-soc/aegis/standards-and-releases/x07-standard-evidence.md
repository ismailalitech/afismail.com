+++
title = "Standard evidence: EAT in COSE with ML-DSA-65, signed results, and a checker without Aegis code"
date = '2026-11-21T09:30:00+01:00'
draft = false
description = "Evidence as an EAT (RFC 9711) in a COSE_Sign1 (RFC 9052) signed with ML-DSA-65 (RFC 9964, algorithm -49); the verifier's decision as a signed attestation result in the EAR format of the IETF drafts; an evidence pack that a third party checks with pycose and OpenSSL alone. Run on STM32 board 2 since 21 November 2026, with what it costs on the gateway and what it does not prove."
weight = 20

[params]
+++

Until Aegis 1.0 every signed object had a format of its own: a quote was a claims map or a PSA token with a detached
ML-DSA-65 signature, an endorsement was canonical JSON, and a verdict was a line in a journal that nobody signed.
Whoever wanted to check any of it needed this project's code. Now the same three statements are standard objects
that anyone reads with a COSE library and a public key
([`docs/evidence-format.md`](https://github.com/ismailalitech/aegis/blob/main/docs/evidence-format.md)):

| Statement | Signed by | Object |
|---|---|---|
| evidence: this device, this software, for this challenge | the device's ML-DSA-65 key | EAT in a COSE_Sign1 |
| attestation result: this verifier appraised it under this policy, with this outcome | the verifier's ML-DSA-65 key | EAR in a COSE_Sign1 |
| endorsement: this key belongs to this device, which reported these components | the endorser's ML-DSA-65 key | CWT with EAT claims in a COSE_Sign1 |

![Standard evidence: the device signs an EAT in a COSE_Sign1 with ML-DSA-65; aegis-fleet appraises it and signs an attestation result; export-evidence writes a pack with the manifest, the evidence, the result and the keys; verify_evidence.py checks it without Aegis code, and the relying party compares the key thumbprints with keys it already trusts](/aegis/diagrams/eat-evidence-path.svg)

## The standards, and which are not standards yet

| What | Document | Used for |
|---|---|---|
| COSE_Sign1 | RFC 9052 | the envelope and the bytes that are signed |
| ML-DSA in COSE | RFC 9964 | algorithm -49 (ML-DSA-65), key type AKP; pure ML-DSA with an empty context |
| ML-DSA | FIPS 204 | public key 1,952 bytes, signature 3,309 bytes, hedged signing |
| Key thumbprint | RFC 9679 | the `kid`: SHA-256 over the COSE key |
| EAT | RFC 9711 | nonce, UEID, profile, measurements, submodules |
| Measured component | RFC 10013 | one entry of `measurements` |
| EAR | `draft-ietf-rats-ear-06` | the attestation result's claims. **An IETF draft** |
| AR4SI | `draft-ietf-rats-ar4si-11` | the status tiers and the trustworthiness vector. **An IETF draft** |

The two drafts can still change their claim numbers and the EAR profile string. They are used through constants in
one place, and a result names the profile it was written to, so a reader built for a later draft refuses these
results instead of misreading them.

## A strict reader

A COSE library accepts more than a verifier should. The reader in `common/cose.py` refuses each thing a hostile
sender could vary:

- the algorithm is read from the protected header only and must be -49; a header that names a classical algorithm
  is a refusal, not a downgrade;
- the unprotected header must be empty: a `kid` or `alg` put there is not ignored, the object is refused;
- the protected header holds exactly `alg`, `kid` and `typ`; an unknown parameter or `crit` is refused;
- `kid` must be the thumbprint of the key the reader already trusts for that role; a key is never taken from the
  object;
- the encoding is deterministic CBOR: re-encoding what was decoded gives the same bytes, so the SHA-256 of a file
  names the object;
- a claim the profile does not list is refused, where RFC 9711 lets a receiver ignore what it does not know: a later
  version must not be able to add a restriction this verifier would silently drop.

The same device key signs the older messages, as a label beginning `aegis-`, a zero byte and the message. A COSE
Sig_structure begins with `"Signature1"`, so no byte string is both, and a signature obtained for one kind is never
valid for the other.

## The device's side

Standard evidence is an option of the
[Prover SDK](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x06-one-prover-sdk/),
`AEGIS_EAT_COSE`, off by default. Built without it the core compiles to the same object code as before; the golden
traces show no difference. With it the device answers `PQEAT <challenge>` with an EAT.

There are two shapes of evidence. A device whose secure world reports its own components puts them in
`measurements`. The STM32 already has a signed token from its platform, TF-M's PSA token with an ES256 signature, so
its EAT nests that token whole as the submodule `platform`: the ML-DSA-65 signature covers it, and the verifier
checks both signatures and both nonces.

### On STM32 board 2

The STM32 partition answers a new PSA message, `QUOTE_EAT` (type 7), when built with the option, and its non-secure
prover forwards `PQEAT`. The images built on 21 November 2026:

| Image | Measurement | Cost |
|---|---|---|
| secure, `tfm-s-v2.3.0-aegis-pq-sdk2-eat.hex` | SPE `315dcc2f...`, the same signer as the image before | secure RAM +736 bytes, secure code +1,440 bytes; the deepest stack path unchanged, 18,704 bytes by GCC's figures |
| non-secure, `prover-ns-0.6.0-eat.hex` | NSPE `acf8fc53...` | |

The object is made in the partition's credential buffer, which is used only during a key exchange, so no buffer was
added; the largest EAT is 4,124 bytes. Built without the option from the same source, the secure image is byte for
byte the one running before.

Board 2 has run these images since 21 November 2026, its policy entry asking for `"evidence_format": "eat-cose-v1"`,
and its evidence pack verifies with the standalone checker. Because the gateway runs from a
[signed policy](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x08-a-signed-audit-log-and-a-signed-policy/)
and the board's key is [endorsed](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x05-trust-labels-endorsement-transcript/),
the switch took four steps: a new policy version allowing the new SPE and NSPE, both slots written (refused as "not the
endorsed one" until the next step, as expected), the new image endorsed, and a policy version with the new pin and
the old values removed. The steps and the rollback are in
[`endpoints/stm32h573/README.md`](https://github.com/ismailalitech/aegis/blob/main/endpoints/stm32h573/README.md).
The RW612 and the Zynq UltraScale+ images are built without the option.

## The attestation result

For each verdict the verifier can sign an EAR with its identity key: on for an entry with standard evidence, or for
every entry with `"attestation_results": true` in the policy. On the bench gateway results are kept for every
endpoint since Aegis 1.1.

How a verdict becomes a status, from `common/eat.py`:

| Trustworthiness claim | Value | When |
|---|---|---|
| instance identity | 2 (affirming) | the key is endorsed by an endorser the policy trusts |
| | -33 | the key is pinned without an endorsement |
| | -34 | a development profile whose key is the same on every chip |
| executables | 3 (affirming) | every component allowed, measured by an earlier boot stage or the secure world |
| | -35 | the same, but measured by the measured software itself |
| | 33 | a component not allowed, or not the endorsed one |

The status is **affirming** only if the endpoint is admitted, every value is affirming and the verdict carries no
warning; **warning** if it is admitted otherwise; **contraindicated** if evidence was appraised and the endpoint is
not admitted; **incomplete** if there was nothing to appraise. It is never better than the verdict, and a reader
refuses a result whose status and `aegis.admitted` disagree in either direction. -33 to -35 are in the range AR4SI
leaves to non-standard reasons; to a generic AR4SI reader they mean only "warning".

The result also carries what a later reader needs to tie it to everything else: the policy's hash as an `ni` URI,
the evidence's SHA-256, the quote hash that the
[transcript](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x05-trust-labels-endorsement-transcript/)
binds the session to, the device key's hash, the trust label, the enrolment and the session binding.

## The pack and the checker

```sh
fleet.py export-evidence fleet.json <endpoint> --out DIR
pip install pycose==1.1.0 'cbor2<6' cryptography
tools/verify_evidence.py pack DIR --verifier-key <thumbprint> --endorser-key <thumbprint> --device-key <thumbprint>
```

The pack holds a manifest (each file's SHA-256, the policy's hash, the result's status, the key thumbprints), the
evidence, the result, the endorsement if there is one, and the keys as COSE key files. `tools/verify_evidence.py`
imports nothing of the Aegis repository: its claim numbers were written from the format document. pycose has no
ML-DSA, so the checker registers algorithm -49 through pycose's own extension point and gives the verification to
OpenSSL 3.5. It checks every file against the manifest, each signature under its key, and that the three objects
speak of the same device, key, nonce, quote, measurements and policy. A run on the simulated device's pack, and the
same pack with one bit flipped, is in
[lab 67](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/a20-attest-a-device-without-hardware/).

What it does not do, and says in its report: without the thumbprints on the command line it marks each key `NOT
CHECKED`, because the keys in a pack are there for convenience; it does not check the ES256 signature inside a nested
PSA token (the verifier does); and it does not judge the policy. A result says what one verifier decided, as
trustworthy as that verifier's key and policy.

## What it costs on the gateway

Measured on the bench gateway on 21 November 2026 with standard results on STM32 board 2: each cycle rewrites three
files in place, `evidence.cbor` 4,048 bytes, `result.cbor` 4,529 bytes and `meta.json` 440 bytes. That is about 9 KB
a cycle, about 23 MB of writes a day and 8 GB a year per endpoint, with no growth in size. The gateway's kernel has no
per-process write counter, so these are file sizes and cycle counts, not measured flash writes
([`docs/audit-and-policy.md`](https://github.com/ismailalitech/aegis/blob/main/docs/audit-and-policy.md),
"Measured on the bench").

## Since 1.2

[Aegis 1.2](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x10-aegis-1-2/), on the bench gateway since 21 November 2026, adds to the pack and the result:

- `manifest.cose`, the verifier's signature over the manifest and the export time. The checker reports the time as
  signed, and `--require-signed-export` refuses a pack without it;
- `aegis.pack-signed` in every result, so a pack whose signature was removed is refused: its signed result says
  there was one;
- the audit log's head when the result was signed (`aegis.audit-log`, `aegis.audit-batch`, `aegis.audit-head`), which
  `tools/verify_audit.py --result` finds in the log;
- `aegis.warnings`, the verdict's warning and the details behind each value of the vector, whatever the status;
- `aegis.min-trust` and `aegis.disabled` for the two new policy keys.

[Pull request 54](https://github.com/ismailalitech/aegis/pull/54), in review, adds JSON Schemas for the manifest,
the state file, the policy, the endorsement record and the signers file; a data-formats reference with every
`aegis.*` claim and its type; and synthetic golden vectors (an evidence pack for every kind, profile and status, a
signed policy, an audit log with an anchor) for programs that read Aegis evidence without running Aegis code.

## Limits

- **EAR and AR4SI are drafts.** Their numbers may change before publication.
- **One board runs it.** STM32 board 2; the other images answer `PQCHAL` only.
- **Reference values are still the policy's allowed list**, named in a result by the policy's hash. A CoRIM would be
  the standard form; it is not part of this work.
- **The device does not carry its endorsement.** A verifier that has never seen the device still needs the record
  from the endorser.
