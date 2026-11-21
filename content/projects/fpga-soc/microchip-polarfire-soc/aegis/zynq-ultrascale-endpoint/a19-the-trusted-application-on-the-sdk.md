+++
title = "The trusted application on the Prover SDK: a bound session and an endorsed key"
date = '2026-11-21T08:50:00+01:00'
draft = false
description = "Rebuild the Zynq UltraScale+ trusted application on the Prover SDK's core, the source the STM32 and RW612 images run, so that the gateway can require transcript v2 and an endorsed key for this board too. Only the TEE partition of the boot image changes; the Windows build PC assembles it, the key stays the same, and the measurements of the encrypted partitions change with every build."
weight = 45

[params]
  lab = 66
  board = "Trenz TE0807 (XCZU4EG) on a TEBF0808 carrier, PolarFire SoC Discovery Kit"
  core = "Cortex-A53 (OP-TEE trusted application), U54 (Linux)"
  level = "Advanced"
+++

After [lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/)
the board was admitted with trustzone trust and a key bound to its PUF, but its session was unbound and its key was
not endorsed. The reason was the trusted application: TA 0.1.1 was built before the
[Prover SDK](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x06-one-prover-sdk/) and does
not speak [transcript v2](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x05-trust-labels-endorsement-transcript/).
TA 0.2.0 is the same application built on the SDK's core. With it the gateway requires `"transcript": "v2"` and
`"endorsement": "required"` for this board, as it already did for the other three.

## Before you start

- Lab 63 done: the board boots the encrypted, PUF-keyed image and is admitted with trustzone trust.
- The OP-TEE 4.7 tree and configuration of the TEE on the card, its TA dev kit, mldsa-native and mlkem-native v2.0.0.
- The Windows build PC of lab 63, which alone holds the red key, with bootgen 2019.1
  ([bootgen 2025.2 and RSA keys](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/k14-bootgen-2025-2-fails-on-rsa-keys/)).
- A microSD reader: JTAG is off with the secure image, so a failed boot is recovered by changing the card.
- The project repository: `endpoints/zynqmp/optee/` and
  [`docs/zynqmp-sdk-port.md`](https://github.com/ismailalitech/aegis/blob/main/docs/zynqmp-sdk-port.md), which has
  every command of this lab.

## What changes on the board, and why the boot image must

| Part | Changes? |
|---|---|
| the TA `b56a99ca-...` | 0.1.1 to 0.2.0: the SDK core, the exchange bound to the quote, KMAC256 heartbeats, the session ended on the secure clock |
| OP-TEE (`tee-raw.bin`, the TEE partition) | only the TA built into it |
| the Linux bridge, FSBL, PMU firmware, bitstream, TF-A, U-Boot, kernel, rootfs | no |
| the identity key | no: it derives from the HUK and the TA's UUID, and neither changes |
| the `TEE` measurement | yes: the FSBL measures the TEE partition, which now holds the new TA |

We would have preferred to change only files on the card's root file system. With this OP-TEE that is not possible
without giving the key away. The TA is an **early TA**, built into OP-TEE, and OP-TEE looks in its early TA store
before the store on the Linux file system, so a `.ta` file with the same UUID would never load. A new TA loaded from
Linux under a new UUID would work, but this OP-TEE checks TA signatures with the public development key: anyone who is
root on Linux could sign their own TA with that UUID and receive the same derived key, the identity seed. The early TA
rules this out. So the TEE partition changes, and with it the boot image.

![Moving to TA 0.2.0: six inputs as before and a new tee-raw.bin go to the Windows build PC, which builds the boot image in boot-header PUF mode; after the card swap the key is the same and the gateway admits the board on the new TEE value with a bound session and an endorsed key](/aegis/diagrams/zynqmp-ta-boot-image.svg)

## Run it

### 1. Build the TA into OP-TEE (Linux PC)

```sh
GATEWAY_PK_HEX=<gateway public key> endpoints/zynqmp/optee/build_optee.sh <OP-TEE tree> <out>
```

The port is `endpoints/zynqmp/optee/ta/aegis_ta.c`, a `struct aegis_platform` for OP-TEE: `TEE_GenerateRandom`, the
counter-based `TEE_GetSystemTime` (no clock, so no session, below protection level 1000), the FSBL's hand-off through
the `aegis.boot` PTA, the profile `aegis-zynqmp-optee-v1` only with a valid hand-off and the PUF black-key flags, and
the seed and exchange root from the system PTA, wiped after start. The verifier key built in is the gateway's, the
same as in TA 0.1.1. A second build of the TA alone gave the same stripped ELF.

| File | Size | sha256 |
|---|---|---|
| `tee-raw.bin`, OP-TEE with TA 0.2.0: the only new input of the boot image | 576,984 | `b7435d9a90fa332b...` |
| the TA as embedded, stripped ELF | 162,664 | `96e10945975f8091...` |

### 2. Test it on the PC

`tests/host/test_zynqmp_ta_port.py` runs the board's bridge and the TA with the SDK core on a stand-in for OP-TEE,
against the gateway's `fleet.py` and the endorser's tool. It checks attestation with the seven partitions, a changed
TEE partition quarantined under the same key, the development profile refused unless allowed, a bound exchange with
heartbeats, a second exchange on the same quote refused with the session kept, the session ended by the TA's clock
(alive at +3800 s, `ERR pq expired` at +3826 s: 3600 s plus a sixteenth), no session on a time of protection level
100, endorsement with `"endorsement": "required"`, and the TA's peak stack within its 64 KiB.
`endpoints/zynqmp/optee/tests/run.sh` checks OP-TEE's real key derivation against Python's HMAC. The SDK's golden
traces show no difference.

### 3. Predict the new measurement

The FSBL measures a partition as the first 32 bytes of SHA3-384 over the partition as stored, so the new value can be
computed before the board runs it:

| Measurement | TA 0.1.1 | TA 0.2.0 |
|---|---|---|
| `TEE` | `5600620f3e1e352b...` (572,888 bytes) | `011989d769a3f8f6...` (576,984 bytes) |

### 4. The boot image (Windows build PC)

The Windows PC takes the six partition inputs of the image on the card and replaces exactly one, `tee-raw.bin`,
checking every input against the earlier image's `SHA256SUMS` first. It builds with the same PUF registration, helper
data and black key as lab 63, in **boot-header PUF mode** only: the key source in the header is the black key,
`0xA35C7C53`, the output holds no key, and nothing is programmed into eFUSEs or OTP. Its sha256 goes to the Linux
session before the file itself. The result was `BOOT.BIN` `e540d774f3ba10d0...`.

### 5. Swap the card, power-cycle, and prove the new boot

Only `BOOT.BIN` on the card's FAT partition changes; the old one is kept beside it for recovery. Then a full power
cycle, not a reboot from Linux. A file's hash proves nothing about what runs; the proof is both of:

- `/proc/sys/kernel/random/boot_id` differs from the value written down before;
- the serial console shows a fresh FSBL banner and OP-TEE built `Fri Nov 20 19:03:12 UTC 2026`, where the old one
  says `Thu Nov 19 13:39:27`, and the TA line ends with `session clock trusted (level 1000)`.

`PQKEY` through the bridge must still give the key `c02f156d...`. The gateway's next cycle quarantines the board,
because `TEE` no longer matches: that is expected until step 6.

### 6. The gateway: the new value, the transcript, the endorsement

1. Set the `TEE` value of the entry to `011989d7...`. Next cycle: admitted with trustzone trust, heartbeats with
   `fw=zynqmp-optee-0.2.0;ttl=...`, the session still unbound.
2. Add `"transcript": "v2"`. The gateway provisions a new session that continues the quote.
3. Endorse the board at the bench (the endorser's key is sealed to the PC's TPM), with a reference that holds only the
   current image's seven components and `--expect-key-sha256` of the known key.
4. Enrol the record on the gateway, then add `"endorsement": "required"` and run `fleet.py check`.

On a gateway that runs from a
[signed policy](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x08-a-signed-audit-log-and-a-signed-policy/),
each policy change is a new signed version instead of an edit.

## What it shows

On the bench on 20 November 2026: after the card swap and a power cycle (`boot_id` changed, a fresh FSBL banner,
the new OP-TEE build date, the TA line with `bh_key_src 0xa35c7c53`), `PQKEY` still gave `c02f156d...`, and the gateway
admitted the board with `fw=zynqmp-optee-0.2.0`, a session bound to the quote, and, after endorsement,
`[endorsed by bench-pc]` with `"endorsement": "required"`. In the
[3-hour soak](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k16-a-soak-that-failed-its-own-clock-estimate/)
that followed, the board was renewed 37 times with no quarantine and no reset, and its console stayed silent.

**Measurements of an encrypted image change on every build.** The FSBL partition, which carries the PMU firmware, is
AES-encrypted with a fresh random IV on each bootgen run, and the measurement hashes the partition as stored. Built
twice from the same inputs, two images have different FSBL and PMUFW values. The pin for a new image must take its
FSBL, PMUFW and TEE values from that image's `measure.json`, and the endorsement reference must hold only the current
image's seven components, not the policy's history of allowed values.

## What it does not show

- The session's end on the TA's own clock was tested on the PC stand-in; the bench's expiry check with a 32-second
  credential is recorded for the two STM32s and the RW612 only.
- The key is the same after the swap by design (the same HUK and UUID) and by `PQKEY`; the stand-in's own key
  derivation is a hash of a seed text, and OP-TEE's real derivation is checked separately against known answers.
- The limits of [lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/)
  stand: the boot ROM does not check who signed the image, the kernel is not measured, and Linux is not yet kept
  away from the device key.

## Where it can go wrong

- **A `.ta` file instead of the boot image.** With the TA built in, OP-TEE never loads a file with the same UUID.
  Changing only the rootfs leaves TA 0.1.1 running.
- **An old pin after a rebuild.** Even with the same inputs, a new boot image has new FSBL and PMUFW values. Take all
  three from the new image's `measure.json`, or the board stays quarantined.
- **An endorsement reference with the policy's history.** The endorser requires the quote to report exactly the
  endorsed components; a reference with old values as well is refused.
- **Proving the boot with a file hash or a short uptime.** Use `boot_id` and the console's build date.
- **Recovery.** If the board does not come up, move the card to a PC and put the kept boot image back. Do not use
  JTAG: it is off with this image.
