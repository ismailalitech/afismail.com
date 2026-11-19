+++
title = "bootgen 2025.2 on Windows failed on every RSA key"
date = '2026-11-19T06:26:00+01:00'
draft = false
description = "The encrypted boot image of the Zynq UltraScale+ endpoint needs a boot-header RSA signature. bootgen 2025.2 on the Windows build PC stopped on every RSA key it read. bootgen 2019.1 on the same PC signed the image, and the result booted and verified."
weight = 63

[params]
+++

Found while building the encrypted boot image of
[lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/). AMD's
documents say PUF regeneration needs an authenticated image, so the boot header carries an RSA-4096 signature, with
the key in the header and not in fuses.

## Symptom

bootgen 2025.2 on the Windows build PC stopped while reading its RSA keys, with:

```text
Failed to calculated montgomery reduction in BN_MONT_CTX_set
```

It did so for every RSA key it was given.

## Fix

The image was signed with bootgen 2019.1 on the same PC. The red key never leaves that PC, so moving the
build elsewhere was not an option. The 2019.1 output was checked like any other:

- the key source in the header is the black key (`0xA35C7C53`), the attributes are as designed, the FSBL and PMU
  firmware are encrypted and the rest is plain;
- the red key does not appear in the image;
- `bootgen -verify`: the header and FSBL signatures verify.

The SHA-256 of the public key, as DER, is recorded in the evidence (`6079924d...`).

## Result

The board booted from the image: `Secure Boot: authenticated, encrypted`, and the FSBL's hand-off reported
`flags=0x7`. The 2025.2 FSBL, PMU firmware and the other partitions run unchanged inside a header written by the
older bootgen.

## What it means for you

- A tool's newest version is not always the one that works. Keep an older one where it can be checked against the
  same output.
- Check a signed image's fields and signatures after any change of tool version, not only that it boots.
