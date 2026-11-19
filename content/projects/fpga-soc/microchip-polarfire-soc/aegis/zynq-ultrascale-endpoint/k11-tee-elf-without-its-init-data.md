+++
title = "tee.elf without its init data: an alignment fault at OP-TEE's start"
date = '2026-11-19T06:20:00+01:00'
draft = false
description = "OP-TEE loaded into the boot image as tee.elf faulted at start-up. Halting the core over JTAG gave the fault and its address. The ELF lacks the init data that OP-TEE's own build appends to tee-raw.bin; loading the raw image fixed it."
weight = 60

[params]
+++

Found while building phase A of the Zynq UltraScale+ endpoint
([lab 62](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a15-optee-holds-the-key/)),
in a JTAG boot into RAM.

## Symptom

With OP-TEE in the boot image as `tee.elf`, loaded at `0x6000_0000`, the boot did not get past OP-TEE's start.

## Finding it

The core was halted over JTAG and its exception registers read:

| Register | Value | Meaning |
|---|---|---|
| `ESR_EL1` | `0x96000021` | a data abort at the same exception level (class `0x25`), fault status `0x21`: an alignment fault |
| Address | `0x60000078` | in `copy_init`, part of OP-TEE's start-up code |

`copy_init` moves OP-TEE's init data into place. It reads the size of that data, `__init_size`, from the word at
`__data_end`. In `tee.elf` that word is past the end of the ELF's file data: OP-TEE's build script `gen_tee_bin`
appends the init data and its size only to `tee-raw.bin`, not to the ELF. Loaded from the ELF, the word read
`0xFFFFFFFF`, and the copy that used it faulted.

## Fix

`boot.bif` loads the raw image and starts it at its load address:

```text
[destination_cpu=a53-0, exception_level=el-1, trustzone, load=0x60000000, startup=0x60000000] tee-raw.bin
```

The comment in `boot.bif` says why, so the ELF does not come back.

## Result

OP-TEE 4.7.0 starts, switches the primary CPU to the normal world, and Linux's `optee` driver finds it. The board was
admitted with trustzone-devkey trust from this image.

## What it means for you

- When bootgen takes an ELF, it loads the ELF's segments and nothing else. If a project's build produces a raw image
  with something appended, the ELF is not the same program.
- A boot that stops with no output is worth a halt over JTAG before any rebuild: the exception syndrome and the
  address point at the function.
