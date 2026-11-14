+++
title = "Cheat sheet: Cortex-M fault registers"
description = "Every fault status bit in one place, with the steps to read a fault. Made to be printed."
weight = 20

[params]
  # Shows a "Print or save as PDF" button under the title.
  print = true
  topics = ["Reference"]
+++

## Reading a fault in five steps

1. Read `HFSR`. If `FORCED` is set, another fault was escalated: the cause is in `CFSR`.
2. Read `CFSR` and split it: bits 7:0 are MemManage, 15:8 are BusFault, 31:16 are UsageFault.
3. If `MMARVALID` or `BFARVALID` is set, read `MMFAR` or `BFAR` for the address that faulted.
4. Find the stacked registers. Bit 2 of `EXC_RETURN` (the value in `LR` on handler entry)
   tells you which stack holds them: 0 means `MSP`, 1 means `PSP`.
5. On Armv8-M with TrustZone, also read `SFSR`, and `SFAR` if `SFARVALID` is set.

## Registers

| Register | Address | Content |
|---|---|---|
| CFSR | `0xE000ED28` | Configurable Fault Status: MMFSR, BFSR and UFSR |
| HFSR | `0xE000ED2C` | HardFault Status |
| MMFAR | `0xE000ED34` | MemManage Fault Address |
| BFAR | `0xE000ED38` | BusFault Address |
| SFSR | `0xE000EDE4` | SecureFault Status (Armv8-M with TrustZone) |
| SFAR | `0xE000EDE8` | SecureFault Address (Armv8-M with TrustZone) |

## Stacked frame

The processor pushes these eight registers on exception entry. Offsets are from the
stack pointer selected in step 4.

| Offset | Register | Use |
|---|---|---|
| `0x00` to `0x0C` | R0 to R3 | Arguments of the interrupted function |
| `0x10` | R12 | |
| `0x14` | LR | Where the interrupted function would have returned |
| `0x18` | PC | The instruction that faulted, for precise faults |
| `0x1C` | xPSR | Program status at the time |

## MemManage: CFSR bits 7:0

| Bit | Name | Meaning |
|---|---|---|
| 0 | IACCVIOL | Instruction fetched from a location that does not allow execution |
| 1 | DACCVIOL | Data read or written at a location the MPU does not allow |
| 3 | MUNSTKERR | Access violation while unstacking on exception return |
| 4 | MSTKERR | Access violation while stacking on exception entry |
| 5 | MLSPERR | Access violation during lazy floating-point state saving |
| 7 | MMARVALID | `MMFAR` holds the faulting address |

## BusFault: CFSR bits 15:8

| Bit | Name | Meaning |
|---|---|---|
| 8 | IBUSERR | Bus error on an instruction fetch |
| 9 | PRECISERR | Bus error on a data access; the stacked PC points to the instruction |
| 10 | IMPRECISERR | Bus error reported after the access; the stacked PC is not the cause |
| 11 | UNSTKERR | Bus error while unstacking on exception return |
| 12 | STKERR | Bus error while stacking on exception entry |
| 13 | LSPERR | Bus error during lazy floating-point state saving |
| 15 | BFARVALID | `BFAR` holds the faulting address |

## UsageFault: CFSR bits 31:16

| Bit | Name | Meaning |
|---|---|---|
| 16 | UNDEFINSTR | Undefined instruction executed |
| 17 | INVSTATE | Invalid execution state, often a branch to an address without the Thumb bit |
| 18 | INVPC | Invalid value loaded into the PC on exception return |
| 19 | NOCP | Coprocessor used while disabled or absent, typically the FPU |
| 20 | STKOF | Stack limit exceeded (Armv8-M Mainline) |
| 24 | UNALIGNED | Unaligned memory access |
| 25 | DIVBYZERO | Division by zero, when that trap is enabled |

## HardFault: HFSR

| Bit | Name | Meaning |
|---|---|---|
| 1 | VECTTBL | Bus error while reading the vector table |
| 30 | FORCED | A configurable fault was escalated to HardFault; read `CFSR` |
| 31 | DEBUGEVT | A debug event occurred while debug was not enabled |

## SecureFault: SFSR (Armv8-M with TrustZone)

| Bit | Name | Meaning |
|---|---|---|
| 0 | INVEP | Invalid entry point: a branch into Secure code that is not a valid gateway |
| 1 | INVIS | Invalid integrity signature in the exception stack frame |
| 2 | INVER | Invalid exception return |
| 3 | AUVIOL | Attribution unit violation: Non-secure access to a Secure address |
| 4 | INVTRAN | Invalid transition from Secure to Non-secure code |
| 5 | LSPERR | Lazy floating-point state preservation error |
| 6 | SFARVALID | `SFAR` holds the faulting address |
| 7 | LSERR | Lazy state error |

## References

- Arm, Armv7-M and Armv8-M Architecture Reference Manuals: [developer.arm.com/documentation](https://developer.arm.com/documentation)
- Interrupt, "How to debug a HardFault on an ARM Cortex-M MCU": [interrupt.memfault.com/blog/cortex-m-fault-debug](https://interrupt.memfault.com/blog/cortex-m-fault-debug)

To decode a value without reading the tables, use the [fault decoder](/resources/fault-decoder/).
